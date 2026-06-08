/**
 * Seed Summerset Casual products from CSV + local images.
 *
 * Images live at: summerset_images/{CollectionFolder}/{SKU_sanitized}.{ext}
 * Multi-image products: {SKU}.jpg (primary) + {SKU}_1.jpg, {SKU}_2.jpg …
 * All products: quoteOnly=true (call for pricing), showPriceOnline=false.
 * Dimensions stored exactly as given in CSV (not parsed into W/D/H).
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed-summerset-products
 */

import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, join, extname } from "node:path";
import Papa from "papaparse";
import { eq } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import {
  db,
  productsTable,
  productImagesTable,
  inventoryTable,
} from "@workspace/db";
import { firstParagraph } from "./firstParagraph";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const CSV_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/summerset_products_1780109395654.csv",
);
const LOCAL_IMAGE_DIR = join(WORKSPACE_ROOT, "summerset_images");
const MANUFACTURER_ID = 20; // Summerset (slug: summerset)
const STORAGE_SUBDIR = "products/summerset";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// SKUs to skip — placeholder rows in the CSV
const SKIP_SKUS = new Set(["MISC", "FabricSwatch"]);

// ---------------------------------------------------------------------------
// Collection → local image folder
// ---------------------------------------------------------------------------

const COLLECTION_FOLDER: Record<string, string> = {
  aeros: "Aeros",
  alexis: "Alexis",
  ariana: "Ariana",
  athena: "Athena",
  "athena dark": "Athena_Dark",
  aztec: "Aztec",
  jolee: "Jolee",
  jollee: "Jolee",
  "jolee white wash": "Jolee_White_Wash",
  "la flamme": "La_Flamme",
  mirabella: "Mirabella",
  sahara: "Sahara",
  trinity: "Trinity",
  wicker: "Wicker",
};

function collectionFolder(collection: string): string {
  return COLLECTION_FOLDER[collection.trim().toLowerCase()] ?? "Other";
}

// ---------------------------------------------------------------------------
// Object Storage
// ---------------------------------------------------------------------------

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
  } as never,
  projectId: "",
});

