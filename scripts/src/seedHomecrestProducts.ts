/**
 * Seeds Homecrest products from the master CSV.
 *
 * Key rules:
 * - One product per CSV row; SKU = first value in Product SKU(s) column
 * - Images: try local homecrest_images/{Collection}/{filename} first,
 *   then download from Product Image URL
 * - Specs in products.specs JSON (not description) — description comes from CSV
 * - All products: quoteOnly=true, availableOnline=true, inStoreOnly=false
 * - Finishes are manufacturer-level reference — NO product_finish_options rows
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/seedHomecrestProducts.ts
 */
import { readFileSync } from "node:fs";
import { readFile, access } from "node:fs/promises";
import * as https from "node:https";
import * as http from "node:http";
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
  "attached_assets/homecrest_products_1780295516945.csv",
);
const MANUFACTURER_NAME = "Homecrest";
const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "products/homecrest";
const LOCAL_IMAGE_BASE = join(WORKSPACE_ROOT, "homecrest_images");

// ---------------------------------------------------------------------------
// Category mapping
// 38=Umbrellas 39=Umbrella Bases 40=Lighting 41=Replacement Parts
// 42=Chaise Lounges 43=Deep Seating 44=Dining 45=Fire Tables
// 46=Coffee & Side Tables 47=Bar 48=Daybeds 49=Accent Pieces
// ---------------------------------------------------------------------------

