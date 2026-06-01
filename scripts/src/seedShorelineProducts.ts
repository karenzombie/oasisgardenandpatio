/**
 * Seeds Shoreline Craftworks products from the cleaned CSV.
 *
 * Key rules:
 * - No SKU column in CSV → generate "SL-{slug}" as the unique identifier
 * - Images: shoreline_images/{category_dir}/{product_slug}/{product_slug}_hero.png
 * - Specs: Colors/Finishes, Two-Tone Available, Dimensions (built from width/depth/height/seat_height/back_height), Material, Hardware, Notes
 * - All products: quoteOnly=true, showPriceOnline=false ("call for price")
 * - Manufacturer "Shoreline Craftworks" is created if it does not exist
 *
 * Category IDs:
 *   42=Chaise Lounges  43=Deep Seating  44=Dining  45=Fire Tables
 *   46=Coffee & Side Tables  47=Bar  48=Daybeds  49=Accent Pieces
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/seedShorelineProducts.ts
 */
import { readFileSync } from "node:fs";
import { readFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import Papa from "papaparse";
import { eq } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import {
  db,
  manufacturersTable,
  productsTable,
  productImagesTable,
  inventoryTable,
} from "@workspace/db";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const PRODUCTS_CSV = resolve(
  WORKSPACE_ROOT,
  "attached_assets/shoreline_products_clean_1780350601832.csv",
);
const LOGO_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/shoreline-logo_1777762880085.webp",
);
const MANUFACTURER_NAME = "Shoreline Craftworks";
const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "products/shoreline";
const LOCAL_IMAGE_BASE = join(WORKSPACE_ROOT, "shoreline_images");

// ---------------------------------------------------------------------------
// Category resolution
// ---------------------------------------------------------------------------

// CSV category → category ID mapping
const CSV_CATEGORY_MAP: Record<string, number> = {
  "adirondack chairs": 43,       // Deep Seating — closest fit for Adirondack chairs
  "deep seating": 43,
  "chaise lounges": 42,
  "dining tables and chairs": 44,
};

function resolveCategory(csvCategory: string, productName: string): number {
  const cat = csvCategory.toLowerCase().trim();
  const p = productName.toLowerCase();

  // Direct CSV category match
  if (CSV_CATEGORY_MAP[cat] !== undefined) return CSV_CATEGORY_MAP[cat]!;

  // "Stools, Benches, Tables, Spa" — resolve by product name
  if (/\bbench\b/i.test(p)) return 44;                               // Dining bench
  if (/stool/i.test(p)) return 47;                                   // Bar/counter stool
  if (/coffee table|end table|console table|round table|rectangle table|balcony table/i.test(p)) return 46;
  if (/spa/i.test(p)) return 49;                                     // Spa steps / stool / table

  return 46; // default for misc tables
}

// ---------------------------------------------------------------------------
// Object Storage
// ---------------------------------------------------------------------------

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
  } as never,
  projectId: "",
});

