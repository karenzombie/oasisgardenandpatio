/**
 * Upload Homecrest Latitude table images and attach them to products.
 *
 * - Uploads each unique image file once to Object Storage.
 * - Inserts a product_images (gallery, isPrimary=true) row for each product.
 * - Skips products that already have at least one gallery image (idempotent).
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/uploadHomecrestLatitudeImages.ts
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

// SKU → image filename (without .jpg)
const SKU_TO_IMAGE: Record<string, string> = {
  // Direct 1:1 matches
  "1330RLT":       "1330RLT",
  "374274XBLT":    "374274XBLT",
  "374274XFLT":    "374274XFLT",
  "3742RBLT":      "3742RBLT",
  "3742RCLTNU":    "3742RCLTNU",
  "3742RFLT":      "3742RFLT",
  "3748RBLT":      "3748RBLT",
  "3748RCLTNU":    "3748RCLTNU",
  "3748RFLT":      "3748RFLT",
  "3754RBLT":      "3754RBLT",
  "3754RFLT":      "3754RFLT",
  "501948":        "501948",
  "6224R":         "6224R",
  "6224S":         "6224S",
  "622644":        "622644",

  // Post-base rectangle tables
  "624274XBLT":    "624274XBLT",
  "624274XFLT":    "624274XFLT",

  // 42" square tables (direct)
  "6242SBLT":      "6242SBLT",
  "6242SFLT":      "6242SFLT",
  // No-hole variants share the with-hole image
  "6242SBLTNU":    "6242SBLT",
  "6242SFLTNU":    "6242SFLT",

  // 54" round post base
  "6254RBLT":      "6254RBLT",
  "6254RFLT":      "6254RFLT",
};

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imagesDir = path.resolve(__dirname, "../../homecrest_lattitude_images");

  // 1. Fetch matching products
  const skus = Object.keys(SKU_TO_IMAGE);
  const products = await db
    .select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable)
    .where(inArray(productsTable.sku, skus));

  console.log(`Found ${products.length} products in DB (expected ${skus.length})`);
  const foundSkus = new Set(products.map((p) => p.sku));
  const missing = skus.filter((s) => !foundSkus.has(s));
  if (missing.length) {
    console.warn("  MISSING from DB:", missing.join(", "));
  }

  // 2. Find products that already have a gallery image (to skip them)
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
  console.log(`  ${alreadyHasImage.size} products already have gallery images — will skip`);

  const toProcess = products.filter((p) => !alreadyHasImage.has(p.id));
  console.log(`  ${toProcess.length} products to process\n`);

  // 3. Upload each unique image file once
  const uniqueImageKeys = [...new Set(Object.values(SKU_TO_IMAGE))];
  const uploadedPaths = new Map<string, string>();

  console.log(`Uploading ${uniqueImageKeys.length} unique images...`);
  for (const imageKey of uniqueImageKeys) {
    const localFile = path.join(imagesDir, `${imageKey}.jpg`);
    const storageName = `homecrest-latitude-${imageKey}.jpg`;
    try {
      const storagePath = await uploadFile(localFile, storageName);
      uploadedPaths.set(imageKey, storagePath);
      console.log(`  ✓ ${imageKey}.jpg → ${storagePath}`);
    } catch (err) {
      console.error(`  ✗ FAILED ${imageKey}.jpg:`, err);
    }
  }

  // 4. Insert product_images rows
  console.log(`\nInserting product_images rows...`);
  let inserted = 0;
  let skipped = 0;

  for (const product of toProcess) {
    const imageKey = SKU_TO_IMAGE[product.sku];
    if (!imageKey) {
      console.warn(`  WARN: no image mapping for SKU ${product.sku}`);
      skipped++;
      continue;
    }
    const storagePath = uploadedPaths.get(imageKey);
    if (!storagePath) {
      console.warn(`  WARN: image upload failed for ${imageKey}, skipping ${product.sku}`);
      skipped++;
      continue;
    }
    await db.insert(productImagesTable).values({
      productId: product.id,
      url: storagePath,
      altText: product.name,
      isPrimary: true,
      displayOrder: 0,
      imageKind: "gallery",
    });
    console.log(`  ✓ ${product.sku} (id ${product.id}) → ${storagePath}`);
    inserted++;
  }

  console.log(
    `\nDone. inserted=${inserted} skipped-existing=${alreadyHasImage.size} skipped-no-upload=${skipped} missing-db=${missing.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
