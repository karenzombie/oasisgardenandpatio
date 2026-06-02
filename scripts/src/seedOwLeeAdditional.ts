/**
 * Idempotent loader for the additional O.W. Lee product drop.
 *
 * Source CSV:  attached_assets/additional_owlee_products_remaining_*.csv
 * Source imgs: <repo root>/additional_owlee_images/
 *              Files named: "{COLLECTION} - {PRODUCT NAME}.jpg" (all-caps, stripped special chars)
 *
 * Per CSV row this script:
 *   - Skips rows whose SKU already exists in DB (idempotent)
 *   - Skips explicit exclusions: 5150-36RDC (Basso), PA-DT07 (Parsons — keep PENDING),
 *     Phoenix/Volante SKU collisions, and Modern Aluminum 10 no-SKU row
 *   - For "REVIEW - No SKU found" rows: derives SKU from product name (strips inch marks)
 *   - Upserts product (quoteOnly=true, showPriceOnline=false, inStoreOnly=true)
 *   - Inserts a null-variant inventory row (0 on-hand) if none exists
 *   - Resolves the matching image file by normalizing collection+name → filename
 *   - Uploads image to Object Storage → /objects/products/owlee/{filename}
 *   - Upserts product_images row
 *
 * Usage:  pnpm --filter @workspace/scripts run seed-ow-lee-additional
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { eq, sql, and } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import {
  db,
  manufacturersTable,
  categoriesTable,
  productsTable,
  productImagesTable,
  inventoryTable,
} from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, "../../attached_assets");
const IMAGES_DIR = resolve(__dirname, "../../additional_owlee_images");

const OW_LEE_SLUG = "o-w-lee";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const objectStorage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  } as never,
  projectId: "",
});

// ── Exclusion rules (per user direction) ─────────────────────────────────────

/** SKUs to skip regardless of anything else. */
const SKIP_SKUS = new Set([
  "5150-36RDC", // Basso — user said skip for now
  "PA-DT07",   // Parsons — keep existing PENDING record in DB
]);

/**
 * (COLLECTION_UPPER|sku) combos to skip.
 * These SKUs already exist in DB under a different collection name.
 */
const SKIP_COLLECTION_SKU = new Set([
  "VOLANTE|5113-42RDC", // DB has this SKU as Phoenix
  "VOLANTE|5113-42RDO", // DB has this SKU as Phoenix
  "PHOENIX|5123-42RDO", // DB has this SKU as Volante
]);

/** No-SKU product names to skip (user said leave existing DB data). */
const SKIP_NO_SKU_NAMES = new Set(["Modern Aluminum 10 Dining Table Base"]);

// ── CSV types ─────────────────────────────────────────────────────────────────

type CsvRow = {
  Collection: string;
  "Product Name": string;
  SKU: string;
  "Height (in)": string;
  "Width/Diam (in)": string;
  "Depth/Length (in)": string;
  "Arm Height (in)": string;
  "Seat Height (in)": string;
  "Weight (lbs)": string;
  "Spec Sheet PDF URL": string;
  "Source URL": string;
  "SKU Flag": string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function findLatestCsv(prefix: string): string {
  const matches = readdirSync(ASSETS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".csv"))
    .sort();
  if (matches.length === 0) throw new Error(`No CSV found with prefix ${prefix}`);
  return join(ASSETS_DIR, matches[matches.length - 1]!);
}

function parseCsv(path: string): CsvRow[] {
  const text = readFileSync(path, "utf8");
  const r = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (r.errors.length > 0) {
    console.warn("CSV parse warnings:", r.errors);
  }
  return r.data;
}

