/**
 * Seeds Telescope Casual products from the master product CSV.
 *
 * Key rules:
 * - One product per CSV row (product_name + collection_name = unique product)
 * - Images from telescope_images/{collection_dir}/{product_dir}/product_N.jpg
 *   (strip leading "images/" from the CSV image_path column)
 * - Specs go into the structured products.specs JSON column (not description)
 * - All products: quoteOnly=true, availableOnline=true, inStoreOnly=false
 * - Finishes are manufacturer-level reference — NO product_finish_options rows
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/seedTelescopeProducts.ts
 */
import { readFileSync } from "node:fs";
import { readFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import Papa from "papaparse";
import { eq, and } from "drizzle-orm";
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
  "attached_assets/telescope_product_master_1780290799274.csv",
);
const MANUFACTURER_NAME = "Telescope Casual";
const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "products/telescope";
const LOCAL_IMAGE_BASE = join(WORKSPACE_ROOT, "telescope_images");

// ---------------------------------------------------------------------------
// Category mapping
// Maps collection_name / product_name keywords to category IDs
// ---------------------------------------------------------------------------
// 38 = Umbrellas, 39 = Umbrella Bases, 40 = Lighting, 41 = Replacement Parts
// 42 = Chaise Lounges, 43 = Deep Seating, 44 = Dining, 45 = Fire Tables
// 46 = Coffee & Side Tables, 47 = Bar, 48 = Daybeds, 49 = Accent Pieces

