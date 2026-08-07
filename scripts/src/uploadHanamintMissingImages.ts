/**
 * Upload missing Hanamint product images from Hanamint_Missing_8-5/.
 * Files are named {SKU}.png (some with a trailing space before ext).
 * Uploaded flat to /objects/products/hanamint/{sku}.png
 * Skips files whose SKU has no matching product in the DB.
 */
import { readFile } from "fs/promises";
import { readdirSync } from "fs";
import path from "path";
import { Storage } from "@google-cloud/storage";
import { db, productsTable, productImagesTable } from "@workspace/db";
import { inArray, eq } from "drizzle-orm";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const IMAGE_DIR = "/home/runner/workspace/Hanamint_Missing_8-5";
const MANUFACTURER_ID = 15;

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
    universe_domain: "googleapis.com",
  } as never,
  projectId: "",
});

function parseObjectPath(fullPath: string) {
  const parts = fullPath.replace(/^\//, "").split("/");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function uploadImage(
  buffer: Buffer,
  sku: string,
  ext: string,
  contentType: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const filename = `${sku}${ext}`;
  const fullPath = `${privateDir.replace(/\/$/, "")}/products/hanamint/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/products/hanamint/${filename}`;
}

// Build mapping: trimmed SKU → filename in folder
const fileMap = new Map<string, string>();
for (const f of readdirSync(IMAGE_DIR)) {
  const ext = path.extname(f).toLowerCase();
  if (![".png", ".jpg", ".jpeg"].includes(ext)) continue;
  const sku = path.basename(f, ext).trim();
  fileMap.set(sku, f);
}
console.log(`Found ${fileMap.size} image files in folder.`);

// Fetch all matching products for manufacturer 15
const skusFromFiles = [...fileMap.keys()];
const dbRows = await db
  .select({ id: productsTable.id, sku: productsTable.sku })
  .from(productsTable)
  .where(
    inArray(productsTable.sku, skusFromFiles)
  );

// Only process products that also belong to manufacturer 15 (double-check)
const allMfgRows = await db
  .select({ id: productsTable.id, sku: productsTable.sku })
  .from(productsTable)
  .where(eq(productsTable.manufacturerId, MANUFACTURER_ID));
const mfgSkuSet = new Set(allMfgRows.map((r) => r.sku));

const productMap = new Map(
  dbRows.filter((r) => mfgSkuSet.has(r.sku)).map((r) => [r.sku, r.id])
);
console.log(`Matched ${productMap.size}/${skusFromFiles.length} files to Hanamint products.`);

// Warn about files with no DB match
for (const sku of skusFromFiles) {
  if (!productMap.has(sku)) {
    console.warn(`  ✗ [${sku}] — no matching Hanamint product in DB, skipping`);
  }
}

// Remove pre-existing image rows for matched products (idempotent)
const productIds = [...productMap.values()];
if (productIds.length) {
  await db
    .delete(productImagesTable)
    .where(inArray(productImagesTable.productId, productIds));
  console.log(`Removed pre-existing image rows for ${productIds.length} products.`);
}

let uploaded = 0;
for (const [sku, filename] of fileMap.entries()) {
  const productId = productMap.get(sku);
  if (!productId) continue;

  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  const buffer = await readFile(path.join(IMAGE_DIR, filename));
  const url = await uploadImage(buffer, sku, ext, contentType);

  await db.insert(productImagesTable).values({
    productId,
    url,
    altText: null,
    isPrimary: true,
    displayOrder: 0,
    imageKind: "gallery",
  });

  console.log(`  ✓ [${sku}] → ${url}`);
  uploaded++;
}

console.log(`\nDone. Uploaded and linked ${uploaded} images.`);
process.exit(0);