function slugify(s: string): string {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function clean(v: string | undefined | null): string {
  return (v ?? "").trim();
}

/**
 * Normalize a string for image filename matching:
 *   - uppercase
 *   - remove inch marks (", ", "), periods, commas, ampersands
 *   - collapse whitespace
 */
function normalizeForFilename(s: string): string {
  return s
    .toUpperCase()
    .replace(/["\u201c\u201d]/g, "") // straight and curly inch/quote marks
    .replace(/\./g, "")              // periods (e.g. "Rd.")
    .replace(/[,&]/g, "")            // commas and ampersands
    .replace(/\s+/g, " ")
    .trim();
}

/** Find the image file path for a given collection + product name. */
function findImagePath(collection: string, productName: string): string | null {
  const collKey = normalizeForFilename(collection);
  const nameKey = normalizeForFilename(productName);
  const filename = `${collKey} - ${nameKey}.jpg`;
  const fullPath = join(IMAGES_DIR, filename);
  if (existsSync(fullPath)) return fullPath;
  console.warn(`  ! Image not found: ${filename}`);
  return null;
}

/** Categorize an OW Lee product by collection + product name. */
function categorize(collection: string, productName: string): string {
  const combined = `${collection} ${productName}`.toLowerCase();
  if (combined.includes("fire pit")) return "cat-fire-tables";
  // Standalone side tables (not table bases)
  if (combined.includes("side table") && !combined.includes("base")) {
    return "cat-coffee-side-tables";
  }
  // Occasional tables (not fire pits)
  if (combined.includes("occasional table") && !combined.includes("fire")) {
    return "cat-coffee-side-tables";
  }
  // Everything else table-related
  return "cat-dining";
}

function buildSpecs(r: CsvRow): Record<string, string> {
  const out: Record<string, string> = {};
  const add = (k: string, v: string) => {
    const t = clean(v);
    if (t) out[k] = t;
  };
  add("collection", r.Collection);
  add("height_in", r["Height (in)"]);
  add("width_diameter_in", r["Width/Diam (in)"]);
  add("depth_length_in", r["Depth/Length (in)"]);
  add("arm_height_in", r["Arm Height (in)"]);
  add("seat_height_in", r["Seat Height (in)"]);
  add("weight_lbs", r["Weight (lbs)"]);
  add("spec_sheet_pdf", r["Spec Sheet PDF URL"]);
  add("source_url", r["Source URL"]);
  return out;
}

function buildDimensions(r: CsvRow): string | null {
  const bits: string[] = [];
  if (clean(r["Height (in)"])) bits.push(`H ${clean(r["Height (in)"])}"`);
  if (clean(r["Width/Diam (in)"])) bits.push(`W ${clean(r["Width/Diam (in)"])}"`);
  if (clean(r["Depth/Length (in)"])) bits.push(`D ${clean(r["Depth/Length (in)"])}"`);
  return bits.length > 0 ? bits.join(" × ") : null;
}

// ── Object storage ─────────────────────────────────────────────────────────────

function parsePrivateDir(): { bucket: string; prefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR env var not set");
  const trimmed = dir.startsWith("/") ? dir.slice(1) : dir;
  const slash = trimmed.indexOf("/");
  if (slash === -1) return { bucket: trimmed, prefix: "" };
  return { bucket: trimmed.slice(0, slash), prefix: trimmed.slice(slash + 1) };
}

async function uploadImage(
  localPath: string,
  safeFilename: string,
  bucketName: string,
  prefix: string,
): Promise<string> {
  const bucket = objectStorage.bucket(bucketName);
  const objectName = prefix
    ? `${prefix}/products/owlee/${safeFilename}`
    : `products/owlee/${safeFilename}`;
  const buffer = await readFile(localPath);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/products/owlee/${safeFilename}`;
}

// ── Main ───────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("== Seeding additional O.W. Lee products ==\n");

  const csvPath = findLatestCsv("additional_owlee_products_remaining_");
  console.log(`CSV: ${csvPath}`);
  const rows = parseCsv(csvPath);
  console.log(`Parsed ${rows.length} rows\n`);

  // Lookup manufacturer
  const [mfr] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.slug, OW_LEE_SLUG))
    .limit(1);
  if (!mfr) throw new Error(`Manufacturer "${OW_LEE_SLUG}" not found`);
  const manufacturerId = mfr.id;

  // Cache category ids
  const requiredSlugs = [
    "cat-fire-tables",
    "cat-dining",
    "cat-coffee-side-tables",
    "cat-deep-seating",
    "cat-chaise-lounges",
  ] as const;
  const catMap = new Map<string, number>();
  for (const slug of requiredSlugs) {
    const [row] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.slug, slug))
      .limit(1);
    if (!row) throw new Error(`Category "${slug}" not found`);
    catMap.set(slug, row.id);
  }

  const { bucket: bucketName, prefix } = parsePrivateDir();

  let created = 0;
  let skipped = 0;
  let imagesUploaded = 0;
  let imagesMissing = 0;

  for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
    const r = rows[rowIdx]!;
    const collection = clean(r.Collection);
    const productName = clean(r["Product Name"]);
    const isNoSku = clean(r["SKU Flag"]).toLowerCase().includes("review");

    // Derive SKU
    let sku = clean(r.SKU);
    if (!sku) {
      if (isNoSku) {
        if (SKIP_NO_SKU_NAMES.has(productName)) {
          console.log(`  [${rowIdx + 1}] SKIP (no-SKU exclusion): ${productName}`);
          skipped++;
          continue;
        }
        // Use product name as SKU (strip inch marks)
        sku = productName.replace(/"/g, "").trim();
      } else {
        console.log(`  [${rowIdx + 1}] SKIP (empty SKU, non-REVIEW row): ${productName}`);
        skipped++;
        continue;
      }
    }

    // Explicit SKU exclusions
    if (SKIP_SKUS.has(sku)) {
      console.log(`  [${rowIdx + 1}] SKIP (explicit exclusion): ${sku}`);
      skipped++;
      continue;
    }

    // Collection+SKU collision exclusions
    const collSkuKey = `${collection.toUpperCase()}|${sku}`;
    if (SKIP_COLLECTION_SKU.has(collSkuKey)) {
      console.log(`  [${rowIdx + 1}] SKIP (collection/SKU conflict): ${collection} / ${sku}`);
      skipped++;
      continue;
    }

    // Check if SKU already exists in DB
    const existing = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);
    if (existing[0]) {
      console.log(`  [${rowIdx + 1}] SKIP (already in DB): ${sku}`);
      skipped++;
      continue;
    }

    // Build product fields
    const categorySlug = categorize(collection, productName);
    const categoryId = catMap.get(categorySlug)!;
    const slug = slugify(`owlee-${productName}-${sku}`);
    const specs = buildSpecs(r);
    const dimensions = buildDimensions(r);
    const weight = clean(r["Weight (lbs)"]);
    const weightNum = weight && /^[\d.]+$/.test(weight) ? weight : null;
    const shortDescription = `${collection} collection · ${productName} by O.W. Lee`;
    const description =
      `Part of the O.W. Lee ${collection} collection. Crafted in the USA, ` +
      `O.W. Lee pieces are built to order and sold exclusively through ` +
      `our showroom — contact a sales agent for pricing, finishes, and cushion options.`;
    const tags = ["o-w-lee", slugify(collection), "made-in-usa", "quote-only"];

    // Insert product
    const [inserted] = await db
      .insert(productsTable)
      .values({
        name: productName,
        slug,
        sku,
        shortDescription,
        description,
        dimensions,
        weight: weightNum,
        specs,
        tags,
        manufacturerId,
        categoryId,
        displayOrder: rowIdx,
        showPriceOnline: false,
        availableOnline: true,
        inStoreOnly: true,
        quoteOnly: true,
        featured: false,
        lowStockThreshold: 0,
        isActive: true,
      })
      .returning({ id: productsTable.id });
    if (!inserted) throw new Error(`Failed to insert product ${sku}`);
    const productId = inserted.id;
    created++;

    // Insert null-variant inventory row
    await db.insert(inventoryTable).values({
      productId,
      variantId: null,
      onHand: 0,
      onHold: 0,
      reorderThreshold: 0,
    });

    // Find and upload image
    const imagePath = findImagePath(collection, productName);
    if (!imagePath) {
      imagesMissing++;
    } else {
      // Safe filename: use the basename of the matched file
      const { basename } = await import("node:path");
      const safeFilename = basename(imagePath);
      try {
        const storedUrl = await uploadImage(imagePath, safeFilename, bucketName, prefix);
        await db
          .insert(productImagesTable)
          .values({
            productId,
            url: storedUrl,
            altText: productName,
            isPrimary: true,
            displayOrder: 0,
            imageKind: "gallery",
          })
          .onConflictDoUpdate({
            target: [productImagesTable.productId, productImagesTable.url],
            set: { isPrimary: true, displayOrder: 0, altText: productName },
          });
        imagesUploaded++;
      } catch (err) {
        console.error(`  ERROR uploading image for ${sku}:`, err);
        imagesMissing++;
      }
    }

    console.log(`  [${rowIdx + 1}] CREATED: ${sku} — "${productName}" (cat: ${categorySlug})`);
  }

  console.log("\n== Summary ==");
  console.log(`  products created: ${created}`);
  console.log(`  rows skipped:     ${skipped}`);
  console.log(`  images uploaded:  ${imagesUploaded}`);
  console.log(`  images missing:   ${imagesMissing}`);

  // Verification count
  const verify = await db.execute(sql`
    SELECT
      (SELECT COUNT(*)::int FROM products WHERE manufacturer_id = ${manufacturerId}) AS total_ow_lee_products,
      (SELECT COUNT(*)::int FROM product_images pi
        JOIN products p ON p.id = pi.product_id
        WHERE p.manufacturer_id = ${manufacturerId}) AS total_images
  `);
  console.log("\n== DB Verification ==");
  console.log(verify.rows[0]);

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