function resolveCategory(csvCategory: string, collection: string, productName: string): number {
  const cat = csvCategory.toLowerCase();
  const col = collection.toLowerCase();
  const prod = productName.toLowerCase();

  if (cat === "fire tables" || /fire table/i.test(col)) return 45;

  if (cat === "tables") {
    if (/bar table/i.test(prod)) return 47;
    if (/balcony table/i.test(prod)) return 47;
    if (/dining table/i.test(prod)) return 44;
    // side, end, coffee, top-only, chat table, adjustable, bases → Coffee & Side
    return 46;
  }

  // Seating
  if (/chaise/i.test(prod)) return 42;
  if (/bar stool/i.test(prod)) return 47;
  if (/balcony stool/i.test(prod)) return 47;
  if (/dining chair/i.test(prod)) return 44;
  // chat chair, sofa, loveseat, ottoman, rocker, glider → Deep Seating
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

async function uploadBuffer(buffer: Buffer, storageName: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${storageName}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucket = storage.bucket(parts[0]);
  const file = bucket.file(parts.slice(1).join("/"));
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${storageName}`;
}

function fetchBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith("https") ? https : http;
    mod.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fetchBuffer(res.headers.location).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    }).on("error", reject);
  });
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

function ensureUniqueSlug(base: string, used: Set<string>): string {
  let slug = base;
  let n = 2;
  while (used.has(slug)) slug = `${base}-${n++}`;
  used.add(slug);
  return slug;
}

// ---------------------------------------------------------------------------
// Specs JSON builder from CSV dimension columns
// ---------------------------------------------------------------------------

type ProductRow = {
  Collection: string;
  Category: string;
  Material: string;
  "Product Name": string;
  "Product SKU(s)": string;
  "Seating Type": string;
  Height: string;
  Width: string;
  Depth: string;
  Length: string;
  "Seat Height": string;
  "Arm Height": string;
  Weight: string;
  Description: string;
  "Product Image URL": string;
  "Product URL": string;
};

function buildSpecs(row: ProductRow): Record<string, string> | null {
  const specs: Record<string, string> = {};

  const add = (key: string, val: string | undefined) => {
    const v = val?.trim().replace(/^"(.*)"$/, "$1");
    if (v) specs[key] = v;
  };

  add("Height", row.Height);
  add("Width", row.Width);
  add("Depth", row.Depth);
  add("Length", row.Length);
  add("Seat Height", row["Seat Height"]);
  add("Arm Height", row["Arm Height"]);
  add("Weight", row.Weight ? `${row.Weight} lbs` : "");
  add("Material", row.Material);

  return Object.keys(specs).length > 0 ? specs : null;
}

// ---------------------------------------------------------------------------
// Image upload: local first, fallback to web download
// ---------------------------------------------------------------------------

async function uploadProductImage(
  row: ProductRow,
  storageName: string,
): Promise<string | null> {
  const imgUrl = row["Product Image URL"]?.trim();
  if (!imgUrl) return null;

  const filename = imgUrl.split("/").pop() ?? "";
  const localPath = join(LOCAL_IMAGE_BASE, row.Collection, filename);

  try {
    if (await fileExists(localPath)) {
      const buf = await readFile(localPath);
      return await uploadBuffer(buf, storageName);
    }
    // Fallback: download from web
    const buf = await fetchBuffer(imgUrl);
    return await uploadBuffer(buf, storageName);
  } catch (err) {
    console.warn(`    WARN: could not get image for ${row["Product Name"]}: ${err}`);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Extract primary SKU from "Product SKU(s)" field
// E.g. "7237A-DC; 7237A-UC" → "7237A-DC"
// ---------------------------------------------------------------------------

function parsePrimarySku(raw: string): string {
  return raw.split(";")[0].trim();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const raw = readFileSync(PRODUCTS_CSV, "utf8");
  const parsed = Papa.parse<ProductRow>(raw, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    console.error("CSV parse errors:", parsed.errors.slice(0, 3));
  }
  console.log(`CSV rows: ${parsed.data.length}`);

  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);
  if (!mfg) throw new Error(`Manufacturer "${MANUFACTURER_NAME}" not found`);
  console.log(`Found manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);

  const usedSlugs = new Set<string>();
  let inserted = 0;
  let updated = 0;
  let imagesUploaded = 0;

  for (const row of parsed.data) {
    const productName = row["Product Name"]?.trim();
    const collection = row.Collection?.trim();
    const csvCategory = row.Category?.trim();
    if (!productName || !collection) continue;

    const sku = parsePrimarySku(row["Product SKU(s)"] ?? "");
    if (!sku) continue;

    const categoryId = resolveCategory(csvCategory, collection, productName);
    const specs = buildSpecs(row);

    // Use description from CSV (truncate if very long)
    const description = row.Description?.trim().replace(/\s+/g, " ") || null;
    const shortDescription = `${productName} — Homecrest ${collection} collection.`;

    const slugBase = toSlug(`${productName}-${collection}-homecrest`);
    const slug = ensureUniqueSlug(slugBase, usedSlugs);

    // Check existing by SKU + manufacturer
    const [existing] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    let imageUrl: string | null = null;
    if (!existing) {
      const storageName = `${toSlug(collection)}-${toSlug(productName)}.jpg`.slice(0, 120);
      imageUrl = await uploadProductImage(row, storageName);
      if (imageUrl) imagesUploaded++;
    }

    let productId: number;

    if (existing) {
      await db
        .update(productsTable)
        .set({
          name: productName,
          description: description ?? undefined,
          specs: specs ?? undefined,
        })
        .where(eq(productsTable.id, existing.id));
      productId = existing.id;
      updated++;
      console.log(`  Updated: ${productName} (${collection}) sku=${sku}`);
    } else {
      const [ins] = await db
        .insert(productsTable)
        .values({
          name: productName,
          slug,
          sku,
          description: description ?? undefined,
          shortDescription,
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

      // Inventory row
      await db.insert(inventoryTable).values({
        productId,
        variantId: null,
        onHand: 0,
        reorderThreshold: 0,
      });

      // Primary image
      if (imageUrl) {
        await db.insert(productImagesTable).values({
          productId,
          variantId: null,
          url: imageUrl,
          altText: productName,
          displayOrder: 0,
          isPrimary: true,
          imageKind: "gallery",
        });
      }

      inserted++;
      console.log(`  Inserted: ${productName} (${collection}) sku=${sku}`);
    }
  }

  console.log(
    `\nDone. inserted=${inserted} updated=${updated} | images uploaded=${imagesUploaded}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
