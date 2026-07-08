/**
 * Upload Homecrest Slate table images and attach them to products.
 *
 * - Uploads each unique image file once to Object Storage.
 * - Inserts a product_images (gallery, isPrimary=true) row for each product.
 * - Skips products that already have at least one gallery image (idempotent).
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/uploadHomecrestSlateImages.ts
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

// Image filename (without .jpg) → array of SKUs
const IMAGE_TO_SKUS: Record<string, string[]> = {
  "1330RSL":           ["1330RSL"],
  "254282BSL":         ["254282BSL"],
  "254282FSL":         ["254282FSL"],
  "2542SBSL":          ["2542SBSL", "2542SBSLNU"],
  "2542SFSL":          ["2542SFSL", "2542SFSLNU"],
  "2721SSL":           ["2721SSL"],
  "2722SSL":           ["2722SSL"],
  "274282FSL":         ["274282FSL", "374282FSL"],
  "2742SFSL":          ["2742SFSL", "2742SFSLNU"],
  "3721SSL":           ["3721SSL"],
  "3722RSL":           ["3722RSL"],
  "3722SSL":           ["3722SSL"],
  "3723RSL":           ["3723RSL"],
  "3725RSL":           ["3725RSL"],
  "374262BSL":         ["374262BSL"],
  "374262FSL":         ["374262FSL"],
  "374272BSL":         ["374272BSL"],
  "374272FSL":         ["374272FSL"],
  "374484BSL":         ["374484BSL"],
  "374484FSL":         ["374484FSL"],
  "3742RBSL":          ["3742RBSL", "3742RBSLNU"],
  "3742RCSLNU":        ["3742RCSLNU"],
  "3742RFSL":          ["3742RFSL", "3742RFSLNU"],
  "3742SBSL":          ["3742SFSL", "3742SBSL", "3742SFSLNU", "3742SBSLNU"],
  "3748RBSL":          ["3748RBSL"],
  "3748RCSLNU":        ["3748RCSLNU"],
  "3748RFSL":          ["3748RFSL"],
  "C0030RSL":          ["C0030RSL+2330B", "C0030RSL+2334B", "C0030RSL+2340B"],
  "C0030RSLWH":        ["C0030RSLWH+2330B", "C0030RSLWH+2334B", "C0030RSLWH+2340B"],
  "C0036RSL":          ["C0036RSL+2330B", "C0036RSL+2334B", "C0036RSL+2340B"],
  "C0036RSLNU":        ["C0036RSLNU+2330B", "C0036RSLNU+2334B", "C0036RSLNU+2340B"],
  "C0042RSL":          ["C0042RSL+3330B", "C0042RSL+3334B", "C0042RSL+3340B"],
  "C0042RSLNU":        ["C0042RSLNU+2742RB", "C0042RSLNU+3330B", "C0042RSLNU+3334B", "C0042RSLNU+3340B"],
  "C0048RSL":          ["C0048RSL+3330B", "C0048RSL+3334B", "C0048RSL+3340B"],
  "C0048RSLNU":        ["C0048RSLNU+3330B", "C0048RSLNU+3334B", "C0048RSLNU+3340B"],
  "C2424SSL":          ["C2424SSL+5723B"],
  "C2644XSL":          ["C2644XSL+272644B", "C2644XSL+5744B"],
  "C3030SSL":          ["C3030SSL+5723B", "C3030SSL+2330B", "C3030SSL+2334B", "C3030SSL+2340B"],
  "C3030SSLWH":        ["C3030SSLWH+2330B", "C3030SSLWH+2334B", "C3030SSLWH+2340B"],
  "C3048XSL":          ["C3048XSL+5744B", "C3048XSL+2330B", "C3048XSL+2334B", "C3048XSL+2340B"],
  "C3252XSL":          ["C3252XSL+273252B"],
  "C3636SSL":          ["C3636SSL+2330B", "C3636SSL+2334B", "C3636SSL+2340B"],
  "C3636SSLNU":        ["C3636SSLNU+2330B", "C3636SSLNU+2334B", "C3636SSLNU+2340B"],
  "C3660XSL":          ["C3660XSL+273660B"],
  "C4242SSL":          ["C4242SSL+3330B", "C4242SSL+3334B", "C4242SSL+3340B"],
  "C4242SSLNU":        ["C4242SSLNU+2742SB", "C4242SSLNU+3330B", "C4242SSLNU+3334B", "C4242SSLNU+3340B"],
  "SL-Side-Table-Round": ["3724RSL"],
};

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imagesDir = path.resolve(__dirname, "../../Homecrest_Slate_Images");

  // Flatten all SKUs to process
  const allSkus = [...new Set(Object.values(IMAGE_TO_SKUS).flat())];
  console.log(`Unique SKUs to process: ${allSkus.length}`);

  // 1. Fetch matching products
  const products = await db
    .select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable)
    .where(inArray(productsTable.sku, allSkus));

  const skuToProduct = new Map(products.map((p) => [p.sku, p]));
  const missing = allSkus.filter((s) => !skuToProduct.has(s));
  if (missing.length) {
    console.warn(`  MISSING from DB (${missing.length}):`, missing.join(", "));
  }

  // 2. Check which already have gallery images
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

  // 3. Upload each unique image once
  const imageKeys = Object.keys(IMAGE_TO_SKUS);
  const uploadedPaths = new Map<string, string>();

  console.log(`\nUploading ${imageKeys.length} unique images...`);
  for (const imageKey of imageKeys) {
    const localFile = path.join(imagesDir, `${imageKey}.jpg`);
    const storageName = `homecrest-slate-${imageKey}.jpg`;
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
  let noUpload = 0;

  for (const product of products) {
    if (alreadyHasImage.has(product.id)) {
      skipped++;
      continue;
    }

    const imageKey = Object.keys(IMAGE_TO_SKUS).find((k) =>
      IMAGE_TO_SKUS[k].includes(product.sku),
    );
    if (!imageKey) {
      console.warn(`  WARN: no image mapping for ${product.sku}`);
      skipped++;
      continue;
    }

    const storagePath = uploadedPaths.get(imageKey);
    if (!storagePath) {
      console.warn(`  WARN: upload failed for ${imageKey}, skipping ${product.sku}`);
      noUpload++;
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
    `\nDone. inserted=${inserted} skipped-existing=${skipped} missing-upload=${noUpload} missing-db=${missing.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
