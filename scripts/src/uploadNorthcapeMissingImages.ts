/**
 * Upload missing NorthCape product images from Northcape_Missing_8-5/.
 * Files are named {SKU}.png or {SKU}.jpg (some with a trailing space before ext).
 * Each image is uploaded as the primary (and only) image for its product.
 * Skips any product that already has images.
 */
import { readFile } from "fs/promises";
import { readdirSync } from "fs";
import path from "path";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { productImagesTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const IMAGE_DIR = "/home/runner/workspace/Northcape_Missing_8-5";

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
  filename: string,
  contentType: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/products/northcape/${sku}/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/products/northcape/${sku}/${filename}`;
}

// Build mapping: SKU (trimmed) → filename in folder
const fileMap = new Map<string, string>();
for (const f of readdirSync(IMAGE_DIR)) {
  const ext = path.extname(f).toLowerCase();
  if (![".png", ".jpg", ".jpeg"].includes(ext)) continue;
  const sku = path.basename(f, ext).trim(); // trim trailing spaces
  fileMap.set(sku, f);
}

// All 63 product assignments (sku → productId) from DB match
const assignments: Array<{ sku: string; productId: number }> = [
  { sku: "NC2001CUB-MED", productId: 5295 },
  { sku: "NC2001CUBE-SM", productId: 5296 },
  { sku: "NC2001OT-SQ", productId: 5294 },
  { sku: "NC26763S", productId: 5512 },
  { sku: "NC2676C", productId: 5514 },
  { sku: "NC2676LL", productId: 5517 },
  { sku: "NC2676LS", productId: 5513 },
  { sku: "NC2676RL", productId: 5518 },
  { sku: "NC2676SCC", productId: 5519 },
  { sku: "NC2676SCM", productId: 5516 },
  { sku: "NC2676SR", productId: 5515 },
  { sku: "NC2685BS-CH", productId: 5291 },
  { sku: "NC2685CH33-SQ-DRB", productId: 5287 },
  { sku: "NC2685CH41-SQ-DRB", productId: 5288 },
  { sku: "NC2685CH72-REC-DRB", productId: 5289 },
  { sku: "NC2685DLS", productId: 5292 },
  { sku: "NC2685DT33-SQ-DRB-DH", productId: 5283 },
  { sku: "NC2685DT41-SQ-DRB-DH", productId: 5284 },
  { sku: "NC2685DT72-REC-DRB-DH", productId: 5285 },
  { sku: "NC2685DT83-REC-DRB-DH", productId: 5286 },
  { sku: "NC2685SACL", productId: 5293 },
  { sku: "NC2685SWDC", productId: 5290 },
  { sku: "NC53063S", productId: 5297 },
  { sku: "NC5306C", productId: 5299 },
  { sku: "NC5306CT-REC", productId: 5303 },
  { sku: "NC5306CT-SQ", productId: 5304 },
  { sku: "NC5306ET-SQ", productId: 5302 },
  { sku: "NC5306LL", productId: 5306 },
  { sku: "NC5306LS", productId: 5298 },
  { sku: "NC5306O-SQ", productId: 5301 },
  { sku: "NC5306RL", productId: 5307 },
  { sku: "NC5306SCC-90", productId: 5308 },
  { sku: "NC5306SCM", productId: 5305 },
  { sku: "NC5306SG", productId: 5300 },
  { sku: "NC5319R-42-TAN", productId: 5536 },
  { sku: "NC5319RCT-48-TAN", productId: 5537 },
  { sku: "NC64003S-TAN", productId: 5260 },
  { sku: "NC6400C-TAN", productId: 5263 },
  { sku: "NC6400CET-TAN", productId: 5271 },
  { sku: "NC6400CT-TAN", productId: 5264 },
  { sku: "NC6400LL-TAN", productId: 5267 },
  { sku: "NC6400LS-TAN", productId: 5261 },
  { sku: "NC6400NET-TAN", productId: 5265 },
  { sku: "NC6400O-REC-TAN", productId: 5266 },
  { sku: "NC6400RL-TAN", productId: 5268 },
  { sku: "NC6400SCC-TAN", productId: 5270 },
  { sku: "NC6400SCM", productId: 5269 },
  { sku: "NC6400SR-TAN", productId: 5262 },
  { sku: "NC6500LL-TAN", productId: 5509 },
  { sku: "NC6500RL-TAN", productId: 5510 },
  { sku: "NC6500SCC-TAN", productId: 5511 },
  { sku: "NC6500SCM", productId: 5508 },
  { sku: "NC66003S", productId: 5520 },
  { sku: "NC6600C", productId: 5522 },
  { sku: "NC6600LL", productId: 5524 },
  { sku: "NC6600LS", productId: 5521 },
  { sku: "NC6600RL", productId: 5525 },
  { sku: "NC6600SR", productId: 5523 },
  { sku: "NC6701-LS", productId: 5528 },
  { sku: "NC6701-RET", productId: 5532 },
  { sku: "NC6701C", productId: 5529 },
  { sku: "NC6701RCT", productId: 5533 },
  { sku: "NC674013S", productId: 5527 },
];

async function main() {
  console.log(`Processing ${assignments.length} products…\n`);

  const uploadedPaths = new Map<number, string>(); // productId → /objects path
  const errors: string[] = [];

  for (const { sku, productId } of assignments) {
    const filename = fileMap.get(sku);
    if (!filename) {
      console.warn(`  WARN [${sku}] no file found in folder — skipping`);
      errors.push(sku);
      continue;
    }
    const ext = path.extname(filename).toLowerCase();
    const contentType = ext === ".png" ? "image/png" : "image/jpeg";
    const localPath = path.join(IMAGE_DIR, filename);
    try {
      const buffer = await readFile(localPath);
      // Normalize filename: strip trailing space from base name
      const cleanFilename = sku + ext;
      const storagePath = await uploadImage(buffer, sku, cleanFilename, contentType);
      uploadedPaths.set(productId, storagePath);
      console.log(`  ✓ [${sku}] → ${storagePath}`);
    } catch (err) {
      console.error(`  ✗ ERROR [${sku}]:`, err);
      errors.push(sku);
    }
  }

  console.log(`\nUploaded ${uploadedPaths.size} images. Inserting DB rows…`);

  const productIds = [...uploadedPaths.keys()];
  if (productIds.length === 0) {
    console.error("Nothing uploaded — aborting DB insert.");
    process.exit(1);
  }

  // Remove any existing images for these products (clean slate per product)
  const deleted = await db
    .delete(productImagesTable)
    .where(inArray(productImagesTable.productId, productIds))
    .returning({ id: productImagesTable.id });
  console.log(`Removed ${deleted.length} pre-existing image rows.`);

  const rows = productIds.map((productId) => ({
    productId,
    url: uploadedPaths.get(productId)!,
    isPrimary: true,
    displayOrder: 0,
    imageKind: "gallery",
    altText: null as string | null,
  }));

  await db.insert(productImagesTable).values(rows);
  console.log(`Inserted ${rows.length} product_images rows.`);

  if (errors.length > 0) {
    console.log(`\nSkipped (no file): ${errors.join(", ")}`);
  }
  console.log("\nDone.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
