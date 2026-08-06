/**
 * Upload 4 missing OW Lee product images from attached_assets/.
 * Files follow the owlee-v2 flat path convention:
 *   /objects/products/owlee-v2/{filename}
 */
import { readFile } from "fs/promises";
import path from "path";
import { Storage } from "@google-cloud/storage";
import { db, productsTable, productImagesTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const ASSETS_DIR = "/home/runner/workspace/attached_assets";

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
  filename: string,
  contentType: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/products/owlee-v2/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/products/owlee-v2/${filename}`;
}

// Map SKU → source file in attached_assets (with timestamp suffix)
const SKU_FILES: { sku: string; sourceFile: string }[] = [
  { sku: "QD-4587DTU", sourceFile: "QD-4587DTU_1785975984887.png" },
  { sku: "QD-3375DTU", sourceFile: "QD-3375DTU_1785975984887.png" },
  { sku: "QD-2157CT",  sourceFile: "QD-2157CT_1785975984887.jpg"  },
  { sku: "5122-4272D", sourceFile: "5122-4272D_1785975984887.png" },
];

// Destination filenames mirror the owlee-v2 naming style (just SKU + ext)
function destFilename(sku: string, ext: string) {
  return `${sku}${ext}`;
}

const skus = SKU_FILES.map((e) => e.sku);

// Fetch product IDs
const rows = await db
  .select({ id: productsTable.id, sku: productsTable.sku })
  .from(productsTable)
  .where(inArray(productsTable.sku, skus));

const productMap = new Map(rows.map((r) => [r.sku, r.id]));
console.log(`Found ${productMap.size}/${skus.length} products in DB`);

// Remove any pre-existing image rows (idempotent)
const productIds = [...productMap.values()];
if (productIds.length) {
  const deleted = await db
    .delete(productImagesTable)
    .where(inArray(productImagesTable.productId, productIds));
  console.log(`Removed pre-existing image rows.`);
}

const inserted: { sku: string; url: string }[] = [];

for (const { sku, sourceFile } of SKU_FILES) {
  const productId = productMap.get(sku);
  if (!productId) {
    console.warn(`  ✗ [${sku}] not found in DB — skipping`);
    continue;
  }

  const sourcePath = path.join(ASSETS_DIR, sourceFile);
  const ext = path.extname(sourceFile).toLowerCase();
  const contentType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "image/png";
  const dest = destFilename(sku, ext);

  const buffer = await readFile(sourcePath);
  const url = await uploadImage(buffer, dest, contentType);
  console.log(`  ✓ [${sku}] → ${url}`);

  await db.insert(productImagesTable).values({
    productId,
    url,
    altText: null,
    isPrimary: true,
    sortOrder: 0,
  });

  inserted.push({ sku, url });
}

console.log(`\nDone. Uploaded and linked ${inserted.length} images.`);
process.exit(0);