function parseObjectPath(fullPath: string) {
  const parts = fullPath.replace(/^\//, "").split("/");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function uploadBuffer(
  buffer: Buffer,
  contentType: string,
  storageFilename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${storageFilename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${storageFilename}`;
}

// ---------------------------------------------------------------------------
// Slug / filename helpers
// ---------------------------------------------------------------------------

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Sanitize SKU for use as a storage filename / path segment.
 * Spaces → underscores (matches on-disk naming convention).
 */
function sanitizeSku(sku: string): string {
  return sku.replace(/ /g, "_");
}

function ensureUniqueSlug(base: string, used: Set<string>): string {
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${n++}`;
  }
  used.add(slug);
  return slug;
}

function contentType(filename: string): string {
  const ext = extname(filename).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  return "image/jpeg";
}

// ---------------------------------------------------------------------------
// Image discovery
//
// Strategy:
//   1. Look in the collection folder (e.g. summerset_images/Aeros/)
//   2. Fall back to summerset_images/Other/
//
// Primary image:  {sanitizedSku}.{ext}
// Additional:     {sanitizedSku}_1.{ext}, _2, _3 … (up to _20)
// ---------------------------------------------------------------------------

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp"];

function findInDir(dir: string, stem: string): string | null {
  for (const ext of IMAGE_EXTS) {
    const p = join(dir, `${stem}${ext}`);
    if (existsSync(p)) return p;
  }
  return null;
}

interface DiscoveredImages {
  primary: string | null;
  additional: string[];
}

function discoverImages(collection: string, sku: string): DiscoveredImages {
  const safeSku = sanitizeSku(sku);
  const primaryFolder = join(LOCAL_IMAGE_DIR, collectionFolder(collection));
  const otherFolder = join(LOCAL_IMAGE_DIR, "Other");

  // Look for primary in collection folder, then Other
  let primary =
    findInDir(primaryFolder, safeSku) ?? findInDir(otherFolder, safeSku);

  // Additional images: {safeSku}_1, _2, … (look in same folder as primary)
  const additional: string[] = [];
  const searchDirs =
    primary !== null
      ? [primaryFolder, otherFolder].filter((d) => existsSync(d))
      : [];

  for (let i = 1; i <= 20; i++) {
    const stem = `${safeSku}_${i}`;
    let found: string | null = null;
    for (const dir of searchDirs) {
      found = findInDir(dir, stem);
      if (found) break;
    }
    if (!found) break; // stop at first gap
    additional.push(found);
  }

  return { primary, additional };
}

// ---------------------------------------------------------------------------
// CSV row shape
// ---------------------------------------------------------------------------

type CsvRow = {
  name: string;
  sku: string;
  collection: string;
  product_type: string;
  price: string;
  product_dimension: string;
  shipping_dimension: string;
  net_weight: string;
  gross_weight: string;
  qty_per_carton: string;
  color: string;
  frame_type: string;
  cushion_info: string;
  description: string;
  tags: string;
  image_url: string;
  all_image_urls: string;
  url: string;
};

// ---------------------------------------------------------------------------
// Build structured specs from weight/shipping columns
// ---------------------------------------------------------------------------

function buildSpecs(row: CsvRow): Record<string, string> | null {
  const specs: Record<string, string> = {};
  if (row.color?.trim()) specs["Color"] = row.color.trim();
  if (row.frame_type?.trim()) specs["Frame Type"] = row.frame_type.trim();
  if (row.cushion_info?.trim()) specs["Cushion"] = row.cushion_info.trim();
  if (row.shipping_dimension?.trim())
    specs["Shipping Dimension"] = row.shipping_dimension.trim();
  if (row.net_weight?.trim()) specs["Net Weight"] = row.net_weight.trim();
  if (row.gross_weight?.trim()) specs["Gross Weight"] = row.gross_weight.trim();
  if (row.qty_per_carton?.trim()) specs["Qty/Carton"] = row.qty_per_carton.trim();
  return Object.keys(specs).length > 0 ? specs : null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const { data, errors } = Papa.parse<CsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length > 0) throw new Error(`CSV parse: ${JSON.stringify(errors[0])}`);

  const rows = data.filter(
    (r) => r.name?.trim() && r.sku?.trim() && !SKIP_SKUS.has(r.sku.trim()),
  );
  console.log(`CSV rows to process: ${rows.length}`);

  // Pre-load used slugs for deduplication
  const usedSlugs = new Set<string>();
  const existing = await db
    .select({ slug: productsTable.slug })
    .from(productsTable);
  for (const { slug } of existing) usedSlugs.add(slug);

  let inserted = 0;
  let updated = 0;
  let imagesUploaded = 0;
  let imagesMissing = 0;

  for (const row of rows) {
    const name = row.name.trim();
    const sku = row.sku.trim();
    const collection = row.collection.trim();

    // Description: use as-is from CSV
    const description = row.description?.trim() || null;
    // Short description: first sentence / up to 250 chars
    const shortDescription = description ? firstParagraph(description) : null;

    // Dimensions: store exactly as given (do not parse)
    const dimensions = row.product_dimension?.trim() || null;

    // Tags
    const csvTags = row.tags?.trim()
      ? row.tags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

    // Specs
    const specs = buildSpecs(row);

    // Check existing product
    const [existingProduct] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    // Check existing images
    const existingImageCount = existingProduct
      ? (
          await db
            .select({ id: productImagesTable.id })
            .from(productImagesTable)
            .where(eq(productImagesTable.productId, existingProduct.id))
        ).length
      : 0;

    // Discover local images
    const { primary: primaryPath, additional: additionalPaths } =
      discoverImages(collection, sku);

    // Upload images if not already done for this product
    const allPaths = primaryPath
      ? [primaryPath, ...additionalPaths]
      : additionalPaths;

    interface UploadedImage {
      storageUrl: string;
      displayOrder: number;
      isPrimary: boolean;
    }

    const uploadedImages: UploadedImage[] = [];

    if (existingImageCount === 0 && allPaths.length > 0) {
      const safeSku = sanitizeSku(sku);
      for (let idx = 0; idx < allPaths.length; idx++) {
        const localPath = allPaths[idx];
        const ext = extname(localPath).toLowerCase().replace(".", "");
        const isPrimary = idx === 0;
        // Filename: {safeSku}.jpg for primary, {safeSku}_N.jpg for additional
        // Preserve the actual suffix from disk so filenames are predictable
        const diskFilename = localPath.split("/").pop()!;
        const storageFilename = diskFilename; // keep as-is (e.g. AZABS_1.jpg)
        // Override primary filename to be the base sku name
        const finalFilename = isPrimary
          ? `${safeSku}.${ext}`
          : storageFilename;
        try {
          const buffer = await readFile(localPath);
          const ct = contentType(localPath);
          const storageUrl = await uploadBuffer(buffer, ct, finalFilename);
          uploadedImages.push({
            storageUrl,
            displayOrder: idx,
            isPrimary,
          });
          imagesUploaded++;
          if (isPrimary) console.log(`  ✓ ${sku} → ${finalFilename} + ${additionalPaths.length} more`);
        } catch (err) {
          console.error(`  ✗ upload error ${finalFilename}:`, err);
        }
      }
    } else if (existingImageCount === 0 && allPaths.length === 0) {
      if (!existingProduct) {
        console.warn(`  ⚠ no images: ${sku} [${collection}]`);
        imagesMissing++;
      }
    }

    if (existingProduct) {
      // Update non-destructive fields
      await db
        .update(productsTable)
        .set({
          name,
          description,
          shortDescription,
          dimensions,
          ...(specs ? { specs } : {}),
          ...(csvTags.length > 0 ? { tags: csvTags } : {}),
        })
        .where(eq(productsTable.sku, sku));
      updated++;

      // Attach newly uploaded images if product existed but had no images
      if (uploadedImages.length > 0 && existingImageCount === 0) {
        for (const img of uploadedImages) {
          await db
            .insert(productImagesTable)
            .values({
              productId: existingProduct.id,
              variantId: null,
              url: img.storageUrl,
              altText: name,
              displayOrder: img.displayOrder,
              isPrimary: img.isPrimary,
              imageKind: "gallery",
            })
            .onConflictDoNothing();
        }
      }
    } else {
      // New product
      const baseSlug = ensureUniqueSlug(toSlug(name) + "-sm", usedSlugs);

      const [ins] = await db
        .insert(productsTable)
        .values({
          name,
          slug: baseSlug,
          sku,
          description,
          shortDescription,
          manufacturerId: MANUFACTURER_ID,
          categoryId: null,
          dimensions,
          specs: specs ?? undefined,
          tags: csvTags.length > 0 ? csvTags : [],
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

      // Inventory row (no variants)
      await db.insert(inventoryTable).values({
        productId,
        variantId: null,
        onHand: 0,
        reorderThreshold: 0,
      });

      // Product images
      for (const img of uploadedImages) {
        await db
          .insert(productImagesTable)
          .values({
            productId,
            variantId: null,
            url: img.storageUrl,
            altText: name,
            displayOrder: img.displayOrder,
            isPrimary: img.isPrimary,
            imageKind: "gallery",
          })
          .onConflictDoNothing();
      }

      inserted++;
    }
  }

  console.log(
    `\nDone.\n` +
      `  Products inserted : ${inserted}\n` +
      `  Products updated  : ${updated}\n` +
      `  Images uploaded   : ${imagesUploaded}\n` +
      `  Products w/o image: ${imagesMissing}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
