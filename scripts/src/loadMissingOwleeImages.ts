import { readdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { productImagesTable, productsTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

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
    universe_domain: "googleapis.com",
  } as never,
  projectId: "",
});

function parseObjectPath(fullPath: string) {
  const parts = fullPath.replace(/^\//, "").split("/");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

function contentTypeForExt(ext: string): string {
  switch (ext.toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".svg":
      return "image/svg+xml";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

async function uploadImage(buffer: Buffer, filename: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/products/owlee/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  const ext = path.extname(filename);
  await file.save(buffer, { contentType: contentTypeForExt(ext), resumable: false });
  return `/objects/products/owlee/${filename}`;
}

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imageDir = path.resolve(__dirname, "../../missing_ow_lee_images");

  const files = await readdir(imageDir);
  console.log(`Found ${files.length} files in missing_ow_lee_images/`);

  // Build SKU → filename map (strip extension for SKU lookup)
  const skuToFile = new Map<string, string>();
  for (const filename of files) {
    const sku = path.basename(filename, path.extname(filename));
    skuToFile.set(sku, filename);
  }

  // Look up product IDs by SKU
  const skus = [...skuToFile.keys()];
  const products = await db
    .select({ id: productsTable.id, sku: productsTable.sku })
    .from(productsTable)
    .where(inArray(productsTable.sku, skus));

  console.log(`Matched ${products.length}/${skus.length} SKUs to products`);

  const unmatched = skus.filter(s => !products.find(p => p.sku === s));
  if (unmatched.length) {
    console.warn("  Unmatched SKUs (no product found):", unmatched.join(", "));
  }

  // Upload each image and collect storage paths
  const storagePaths = new Map<string, string>(); // filename → /objects/...
  let uploaded = 0;
  const BATCH = 5;

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    await Promise.all(batch.map(async ({ sku }) => {
      const filename = skuToFile.get(sku)!;
      try {
        const buffer = await readFile(path.join(imageDir, filename));
        const storagePath = await uploadImage(buffer, filename);
        storagePaths.set(filename, storagePath);
        uploaded++;
      } catch (err) {
        console.error(`  ERROR uploading "${filename}":`, err);
      }
    }));
    console.log(`  Uploaded ${Math.min(i + BATCH, products.length)}/${products.length}`);
  }

  console.log(`\nUpload complete: ${uploaded}/${products.length} succeeded`);

  // Remove any existing image rows for these products (clean slate per product)
  const productIds = products.map(p => p.id);
  const deleted = await db
    .delete(productImagesTable)
    .where(inArray(productImagesTable.productId, productIds))
    .returning({ id: productImagesTable.id });
  console.log(`Removed ${deleted.length} existing image rows`);

  // Build insert rows
  const rows: Array<{
    productId: number;
    url: string;
    isPrimary: boolean;
    displayOrder: number;
    imageKind: "gallery" | "spec";
    altText: string | null;
  }> = [];

  for (const { id: productId, sku } of products) {
    const filename = skuToFile.get(sku)!;
    const storagePath = storagePaths.get(filename);
    if (!storagePath) {
      console.warn(`  WARN: no uploaded path for SKU "${sku}", skipping`);
      continue;
    }
    rows.push({
      productId,
      url: storagePath,
      isPrimary: true,
      displayOrder: 0,
      imageKind: "gallery",
      altText: null,
    });
  }

  // Batch insert
  const INSERT_BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    await db.insert(productImagesTable).values(rows.slice(i, i + INSERT_BATCH));
    inserted += rows.slice(i, i + INSERT_BATCH).length;
  }

  console.log(`\nInserted ${inserted} product_images rows`);
  console.log("Done.");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
