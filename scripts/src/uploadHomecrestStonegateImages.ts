/**
 * Upload Homecrest Stonegate table images and attach them to products.
 *
 * - Uploads each unique image file once to Object Storage.
 * - Inserts a product_images (gallery, isPrimary=true) row for each product.
 * - Skips products that already have at least one gallery image (idempotent).
 * - Skips missing files gracefully (warns and continues).
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/uploadHomecrestStonegateImages.ts
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

// Image filename (without .jpg) → array of SKUs (from user mapping)
const IMAGE_TO_SKUS: Record<string, string[]> = {
  "1330RSG":            ["1330RSG"],
  "254284BSG":          ["254284BSG"],
  "254284FSG":          ["254284FSG"],
  "2542SBSG":           ["2542SBSG", "2542SBSGNU"],
  "2542SFSG":           ["2542SFSG", "2542SFSGNU"],
  "2721SSG":            ["2721SSG"],
  "2722SSG":            ["2722SSG"],
  "274284FSG":          ["274284FSG"],
  "2742SFSG":           ["2742SFSG", "2742SFSGNU"],
  "3721SSG":            ["3721SSG"],
  "3722RSG":            ["3722RSG"],
  "3722SSG":            ["3722SSG"],
  "3723RSG":            ["3723RSG"],
  "3724RSG":            ["3724RSG"],
  "3725RSG":            ["3725RSG"],
  "374262BSG":          ["374262BSG"],
  "374262FSG":          ["374262FSG"],
  "374284BSG":          ["374284BSG"],
  "374284FSG":          ["374284FSG"],
  "3742RBSG":           ["3742RBSG", "3742RBSGNU"],
  "3742RCSGNU":         ["3742RCSGNU"],
  "3742RFSG":           ["3742RFSG", "3742RFSGNU"],
  "3742SFSG":           ["3742SFSG", "3742SBSG", "3742SFSGNU", "3742SBSGNU"],
  "3754RBSG":           ["3754RBSG", "3754RBSGNU"],
  "3754RCSGNU":         ["3754RCSGNU"],
  "3754RFSG":           ["3754RFSG", "3754RFSGNU"],
  "42RSGFPTT_89RNC-JLP": ["42RSGFPTT+89RNC", "42RSGFPTT+89RBC"],
  "54RSGFPTT_89RNC-JLP": ["54RSGFPTT+89RNC", "54RSGFPTT+89RBC"],
  "C0030RSG":           ["C0030RSG+2330B", "C0030RSG+2334B", "C0030RSG+2340B"],
  "C0030RSGWH":         ["C0030RSGWH+2330B", "C0030RSGWH+2334B", "C0030RSGWH+2340B"],
  "C0036RSG":           ["C0036RSG+2330B", "C0036RSG+2334B", "C0036RSG+2340B"],
  "C0036RSGNU":         ["C0036RSGNU+2330B", "C0036RSGNU+2334B", "C0036RSGNU+2340B"],
  "C0042RSG":           ["C0042RSG+3330B", "C0042RSG+3334B", "C0042RSG+3340B"],
  "C0042RSGNU":         ["C0042RSGNU+2742RB", "C0042RSGNU+3330B", "C0042RSGNU+3334B", "C0042RSGNU+3340B"],
  "C2424SSG":           ["C2424SSG+2330B", "C2424SSG+2334B", "C2424SSG+2340B", "C2424SSG+5723B"],
  "C2430XSG":           ["C2430XSG+2330B", "C2430XSG+2334B", "C2430XSG+2340B", "C2430XSG+5723B"],
  "C2430XSGWH":         ["C2430XSGWH+2330B", "C2430XSGWH+2334B", "C2430XSGWH+2340B"],
  "C2436XSG":           ["C2436XSG+2330B", "C2436XSG+2334B", "C2436XSG+2340B"],
  "C2436XSGWH":         ["C2436XSGWH+2330B", "C2436XSGWH+2334B", "C2436XSGWH+2340B"],
  "C2644XSG":           ["C2644XSG+272644B", "C2644XSG+5744B"],
  "C3030SSG":           ["C3030SSG+2330B", "C3030SSG+2334B", "C3030SSG+2340B", "C3030SSG+5723B"],
  "C3030SSGWH":         ["C3030SSGWH+2330B", "C3030SSGWH+2334B", "C3030SSGWH+2340B"],
  "C3048XSG":           ["C3048XSG+2330B", "C3048XSG+2334B", "C3048XSG+2340B", "C3048XSG+5744B"],
  "C3252XSG":           ["C3252XSG+273252B"],
  "C3636SSG":           ["C3636SSG+2330B", "C3636SSG+2334B", "C3636SSG+2340B"],
  "C3636SSGNU":         ["C3636SSGNU+2330B", "C3636SSGNU+2334B", "C3636SSGNU+2340B"],
  "C3660XSG":           ["C3660XSG+273660B"],
  "C4242SSG":           ["C4242SSG+3330B", "C4242SSG+3334B", "C4242SSG+3340B"],
  "C4242SSGNU":         ["C4242SSGNU+2742SB", "C4242SSGNU+3330B", "C4242SSGNU+3334B", "C4242SSGNU+3340B"],
};

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imagesDir = path.resolve(__dirname, "../../Homecrest_Stonegate_Images");

  const allSkus = [...new Set(Object.values(IMAGE_TO_SKUS).flat())];
  console.log(`Unique SKUs to process: ${allSkus.length}`);

  const products = await db
    .select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable)
    .where(inArray(productsTable.sku, allSkus));

  const skuToProduct = new Map(products.map((p) => [p.sku, p]));
  const missingDb = allSkus.filter((s) => !skuToProduct.has(s));
  if (missingDb.length) {
    console.warn(`  MISSING from DB (${missingDb.length}):`, missingDb.join(", "));
  }

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

  // Upload each unique image once
  const imageKeys = Object.keys(IMAGE_TO_SKUS);
  const uploadedPaths = new Map<string, string>();

  console.log(`\nUploading ${imageKeys.length} unique images...`);
  for (const imageKey of imageKeys) {
    const localFile = path.join(imagesDir, `${imageKey}.jpg`);
    const storageName = `homecrest-stonegate-${imageKey}.jpg`;
    try {
      const storagePath = await uploadFile(localFile, storageName);
      uploadedPaths.set(imageKey, storagePath);
      console.log(`  ✓ ${imageKey}.jpg → ${storagePath}`);
    } catch (err: any) {
      if (err.code === "ENOENT") {
        console.warn(`  ⚠ FILE NOT FOUND ${imageKey}.jpg — skipping`);
      } else {
        console.error(`  ✗ FAILED ${imageKey}.jpg:`, err.message || err);
      }
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
      console.warn(`  WARN: upload failed or missing for ${imageKey}, skipping ${product.sku}`);
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
    `\nDone. inserted=${inserted} skipped-existing=${skipped} missing-upload=${noUpload} missing-db=${missingDb.length}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
