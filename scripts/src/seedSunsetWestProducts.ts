/**
 * Seeds Sunset West products from the 2026 product listing CSV.
 *
 * Key rules:
 * - One product per CSV row; SKU column is the unique identifier
 * - Images: try local sunset_west_images/{Image Filename} first,
 *   then download from Image URL if available
 * - Specs: Dimensions, Material, Frame Finish (if present), Notes (if present)
 * - All products: quoteOnly=true, showPriceOnline=false ("call for price")
 * - Finishes are manufacturer-level reference — NO product_finish_options rows
 * - Manufacturer "Sunset West" is created if it does not exist
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/seedSunsetWestProducts.ts
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
  "attached_assets/Sunset_West_2026_Product_Listing_1780345346210.csv",
);
const LOGO_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/sunset-west-logo_1777762880085.jpeg",
);
const MANUFACTURER_NAME = "Sunset West";
const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "products/sunset-west";
const LOCAL_IMAGE_BASE = join(WORKSPACE_ROOT, "sunset_west_images");

// ---------------------------------------------------------------------------
// Category IDs
// 42=Chaise Lounges  43=Deep Seating  44=Dining  45=Fire Tables
// 46=Coffee & Side Tables  47=Bar  48=Daybeds  49=Accent Pieces
// ---------------------------------------------------------------------------

function resolveCategory(productName: string, collection: string): number {
  const p = productName.toLowerCase();
  const c = collection.toLowerCase();

  // Fire tables collection / fire items
  if (c === "fire tables" || /fire table|fire bowl|fire pit/i.test(p)) return 45;

  // Accessories & accent pieces
  if (/glass surround|tank cover|pergola|bookcase|pouf|pillow|lumbar/i.test(p)) return 49;

  // Chaise lounges
  if (/chaise/i.test(p)) return 42;

  // Daybeds
  if (/\bdaybed\b/i.test(p)) return 48;

  // Bar / pub items
  if (/bar stool|counter stool|barstool|pub table|bistro table/i.test(p)) return 47;

  // Dining (chairs, tables, benches)
  if (/dining chair|dining bench|dining table|armless dining|swivel dining|trestle table|\bbnch\b|\bbench\b/i.test(p)) return 44;
  // Dimension-prefixed dining tables e.g. "50" Round Dining Table"
  if (/\b\d+['"].*dining|\bround dining|\bsquare dining|\brectangular dining/i.test(p)) return 44;

  // Coffee & Side Tables
  if (/coffee table|end table|side table|console table|sofa table/i.test(p)) return 46;

  // Default: Deep Seating
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
  storageName: string,
  contentType = "image/jpeg",
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
// Slug helpers
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
// Specs builder
// ---------------------------------------------------------------------------

type ProductRow = {
  Collection: string;
  "Color Story": string;
  "Product Name": string;
  SKU: string;
  Dimensions: string;
  Material: string;
  "Finish/Frame Finish": string;
  Notes: string;
  "Image Filename": string;
  "Image URL": string;
  "Image Available": string;
  "Finish Image Filename": string;
  "Finish Image Available": string;
};

function buildSpecs(row: ProductRow): Record<string, string> {
  const specs: Record<string, string> = {};
  const add = (key: string, val: string | undefined) => {
    const v = val?.trim();
    if (v) specs[key] = v;
  };
  add("Dimensions", row.Dimensions);
  add("Material", row.Material);
  add("Frame Finish", row["Finish/Frame Finish"]);
  add("Notes", row.Notes);
  return specs;
}

// ---------------------------------------------------------------------------
// Image upload: local first, fallback to URL download
// ---------------------------------------------------------------------------

async function uploadProductImage(
  row: ProductRow,
  storageName: string,
): Promise<string | null> {
  const localFilename = row["Image Filename"]?.trim();
  const imageAvailable = (row["Image Available"]?.trim() ?? "").toLowerCase() === "yes";
  const imageUrl = row["Image URL"]?.trim();

  // Try local file first
  if (imageAvailable && localFilename) {
    const localPath = join(LOCAL_IMAGE_BASE, localFilename);
    try {
      if (await fileExists(localPath)) {
        const buf = await readFile(localPath);
        return await uploadBuffer(buf, storageName, "image/jpeg");
      }
    } catch (err) {
      console.warn(`    WARN: could not read local image ${localPath}: ${err}`);
    }
  }

  // Fallback: download from web URL
  if (imageUrl) {
    try {
      const buf = await fetchBuffer(imageUrl);
      return await uploadBuffer(buf, storageName, "image/jpeg");
    } catch (err) {
      console.warn(`    WARN: could not download image for ${row["Product Name"]}: ${err}`);
    }
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
        const fullPath = `${privateDir.replace(/\/$/, "")}/manufacturers/sunset-west-logo.jpeg`;
        const parts = fullPath.replace(/^\//, "").split("/");
        const bucket = storage.bucket(parts[0]);
        const file = bucket.file(parts.slice(1).join("/"));
        await file.save(buf, { contentType: "image/jpeg", resumable: false });
        logoUrl = "/objects/manufacturers/sunset-west-logo.jpeg";
        console.log("  Uploaded Sunset West logo");
      }
    }
  } catch (err) {
    console.warn(`  WARN: could not upload logo: ${err}`);
  }

  const [ins] = await db
    .insert(manufacturersTable)
    .values({
      name: MANUFACTURER_NAME,
      slug: "sunset-west",
      description: "Sunset West Outdoor Furniture — premium outdoor living collections featuring deep seating, dining, teak, fire tables, and accessories.",
      logoUrl,
      website: "https://www.sunsetwestoutdoor.com",
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
  let inserted = 0;
  let updated = 0;
  let imagesUploaded = 0;

  for (const row of parsed.data) {
    const productName = row["Product Name"]?.trim();
    const collection = row.Collection?.trim();
    const sku = row.SKU?.trim();
    if (!productName || !sku) continue;

    const categoryId = resolveCategory(productName, collection ?? "");
    const specs = buildSpecs(row);
    const notes = row.Notes?.trim();
    const description = notes
      ? `${productName} — ${collection} collection. ${notes}.`
      : `${productName} — Sunset West ${collection} collection.`;
    const shortDescription = `${productName} — Sunset West ${collection} collection.`;

    const slugBase = toSlug(`${productName}-${collection}-sunset-west`);
    const slug = ensureUniqueSlug(slugBase, usedSlugs);

    // Check existing by SKU
    const [existing] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    let imageStoragePath: string | null = null;
    if (!existing) {
      const storageFilename = `${toSlug(collection ?? "sw")}-${toSlug(productName)}.jpg`.slice(0, 120);
      imageStoragePath = await uploadProductImage(row, storageFilename);
      if (imageStoragePath) imagesUploaded++;
    }

    if (existing) {
      await db
        .update(productsTable)
        .set({
          name: productName,
          description,
          shortDescription,
          specs,
        })
        .where(eq(productsTable.id, existing.id));
      updated++;
      console.log(`  Updated: ${productName} (${collection}) sku=${sku}`);
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

      // Inventory row
      await db.insert(inventoryTable).values({
        productId,
        variantId: null,
        onHand: 0,
        reorderThreshold: 0,
      });

      // Primary image
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
