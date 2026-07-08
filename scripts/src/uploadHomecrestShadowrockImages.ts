/**
 * Upload Homecrest Shadow Rock table images and attach them to products.
 *
 * - Uploads each unique image file once to Object Storage.
 * - Inserts a product_images (gallery, isPrimary=true) row for each product.
 * - Skips products that already have at least one gallery image (idempotent).
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/uploadHomecrestShadowrockImages.ts
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
  // Direct 1:1 mappings
  "1330RSH":       ["1330RSH"],
  "254282BSH":     ["254282BSH"],
  "254282FSH":     ["254282FSH"],
  "3722RSH":       ["3722RSH"],
  "3723RSH":       ["3723RSH"],
  "3724RSH":       ["3724RSH"],
  "3725RSH":       ["3725RSH"],
  "374262BSH":     ["374262BSH"],
  "374262FSH":     ["374262FSH"],
  "374272BSH":     ["374272BSH"],
  "374272FSH":     ["374272FSH"],
  "374282BSH":     ["374282BSH"],
  "374282FSH":     ["374282FSH"],
  "3742RCSHNU":    ["3742RCSHNU"],
  "374484BSH":     ["374484BSH"],
  "374484FSH":     ["374484FSH"],
  "3748RBSH":     ["3748RBSH"],
  "3748RCSHNU":    ["3748RCSHNU"],
  "3748RFSH":     ["3748RFSH"],

  // 1 image → multiple SKUs
  "2542SBSH":      ["3742SFSH", "3742SBSH", "3742SFSHNU", "3742SBSHNU"],
  "3742RBSH":      ["3742RBSH", "3742RBSHNU"],
  "3742RFSH":      ["3742RFSH", "3742RFSHNU"],
  "42RSHFPTT_89RNC-JLP": ["42RSHFPTT+89RBC", "42RSHFPTT+89RNC"],
  "48RSHFPTT_89RNC-JLP": ["48RSHFPTT+89RBC", "48RSHFPTT+89RNC"],
  "C0030RSH":      ["C0030RSH+2330B", "C0030RSH+2334B", "C0030RSH+2340B"],
  "C0030RSHWH":    ["C0030RSHWH+2330B", "C0030RSHWH+2334B", "C0030RSHWH+2340B"],
  "C0036RSH":      ["C0036RSH+2330B", "C0036RSH+2334B", "C0036RSH+2340B"],
  "C0036RSHNU":    ["C0036RSHNU+2330B", "C0036RSHNU+2334B", "C0036RSHNU+2340B"],
  "C0042RSH":      ["C0042RSH+3330B", "C0042RSH+3334B", "C0042RSH+3340B"],
  "C0042RSHNU":    ["C0042RSHNU+2742RB", "C0042RSHNU+3330B", "C0042RSHNU+3334B", "C0042RSHNU+3340B"],
  "C0048RSH":      ["C0048RSH+3330B", "C0048RSH+3334B", "C0048RSH+3340B"],
  "C0048RSHNU":    ["C0048RSHNU+3330B", "C0048RSHNU+3334B", "C0048RSHNU+3340B"],
  "C2424SSH":      ["C2424SSH+5723B"],
  "C2644XSH":      ["C2644XSH+5744B", "C2644XSH+272644B"],
  "C3030SSH":      ["C3030SSH+5723B", "C3030SSH+2330B", "C3030SSH+2334B", "C3030SSH+2340B"],
  "C3030SSHWH":    ["C3030SSHWH+2330B", "C3030SSHWH+2334B", "C3030SSHWH+2340B"],
  "C3048XSH":      ["C3048XSH+5744B", "C3048XSH+2330B", "C3048XSH+2334B", "C3048XSH+2340B"],
  "C3252XSH":      ["C3252XSH+273252B"],
  "C3636SSH":      ["C3636SSH+2330B", "C3636SSH+2334B", "C3636SSH+2340B"],
  "C3636SSHNU":    ["C3636SSHNU+2330B", "C3636SSHNU+2334B", "C3636SSHNU+2340B"],
  "C3660XSH":      ["C3660XSH+273660B"],
  "C4242SSH":      ["C4242SSH+3330B", "C4242SSH+3334B", "C4242SSH+3340B"],
  "C4242SSHNU":    ["C4242SSHNU+2742SB", "C4242SSHNU+3330B", "C4242SSHNU+3334B", "C4242SSHNU+3340B"],
};

// SKUs that already have images — must not be touched per instructions
const DO_NOT_TOUCH = new Set(["42SQSHTT", "893252XSHTT", "893660XSHTT"]);

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imagesDir = path.resolve(__dirname, "../../Homecrest_Shadowrock_Images");

  // Flatten all SKUs to process
  const allSkus: string[] = [];
  for (const skus of Object.values(IMAGE_TO_SKUS)) {
    allSkus.push(...skus);
  }
  const uniqueSkus = [...new Set(allSkus)].filter((s) => !DO_NOT_TOUCH.has(s));

  console.log(`Unique SKUs to process: ${uniqueSkus.length}`);

  // 1. Fetch matching products
  const products = await db
    .select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable)
    .where(inArray(productsTable.sku, uniqueSkus));

  const skuToProduct = new Map(products.map((p) => [p.sku, p]));
  const missing = uniqueSkus.filter((s) => !skuToProduct.has(s));
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
  const uniqueImages = [...new Set(Object.keys(IMAGE_TO_SKUS))];
  const uploadedPaths = new Map<string, string>(); // imageKey → /objects/... path

  console.log(`\nUploading ${uniqueImages.length} unique images...`);
  for (const imageKey of uniqueImages) {
    const localFile = path.join(imagesDir, `${imageKey}.jpg`);
    const storageName = `homecrest-shadowrock-${imageKey}.jpg`;
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

    // Find which image key maps to this SKU
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
