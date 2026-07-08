/**
 * Upload Homecrest Concrete table images and attach them to products.
 *
 * - Uploads each unique image file once to Object Storage.
 * - Inserts a product_images (gallery, isPrimary=true) row for each product.
 * - Skips products that already have at least one gallery image (idempotent).
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/uploadHomecrestConcreteImages.ts
 */
import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Storage } from "@google-cloud/storage";
import { and, eq, inArray, sql } from "drizzle-orm";
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
  // Direct matches
  "254284BCT":     "254284BCT",
  "254284FCT":     "254284FCT",
  "2542SBCT":      "2542SBCT",
  "2542SFCT":      "2542SFCT",
  "2721SCT":       "2721SCT",
  "2722SCT":       "2722SCT",
  "274284FCT":     "274284FCT",
  "2742SFCT":      "2742SFCT",
  "3721SCT":       "3721SCT",
  "3722RCT":       "3722RCT",
  "3722SCT":       "3722SCT",
  "3725RCT":       "3725RCT",
  "3742SBCT":      "3742SBCT",
  "3742SFCT":      "3742SFCT",
  "3748RBCT":      "3748RBCT",
  "3748RFCT":      "3748RFCT",
  "3754RBCT":      "3754RBCT",
  "3754RFCT":      "3754RFCT",

  // NU (no hole) variants → with-hole image
  "2542SBCTNU":    "2542SBCT",
  "2542SFCTNU":    "2542SFCT",
  "2742SFCTNU":    "2742SFCT",
  "3742RBCTNU":    "3742RBCT",
  "3742RFCTNU":    "3742RFCT",
  "3742SBCTNU":    "3742SBCT",
  "3742SFCTNU":    "3742SFCT",
  "3748RBCTNU":    "3748RBCT",
  "3748RFCTNU":    "3748RFCT",
  "3754RBCTNU":    "3754RBCT",
  "3754RFCTNU":    "3754RFCT",

  // C0030 variants
  "C0030RCTWH+2330B": "C0030RCTWH",
  "C0030RCTWH+2334B": "C0030RCTWH",
  "C0030RCTWH+2340B": "C0030RCTWH",
  "C0030RCT+2330B":   "C0030RCT",
  "C0030RCT+2334B":   "C0030RCT",
  "C0030RCT+2340B":   "C0030RCT",

  // C3030 variants
  "C3030SCTWH+2330B": "C3030SCTWH",
  "C3030SCTWH+2334B": "C3030SCTWH",
  "C3030SCTWH+2340B": "C3030SCTWH",
  "C3030SCT+2330B":   "C3030SCT",
  "C3030SCT+2334B":   "C3030SCT",
  "C3030SCT+2340B":   "C3030SCT",
  "C3030SCT+5723B":   "C3030SCT",

  // C2424 / C2644
  "C2424SCT+5723B":    "C2424SCT",
  "C2644XCT+272644B":  "C2644XCT",
  "C2644XCT+5744B":    "C2644XCT",

  // C3252
  "C3252XCT+273252B":  "C3252XCT",

  // C0036 variants
  "C0036RCT+2330B":    "C0036RCT",
  "C0036RCT+2334B":    "C0036RCT",
  "C0036RCT+2340B":    "C0036RCT",
  "C0036RCTNU+2330B":  "C0036RCTNU",
  "C0036RCTNU+2334B":  "C0036RCTNU",
  "C0036RCTNU+2340B":  "C0036RCTNU",

  // C3636 variants
  "C3636SCT+2330B":    "C3636SCT",
  "C3636SCT+2334B":    "C3636SCT",
  "C3636SCT+2340B":    "C3636SCT",
  "C3636SCTNU+2330B":  "C3636SCTNU",
  "C3636SCTNU+2334B":  "C3636SCTNU",
  "C3636SCTNU+2340B":  "C3636SCTNU",
  "C3660XCT+273660B":  "C3660XCT",

  // C0042 variants
  "C0042RCT+3330B":    "C0042RCT",
  "C0042RCT+3334B":    "C0042RCT",
  "C0042RCT+3340B":    "C0042RCT",
  "C0042RCTNU+2742RB": "C0042RCTNU",
  "C0042RCTNU+3330B":  "C0042RCTNU",
  "C0042RCTNU+3334B":  "C0042RCTNU",
  "C0042RCTNU+3340B":  "C0042RCTNU",

  // C4242 variants
  "C4242SCT+3330B":    "C4242SCT",
  "C4242SCT+3334B":    "C4242SCT",
  "C4242SCT+3340B":    "C4242SCT",
  "C4242SCTNU+2742SB": "C4242SCTNU",
  "C4242SCTNU+3330B":  "C4242SCTNU",
  "C4242SCTNU+3334B":  "C4242SCTNU",
  "C4242SCTNU+3340B":  "C4242SCTNU",

  // C0048 variants
  "C0048RCT+3330B":    "C0048RCT",
  "C0048RCT+3334B":    "C0048RCT",
  "C0048RCT+3340B":    "C0048RCT",
  "C0048RCTNU+3330B":  "C0048RCTNU",
  "C0048RCTNU+3334B":  "C0048RCTNU",
  "C0048RCTNU+3340B":  "C0048RCTNU",
};

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imagesDir = path.resolve(__dirname, "../../Homecrest_Concrete_images");

  // 1. Fetch all 75 concrete products by SKU (IDs 5701–5775)
  const skus = Object.keys(SKU_TO_IMAGE);
  const products = await db
    .select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable)
    .where(inArray(productsTable.sku, skus));

  console.log(`Found ${products.length} products in DB (expected 75)`);
  if (products.length !== 75) {
    const foundSkus = new Set(products.map((p) => p.sku));
    const missing = skus.filter((s) => !foundSkus.has(s));
    console.warn("  MISSING SKUs:", missing);
  }

  // 2. Find products that already have a gallery image (to skip them)
  const productIds = products.map((p) => p.id);
  const existing = await db
    .select({ productId: productImagesTable.productId })
    .from(productImagesTable)
    .where(
      and(
        inArray(productImagesTable.productId, productIds),
        eq(productImagesTable.imageKind, "gallery"),
      ),
    );
  const alreadyHasImage = new Set(existing.map((r) => r.productId));
  console.log(`  ${alreadyHasImage.size} products already have gallery images — will skip`);

  const toProcess = products.filter((p) => !alreadyHasImage.has(p.id));
  console.log(`  ${toProcess.length} products to process\n`);

  // 3. Upload each unique image file once
  const uniqueImageKeys = [...new Set(Object.values(SKU_TO_IMAGE))];
  const uploadedPaths = new Map<string, string>(); // imageKey → /objects/... path

  console.log(`Uploading ${uniqueImageKeys.length} unique images...`);
  for (const imageKey of uniqueImageKeys) {
    const localFile = path.join(imagesDir, `${imageKey}.jpg`);
    const storageName = `homecrest-concrete-${imageKey}.jpg`;
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

  console.log(`\nDone. inserted=${inserted} skipped=${skipped} already-had-image=${alreadyHasImage.size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
