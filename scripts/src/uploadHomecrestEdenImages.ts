/**
 * Upload Homecrest Eden product images and attach to 12 SKUs.
 *
 * Each product gets its SKU-matched image as primary (isPrimary=true),
 * plus all 6 shared lifestyle images (isPrimary=false).
 *
 * Idempotent: skips products that already have a gallery image.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/uploadHomecrestEdenImages.ts
 */
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Storage } from "@google-cloud/storage";
import { and, eq, inArray } from "drizzle-orm";
import { db, productImagesTable, productsTable } from "@workspace/db";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
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

async function uploadFile(localPath: string, storageName: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/uploads/${storageName}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const buffer = await readFile(localPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/uploads/${storageName}`;
}

const IMAGE_TO_SKU: Record<string, string> = {
  "2621S": "2621S",
  "2624S": "2624S",
  "261660": "261660",
  "261948": "261948",
  "262348": "262348",
  "262948": "262948",
  "263060": "263060",
  "263460": "263460",
  "264060": "264060",
  "2630110": "2630110",
  "2634110": "2634110",
  "2640110": "2640110",
};

const SHARED = [
  "2019_AllureEden.jpg",
  "2019_AllureEden(2).jpg",
  "2025-Willow_EdenTable_640x561.jpg",
  "Allure-Eden-ClemsonSoccerStadium.jpg",
  "Allure-Eden-Lyra.jpg",
  "Allure-Eden.jpg",
];

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imagesDir = path.resolve(__dirname, "../../Homecrest_eden_images");

  const allSkus = [...new Set(Object.values(IMAGE_TO_SKU))];
  console.log(`Unique SKUs to process: ${allSkus.length}`);

  const products = await db
    .select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable)
    .where(inArray(productsTable.sku, allSkus));

  const skuToProduct = new Map(products.map((p) => [p.sku, p]));
  const missing = allSkus.filter((s) => !skuToProduct.has(s));
  if (missing.length) {
    console.warn(`  MISSING from DB (${missing.length}):`, missing.join(", "));
  }
  console.log(`Found ${products.length}/${allSkus.length} products`);

  const productIds = products.map((p) => p.id);
  const existing = productIds.length
    ? await db
        .select({ productId: productImagesTable.productId })
        .from(productImagesTable)
        .where(
          and(
            inArray(productImagesTable.productId, productIds),
            eq(productImagesTable.imageKind, "gallery"),
          ),
        )
    : [];
  const alreadyHasImage = new Set(existing.map((r) => r.productId));
  console.log(`  ${alreadyHasImage.size} already have gallery images — will skip`);

  // Upload each unique SKU-matched image once
  const uploadedPaths = new Map<string, string>();
  console.log(`\nUploading ${Object.keys(IMAGE_TO_SKU).length} unique SKU-matched images...`);
  for (const imageKey of Object.keys(IMAGE_TO_SKU)) {
    const localFile = path.join(imagesDir, `${imageKey}.jpg`);
    const storageName = `homecrest-eden-${imageKey}.jpg`;
    try {
      const storagePath = await uploadFile(localFile, storageName);
      uploadedPaths.set(imageKey, storagePath);
      console.log(`  ✓ ${imageKey}.jpg → ${storagePath}`);
    } catch (err) {
      console.error(`  ✗ FAILED ${imageKey}.jpg:`, err);
    }
  }

  // Upload shared lifestyle images
  const sharedPaths = new Map<string, string>();
  console.log(`\nUploading ${SHARED.length} shared lifestyle images...`);
  for (const file of SHARED) {
    const base = file.replace(/\.jpg$/, "");
    const storageName = `homecrest-eden-${base}.jpg`;
    try {
      const storagePath = await uploadFile(path.join(imagesDir, file), storageName);
      sharedPaths.set(file, storagePath);
      console.log(`  ✓ ${file} → ${storagePath}`);
    } catch (err) {
      console.error(`  ✗ FAILED ${file}:`, err);
    }
  }

  // Insert product_images rows
  console.log(`\nInserting product_images rows...`);
  let inserted = 0;
  let skipped = 0;
  let noUpload = 0;

  for (const product of products) {
    if (alreadyHasImage.has(product.id)) {
      skipped++;
      console.log(`  = skip (already has gallery) ${product.sku}`);
      continue;
    }

    const imageKey = Object.keys(IMAGE_TO_SKU).find((k) => IMAGE_TO_SKU[k] === product.sku);
    if (!imageKey) {
      console.warn(`  WARN: no image mapping for ${product.sku}`);
      skipped++;
      continue;
    }

    const primaryPath = uploadedPaths.get(imageKey);
    if (!primaryPath) {
      console.warn(`  WARN: upload failed for ${imageKey}, skipping ${product.sku}`);
      noUpload++;
      continue;
    }

    const rows: any[] = [];
    rows.push({
      productId: product.id,
      url: primaryPath,
      altText: product.name,
      isPrimary: true,
      displayOrder: 0,
      imageKind: "gallery",
    });

    let order = 1;
    for (const [fileName, sharedPath] of sharedPaths.entries()) {
      rows.push({
        productId: product.id,
        url: sharedPath,
        altText: product.name,
        isPrimary: false,
        displayOrder: order++,
        imageKind: "gallery",
      });
    }

    await db.insert(productImagesTable).values(rows);
    console.log(`  ✓ ${product.sku} (id ${product.id}) → ${primaryPath} + ${sharedPaths.size} shared`);
    inserted++;
  }

  console.log(
    `\nDone. inserted=${inserted} skipped-existing=${skipped} missing-upload=${noUpload} missing-db=${missing.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
