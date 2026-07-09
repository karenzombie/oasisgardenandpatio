/**
 * Upload Homecrest Timber table images and attach them to products.
 *
 * - Uploads each unique image file once to Object Storage.
 * - Inserts a product_images (gallery, isPrimary=true) row for each product.
 * - Skips products that already have at least one gallery image (idempotent).
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/uploadHomecrestTimberImages.ts
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
// Parsed from user assignment document + direct matches for images that exist
// but weren't explicitly listed in the concatenated text.
const SKU_TO_IMAGE: Record<string, string> = {
  // Direct 1:1 matches (from parsed assignment text)
  "1330RTM":           "1330RTM",
  "254284BTM":         "254284BTMNU",
  "254284BTMNU":       "254284BTMNU",
  "254284FTM":         "254284FTMNU",
  "254284FTMNU":       "254284FTMNU",
  "2542SBTM":          "2542SBTM",
  "2542SBTMNU":        "C4242STMNU",
  "2542SFTM":          "2542SFTM",
  "2542SFTMNU":        "C4242STMNU",
  "2548SBTMNU":        "2548SBTMNU",
  "2548SFTMNU":        "2548SBTMNU",
  "2721STM":           "2721STM",
  "2722STM":           "2722STM",
  "274284FTM":         "274284FTM",
  "274284FTMNU":       "274284FTM",
  "2742SFTM":          "2742SFTM",
  "2742SFTMNU":        "C4242STMNU",
  "3721STM":           "3721STM",
  "3722STM":           "3722STM",
  "3742RBTM":          "3742RBTM",
  "3742RBTMNU":        "C0042RTMNU",
  "3742RCTMNU":        "3742RCTMNU",
  "3742RFTM":          "3742RFTM",
  "3742RFTMNU":        "C0042RTMNU",
  "3742SBTM":          "3742SBTM",
  "3742SBTMNU":        "C4242STMNU",
  "3742SFTM":          "3742SFTM",
  "3742SFTMNU":        "C4242STMNU",
  "3754RBTM":          "3754RBTM",
  "3754RBTMNU":        "C0042RTMNU",
  "3754RCTMNU":        "3754RCTMNU",
  "3754RFTM":          "3754RFTM",
  "3754RFTMNU":        "C0042RTMNU",

  // C0030 variants
  "C0030RTMWH+2330B": "C0030RTMWH",
  "C0030RTMWH+2334B": "C0030RTMWH",
  "C0030RTMWH+2340B": "C0030RTMWH",
  "C0030RTM+2330B":   "C0030RTM",
  "C0030RTM+2334B":   "C0030RTM",
  "C0030RTM+2340B":   "C0030RTM",

  // C0036 variants
  "C0036RTM+2330B":   "C0036RTM",
  "C0036RTM+2334B":   "C0036RTM",
  "C0036RTM+2340B":   "C0036RTM",
  "C0036RTMNU+2330B": "C0036RTMNU",
  "C0036RTMNU+2334B": "C0036RTMNU",
  "C0036RTMNU+2340B": "C0036RTMNU",

  // C0042 variants
  "C0042RTM+3330B":   "C0042RTM",
  "C0042RTM+3334B":   "C0042RTM",
  "C0042RTM+3340B":   "C0042RTM",
  "C0042RTMNU+2742RB": "C0042RTMNU",
  "C0042RTMNU+3330B": "C0042RTMNU",
  "C0042RTMNU+3334B": "C0042RTMNU",
  "C0042RTMNU+3340B": "C0042RTMNU",

  // C2424 variants
  "C2424STM+2330B":   "C2424STM",
  "C2424STM+2334B":   "C2424STM",
  "C2424STM+2340B":   "C2424STM",
  "C2424STM+5723B":   "C2424STM",

  // C2644 variants
  "C2644XTM+272644B": "C2644XTM",
  "C2644XTM+5744B":   "C2644XTM",

  // C3030 variants
  "C3030STMWH+2330B": "C3030STMWH",
  "C3030STMWH+2334B": "C3030STMWH",
  "C3030STMWH+2340B": "C3030STMWH",
  "C3030STM+2330B":   "C3030STM",
  "C3030STM+2334B":   "C3030STM",
  "C3030STM+2340B":   "C3030STM",
  "C3030STM+5723B":   "C3030STM",

  // C3252
  "C3252XTM+273252B": "C3252XTM",

  // C3636 variants
  "C3636STM+2330B":   "C3636STM",
  "C3636STM+2334B":   "C3636STM",
  "C3636STM+2340B":   "C3636STM",
  "C3636STMNU+2330B": "C3636STMNU",
  "C3636STMNU+2334B": "C3636STMNU",
  "C3636STMNU+2340B": "C3636STMNU",

  // C3660
  "C3660XTM+273660B": "C3660XTM",

  // C4242 variants
  "C4242STM+3330B":   "C4242STM",
  "C4242STM+3334B":   "C4242STM",
  "C4242STM+3340B":   "C4242STM",
  "C4242STMNU+2742SB": "C4242STMNU",
  "C4242STMNU+3330B": "C4242STMNU",
  "C4242STMNU+3334B": "C4242STMNU",
  "C4242STMNU+3340B": "C4242STMNU",
};

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imagesDir = path.resolve(__dirname, "../../Homecrest_Timber_Images");

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
  const uploadedPaths = new Map<string, string>(); // imageKey → /objects/... path

  console.log(`Uploading ${uniqueImageKeys.length} unique images...`);
  for (const imageKey of uniqueImageKeys) {
    const localFile = path.join(imagesDir, `${imageKey}.jpg`);
    const storageName = `homecrest-timber-${imageKey}.jpg`;
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

  // 5. Report products in DB that are NOT in the mapping (no image assigned)
  const allTimberProducts = await db
    .select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable)
    .where(and(eq(productsTable.manufacturerId, 16), eq(productsTable.isActive, true)));

  const timberWithTimberInName = allTimberProducts.filter((p) =>
    p.name.toLowerCase().includes("timber"),
  );
  const uncovered = timberWithTimberInName.filter((p) => !SKU_TO_IMAGE[p.sku]);
  if (uncovered.length) {
    console.log(`\n⚠ ${uncovered.length} Timber products NOT covered by this image set:`);
    uncovered.forEach((p) => console.log(`    ${p.sku} — ${p.name}`));
  }

  console.log(
    `\nDone. inserted=${inserted} skipped-existing=${alreadyHasImage.size} skipped-no-upload=${skipped} missing-db=${missing.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
