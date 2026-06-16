/**
 * uploadGaltechReplacementImages.ts
 *
 * All Galtech replacement-frame / replacement-part products are already in the
 * DB (seeded with FRAME-ALU-xxx / FRAME-WD-xxx / P-xxx SKUs). This script:
 *   1. Uploads each image from galtech_missing_product_images/ to Object Storage.
 *   2. Inserts a product_images row (is_primary=true, image_kind='gallery')
 *      using ON CONFLICT DO NOTHING so it is safe to re-run.
 *
 * Image filename → DB SKU mapping is defined explicitly below.
 */

import { readFile } from "node:fs/promises";
import { resolve, join, extname } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db, productsTable, productImagesTable } from "@workspace/db";
import { eq, inArray } from "drizzle-orm";

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const IMAGE_DIR = join(WORKSPACE_ROOT, "galtech_missing_product_images");
const STORAGE_SUBDIR = "products/galtech/replacement-frames";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// ---------------------------------------------------------------------------
// Image filename (without extension) → DB SKU
// ---------------------------------------------------------------------------
const FILENAME_TO_SKU: Record<string, string> = {
  // Aluminum frames
  "636": "FRAME-ALU-636",
  "715AB": "FRAME-ALU-715AB",
  "722": "FRAME-ALU-722",
  "727": "FRAME-ALU-727",
  "732": "FRAME-ALU-732",
  "735": "FRAME-ALU-735",
  "736": "FRAME-ALU-736",
  "737": "FRAME-ALU-737",
  "738": "FRAME-ALU-738",
  "762": "FRAME-ALU-762",
  "772": "FRAME-ALU-772",
  "779": "FRAME-ALU-779",
  "781": "FRAME-ALU-781",
  "782": "FRAME-ALU-782",
  "789": "FRAME-ALU-789",
  "791": "FRAME-ALU-791",
  "792": "FRAME-ALU-792",
  "799": "FRAME-ALU-799",
  "936": "FRAME-ALU-936",
  "986": "FRAME-ALU-986",
  "887-frame": "FRAME-ALU-887",
  "897-frame": "FRAME-ALU-897",
  "899-frame": "FRAME-ALU-899",
  "887-897-899-base": "FRAME-ALU-887-897-899-BASE",
  // Wood frames
  "121-wood": "FRAME-WD-121",
  "131-wood": "FRAME-WD-131",
  "132-wood": "FRAME-WD-132",
  "136-wood": "FRAME-WD-136",
  "183-wood": "FRAME-WD-183",
  "221-wood": "FRAME-WD-221",
  "232-wood": "FRAME-WD-232",
  "531-teak": "FRAME-WD-531",
  "532-teak": "FRAME-WD-532",
  "537-teak": "FRAME-WD-537",
  "587-teak": "FRAME-WD-587",
};

// ---------------------------------------------------------------------------
// Object Storage helpers
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

async function uploadImage(
  buffer: Buffer,
  contentType: string,
  filename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${filename}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== uploadGaltechReplacementImages ===\n");

  const skus = Object.values(FILENAME_TO_SKU);
  const products = await db
    .select({ id: productsTable.id, sku: productsTable.sku })
    .from(productsTable)
    .where(inArray(productsTable.sku, skus));

  const skuToId = new Map(products.map((p) => [p.sku, p.id]));
  console.log(`Found ${skuToId.size} / ${skus.length} matching products in DB.\n`);

  let uploaded = 0;
  let skipped = 0;
  let missing = 0;

  for (const [basename, sku] of Object.entries(FILENAME_TO_SKU)) {
    const productId = skuToId.get(sku);
    if (!productId) {
      console.warn(`  SKIP  ${basename} — product SKU ${sku} not found in DB`);
      missing++;
      continue;
    }

    // Find the image file (try .jpg then .png)
    let imageBuffer: Buffer | null = null;
    let filename = "";
    let contentType = "image/jpeg";

    for (const ext of [".jpg", ".png", ".jpeg", ".webp"]) {
      const candidate = join(IMAGE_DIR, `${basename}${ext}`);
      try {
        imageBuffer = await readFile(candidate);
        filename = `${basename}${ext}`;
        contentType =
          ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : "image/jpeg";
        break;
      } catch {
        // not found, try next
      }
    }

    if (!imageBuffer) {
      console.log(`  NO IMG  ${basename} (${sku}) — no image file found, skipping`);
      missing++;
      continue;
    }

    try {
      const storageUrl = await uploadImage(imageBuffer, contentType, filename);

      await db
        .insert(productImagesTable)
        .values({
          productId,
          url: storageUrl,
          altText: `Galtech ${sku} replacement frame`,
          isPrimary: true,
          displayOrder: 0,
          imageKind: "gallery",
        })
        .onConflictDoNothing();

      console.log(`  OK    ${basename} → ${sku} → ${storageUrl}`);
      uploaded++;
    } catch (err) {
      console.error(`  ERROR ${basename}: ${String(err)}`);
    }
  }

  console.log(
    `\nDone. Uploaded: ${uploaded}, already had image / not found: ${missing + skipped}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