async function uploadBuffer(
  buffer: Buffer,
  storageName: string,
  contentType = "image/png",
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${storageName}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucket = storage.bucket(parts[0]);
  const file = bucket.file(parts.slice(1).join("/"));
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${storageName}`;
}

async function fileExists(p: string): Promise<boolean> {
  try { await access(p); return true; } catch { return false; }
}

// ---------------------------------------------------------------------------
// Slug / SKU helpers
// ---------------------------------------------------------------------------

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Convert product name to the snake_case format used in image directory names. */
function toImageSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Convert CSV category to the snake_case directory name used on disk. */
function toCategoryDir(cat: string): string {
  return cat
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function ensureUniqueSlug(base: string, used: Set<string>): string {
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

// ---------------------------------------------------------------------------
// CSV row type
// ---------------------------------------------------------------------------

type ProductRow = {
  category: string;
  product_name: string;
  product_url: string;
  colors_finishes: string;
  two_tone_available: string;
  width: string;
  depth: string;
  height: string;
  seat_height: string;
  back_height: string;
  weight: string;
  material: string;
  hardware: string;
  notes: string;
  raw_description: string;
};

// ---------------------------------------------------------------------------
// Specs builder
// ---------------------------------------------------------------------------

function buildSpecs(row: ProductRow): Record<string, string> {
  const specs: Record<string, string> = {};
  const add = (key: string, val: string | undefined) => {
    const v = val?.trim();
    if (v) specs[key] = v;
  };

  // Colors / finishes
  add("Colors/Finishes", row.colors_finishes);

  // Two-tone option
  if ((row.two_tone_available ?? "").toLowerCase() === "yes") {
    specs["Two-Tone Available"] = "Yes";
  }

  // Dimensions — build a readable string from available fields
  const dimParts: string[] = [];
  if (row.width?.trim()) dimParts.push(`Width: ${row.width.trim()}`);
  if (row.depth?.trim()) dimParts.push(`Depth: ${row.depth.trim()}`);
  if (row.height?.trim()) dimParts.push(`Height: ${row.height.trim()}`);
  if (row.seat_height?.trim()) dimParts.push(`Seat Height: ${row.seat_height.trim()}`);
  if (row.back_height?.trim()) dimParts.push(`Back Height: ${row.back_height.trim()}`);
  if (dimParts.length > 0) specs["Dimensions"] = dimParts.join(" | ");

  add("Weight", row.weight);
  add("Material", row.material);
  add("Hardware", row.hardware);
  add("Notes", row.notes);

  return specs;
}

// ---------------------------------------------------------------------------
// Image upload
// ---------------------------------------------------------------------------

async function uploadProductImage(
  row: ProductRow,
  storageName: string,
): Promise<string | null> {
  const categoryDir = toCategoryDir(row.category);
  const productImgSlug = toImageSlug(row.product_name);
  const localPath = join(
    LOCAL_IMAGE_BASE,
    categoryDir,
    productImgSlug,
    `${productImgSlug}_hero.png`,
  );

  if (await fileExists(localPath)) {
    try {
      const buf = await readFile(localPath);
      return await uploadBuffer(buf, storageName, "image/png");
    } catch (err) {
      console.warn(`    WARN: could not read local image ${localPath}: ${err}`);
    }
  } else {
    console.warn(`    WARN: no image found at ${localPath}`);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Ensure manufacturer exists
// ---------------------------------------------------------------------------

async function ensureManufacturer(): Promise<number> {
  const [existing] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);

  if (existing) {
    console.log(`Manufacturer "${MANUFACTURER_NAME}" exists id=${existing.id}`);
    return existing.id;
  }

  // Upload logo
  let logoUrl: string | null = null;
  try {
    if (await fileExists(LOGO_PATH)) {
      const buf = await readFile(LOGO_PATH);
      const privateDir = process.env.PRIVATE_OBJECT_DIR;
      if (privateDir) {
        const fullPath = `${privateDir.replace(/\/$/, "")}/manufacturers/shoreline-logo.webp`;
        const parts = fullPath.replace(/^\//, "").split("/");
        const bucket = storage.bucket(parts[0]);
        const file = bucket.file(parts.slice(1).join("/"));
        await file.save(buf, { contentType: "image/webp", resumable: false });
        logoUrl = "/objects/manufacturers/shoreline-logo.webp";
        console.log("  Uploaded Shoreline logo");
      }
    }
  } catch (err) {
    console.warn(`  WARN: could not upload logo: ${err}`);
  }

  const [ins] = await db
    .insert(manufacturersTable)
    .values({
      name: MANUFACTURER_NAME,
      slug: "shoreline-craftworks",
      description:
        "Shoreline Craftworks — premium outdoor furniture crafted from durable recycled HDPE poly lumber in a wide range of designer colors and finishes.",
      logoUrl,
      website: "https://www.shorelinecraftworks.com",
      isActive: true,
      displayOrder: 0,
    })
    .returning({ id: manufacturersTable.id });

  console.log(`Created manufacturer "${MANUFACTURER_NAME}" id=${ins.id}`);
  return ins.id;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const manufacturerId = await ensureManufacturer();

  const raw = readFileSync(PRODUCTS_CSV, "utf8");
  const parsed = Papa.parse<ProductRow>(raw, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    console.error("CSV parse errors:", parsed.errors.slice(0, 3));
  }
  console.log(`CSV rows: ${parsed.data.length}`);

  const usedSlugs = new Set<string>();
  const usedSkus = new Set<string>();
  let inserted = 0;
  let updated = 0;
  let imagesUploaded = 0;

  for (const row of parsed.data) {
    const productName = row.product_name?.trim();
    const csvCategory = row.category?.trim();
    if (!productName || !csvCategory) continue;

    const productSlug = toSlug(productName);
    const sku = `SL-${productSlug}`.slice(0, 100);

    // Guard against duplicate SKUs from identical product names
    if (usedSkus.has(sku)) {
      console.warn(`  WARN: duplicate SKU ${sku} for "${productName}" — skipping`);
      continue;
    }
    usedSkus.add(sku);

    const categoryId = resolveCategory(csvCategory, productName);
    const specs = buildSpecs(row);

    const description =
      row.raw_description?.trim() ||
      `${productName} by Shoreline Craftworks. Available in multiple colors and finishes.`;
    const shortDescription = `${productName} — Shoreline Craftworks. Available in ${row.colors_finishes?.split(",").length ?? "multiple"} colors.`;

    const slugBase = toSlug(`${productName}-shoreline`);
    const slug = ensureUniqueSlug(slugBase, usedSlugs);

    // Check existing by SKU
    const [existing] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    let imageStoragePath: string | null = null;
    if (!existing) {
      const storageFilename = `${toImageSlug(productName)}-hero.png`.slice(0, 120);
      imageStoragePath = await uploadProductImage(row, storageFilename);
      if (imageStoragePath) imagesUploaded++;
    }

    if (existing) {
      await db
        .update(productsTable)
        .set({ name: productName, description, shortDescription, specs })
        .where(eq(productsTable.id, existing.id));
      updated++;
      console.log(`  Updated: ${productName} (${csvCategory})`);
    } else {
      const [ins] = await db
        .insert(productsTable)
        .values({
          name: productName,
          slug,
          sku,
          description,
          shortDescription,
          specs,
          manufacturerId,
          categoryId,
          availableOnline: true,
          showPriceOnline: false,
          quoteOnly: true,
          inStoreOnly: false,
          isActive: true,
          featured: false,
          displayOrder: 0,
          lowStockThreshold: 0,
          pricingMode: "fixed",
        })
        .returning({ id: productsTable.id });

      const productId = ins.id;

      await db.insert(inventoryTable).values({
        productId,
        variantId: null,
        onHand: 0,
        reorderThreshold: 0,
      });

      if (imageStoragePath) {
        await db.insert(productImagesTable).values({
          productId,
          variantId: null,
          url: imageStoragePath,
          altText: productName,
          displayOrder: 0,
          isPrimary: true,
          imageKind: "gallery",
        });
      }

      inserted++;
      console.log(`  Inserted: ${productName} (${csvCategory}) sku=${sku}`);
    }
  }

  console.log(
    `\nDone. inserted=${inserted} updated=${updated} | images uploaded=${imagesUploaded}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