function resolveCategory(collectionName: string, productName: string): number {
  const col = collectionName.toLowerCase();
  const prod = productName.toLowerCase();

  // Accessories / covers / trash → Replacement Parts
  if (/(accessories|covers|trash|towel|receptacle|director chair)/i.test(col)) return 41;
  // Fire tables
  if (/fire table|fire/i.test(col)) return 45;
  // Umbrellas
  if (/umbrella/i.test(col)) return 38;
  // Umbrella bases
  if (/base/i.test(col) && /umbrella/i.test(col)) return 39;
  // Chaise (collection or product)
  if (/chaise/i.test(col) || /chaise/i.test(prod)) return 42;
  // Bar-height products
  if (/bar height|bar-height/i.test(prod)) return 47;
  // Tables: route by product name
  if (/table/i.test(col)) {
    if (/bar/i.test(prod)) return 47;
    if (/dining/i.test(prod)) return 44;
    if (/side|end|coffee/i.test(prod)) return 46;
    return 46; // default table → Coffee & Side Tables
  }
  // Dining-height chairs
  if (/dining/i.test(prod) && /(chair|stool)/i.test(prod)) return 44;
  // Picnic tables
  if (/picnic/i.test(col)) return 44;
  // Deep seating default
  return 43;
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
  contentType: string,
  storageName: string,
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
// Slug & SKU helpers
// ---------------------------------------------------------------------------

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeSku(collectionName: string, productName: string): string {
  // Keep it under 60 chars total; truncate slug segments
  const col = toSlug(collectionName).slice(0, 20);
  const prod = toSlug(productName).slice(0, 25);
  return `TC-${col}-${prod}`;
}

function ensureUniqueSlug(base: string, used: Set<string>): string {
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

// ---------------------------------------------------------------------------
// Specs JSON builder
// ---------------------------------------------------------------------------

type ProductRow = {
  item_number: string;
  product_name: string;
  collection_name: string;
  image_count: string;
  overall_width: string;
  overall_depth: string;
  overall_height: string;
  diameter: string;
  product_weight: string;
  seat_height: string;
  arm_height: string;
  reclined_length: string;
  retail_warranty: string;
  contract_warranty: string;
  image_1_path: string;
  image_1_url: string;
  image_2_path: string;
  image_2_url: string;
  image_3_path: string;
  image_3_url: string;
  image_4_path: string;
  image_4_url: string;
};

function buildSpecs(row: ProductRow): Record<string, string> | null {
  const specs: Record<string, string> = {};

  const add = (key: string, val: string | undefined) => {
    const v = val?.trim().replace(/^"(.*)"$/, "$1");
    if (v) specs[key] = v;
  };

  add("Width", row.overall_width);
  add("Depth", row.overall_depth);
  add("Height", row.overall_height);
  add("Diameter", row.diameter);
  add("Weight", row.product_weight);
  add("Seat Height", row.seat_height);
  add("Arm Height", row.arm_height);
  add("Reclined Length", row.reclined_length);
  add("Retail Warranty", row.retail_warranty);
  add("Contract Warranty", row.contract_warranty);

  return Object.keys(specs).length > 0 ? specs : null;
}

// ---------------------------------------------------------------------------
// Image upload for a product row
// ---------------------------------------------------------------------------

async function uploadProductImages(
  row: ProductRow,
  productSlug: string,
): Promise<{ url: string; isPrimary: boolean }[]> {
  const results: { url: string; isPrimary: boolean }[] = [];
  const imageCount = parseInt(row.image_count ?? "0", 10) || 0;

  const paths = [
    row.image_1_path,
    row.image_2_path,
    row.image_3_path,
    row.image_4_path,
  ].filter(Boolean);

  for (let i = 0; i < Math.min(imageCount, paths.length); i++) {
    // CSV path: "images/collection/product/product_N.jpg"
    // Local path: telescope_images/collection/product/product_N.jpg
    const csvPath = paths[i]?.trim();
    if (!csvPath) continue;

    const localRelative = csvPath.replace(/^images\//, "");
    const localFull = join(LOCAL_IMAGE_BASE, localRelative);

    if (!(await fileExists(localFull))) {
      console.warn(`    WARN: image not found: ${localFull}`);
      continue;
    }

    try {
      const buffer = await readFile(localFull);
      const ext = localFull.toLowerCase().endsWith(".png") ? "png" : "jpg";
      const storageName = `${productSlug}-${i + 1}.${ext}`;
      const url = await uploadBuffer(buffer, ext === "png" ? "image/png" : "image/jpeg", storageName);
      results.push({ url, isPrimary: i === 0 });
    } catch (err) {
      console.error(`    ERROR uploading image ${i + 1} for ${row.product_name}:`, err);
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const raw = readFileSync(PRODUCTS_CSV, "utf8");
  const parsed = Papa.parse<ProductRow>(raw, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    console.error("CSV parse errors:", parsed.errors.slice(0, 5));
    throw new Error("CSV parse failed");
  }
  console.log(`CSV rows: ${parsed.data.length}`);

  // Resolve manufacturer
  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);
  if (!mfg) throw new Error(`Manufacturer "${MANUFACTURER_NAME}" not found`);
  console.log(`Found manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);

  const usedSlugs = new Set<string>();
  const usedSkus = new Set<string>();
  let inserted = 0;
  let updated = 0;
  let skipped = 0;
  let imagesUploaded = 0;

  for (const row of parsed.data) {
    const productName = row.product_name?.trim();
    const collectionName = row.collection_name?.trim();

    if (!productName || !collectionName) { skipped++; continue; }

    const categoryId = resolveCategory(collectionName, productName);
    const specs = buildSpecs(row);
    const description = `Part of Telescope Casual's ${collectionName} collection. Available in Powdercoat and MGP frame finishes — contact our showroom for current pricing and finish options.`;

    // Derive stable SKU (collection+product combo)
    let sku = makeSku(collectionName, productName);
    // Handle rare SKU collisions (duplicate product_name in same collection)
    if (usedSkus.has(sku)) {
      let n = 2;
      while (usedSkus.has(`${sku}-${n}`)) n++;
      sku = `${sku}-${n}`;
    }
    usedSkus.add(sku);

    const slugBase = toSlug(`${productName}-${collectionName}-telescope`);
    const slug = ensureUniqueSlug(slugBase, usedSlugs);

    // Check for existing product
    const [existing] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    // Upload images (only for new products)
    let uploadedImages: { url: string; isPrimary: boolean }[] = [];
    if (!existing) {
      uploadedImages = await uploadProductImages(row, toSlug(`${productName}-${collectionName}`));
      imagesUploaded += uploadedImages.length;
    }

    let productId: number;

    if (existing) {
      await db
        .update(productsTable)
        .set({ name: productName, description, specs: specs ?? undefined })
        .where(eq(productsTable.id, existing.id));
      productId = existing.id;
      updated++;
      console.log(`  Updated: ${productName} (${collectionName})`);
    } else {
      const [ins] = await db
        .insert(productsTable)
        .values({
          name: productName,
          slug,
          sku,
          description,
          shortDescription: `${productName} — Telescope Casual ${collectionName} collection.`,
          specs: specs ?? undefined,
          manufacturerId: mfg.id,
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
      productId = ins.id;
      inserted++;
      console.log(`  Inserted: ${productName} (${collectionName}) → sku=${sku}`);

      // Inventory row (no variants)
      await db.insert(inventoryTable).values({
        productId,
        variantId: null,
        onHand: 0,
        reorderThreshold: 0,
      });

      // Register images
      for (let i = 0; i < uploadedImages.length; i++) {
        const { url, isPrimary } = uploadedImages[i];
        await db.insert(productImagesTable).values({
          productId,
          variantId: null,
          url,
          altText: productName,
          displayOrder: i,
          isPrimary,
          imageKind: "gallery",
        });
      }
    }
  }

  console.log(
    `\nDone. inserted=${inserted} updated=${updated} skipped=${skipped} | images uploaded=${imagesUploaded}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
