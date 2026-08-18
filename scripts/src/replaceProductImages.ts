/**
 * Replaces (or adds) images for 4 specific products identified by SKU.
 * Source images are in attached_assets/ at workspace root.
 * Existing images for each product are deleted before inserting the new one.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/replaceProductImages.ts
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Storage } from "@google-cloud/storage";
import { eq, inArray } from "drizzle-orm";
import { db, productsTable, productImagesTable } from "@workspace/db";

const SIDECAR = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
  } as never,
  projectId: "",
});

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const ASSETS_DIR = resolve(WORKSPACE_ROOT, "attached_assets");

const TASKS = [
  {
    sku: "SW5801-CT",
    sourceFile: "SunsetWest_SW5801-CT_1787092219749.jpg",
    storageSubdir: "products/sunset-west",
    storageFilename: "SW5801-CT.jpg",
  },
  {
    sku: "SW5801-7B",
    sourceFile: "SunsetWest_SW5801-7B_1787092219749.jpg",
    storageSubdir: "products/sunset-west",
    storageFilename: "SW5801-7B.jpg",
  },
  {
    sku: "SW5801-ET",
    sourceFile: "Sunset_West_SW5801-ET_1787092219749.jpg",
    storageSubdir: "products/sunset-west",
    storageFilename: "SW5801-ET.jpg",
  },
  {
    sku: "CH240-PD",
    sourceFile: "Homecrest_CH240-PD_1787092219749.jpg",
    storageSubdir: "products/homecrest",
    storageFilename: "CH240-PD.jpg",
  },
];

async function uploadToGCS(
  buffer: Buffer,
  storageSubdir: string,
  storageFilename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${storageSubdir}/${storageFilename}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/${storageSubdir}/${storageFilename}`;
}

async function main() {
  // Resolve product IDs
  const skus = TASKS.map((t) => t.sku);
  const rows = await db
    .select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable)
    .where(inArray(productsTable.sku, skus));

  if (rows.length !== TASKS.length) {
    const found = rows.map((r) => r.sku);
    const missing = skus.filter((s) => !found.includes(s));
    throw new Error(`Products not found for SKUs: ${missing.join(", ")}`);
  }

  const bySkU = Object.fromEntries(rows.map((r) => [r.sku, r]));

  for (const task of TASKS) {
    const product = bySkU[task.sku];
    console.log(`\n[${task.sku}] "${product.name}" (id=${product.id})`);

    // Check existing images
    const existing = await db
      .select({ id: productImagesTable.id, url: productImagesTable.url })
      .from(productImagesTable)
      .where(eq(productImagesTable.productId, product.id));

    if (existing.length > 0) {
      console.log(`  Deleting ${existing.length} existing image(s): ${existing.map((e) => e.url).join(", ")}`);
      await db
        .delete(productImagesTable)
        .where(eq(productImagesTable.productId, product.id));
    } else {
      console.log(`  No existing images — adding new one`);
    }

    // Upload new image
    const filePath = resolve(ASSETS_DIR, task.sourceFile);
    console.log(`  Uploading ${task.sourceFile}…`);
    const buffer = await readFile(filePath);
    const objectPath = await uploadToGCS(buffer, task.storageSubdir, task.storageFilename);

    // Insert DB record
    await db.insert(productImagesTable).values({
      productId: product.id,
      variantId: null,
      url: objectPath,
      altText: product.name,
      displayOrder: 0,
      isPrimary: true,
      imageKind: "gallery",
    });

    console.log(`  ✓ → ${objectPath}`);
  }

  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
