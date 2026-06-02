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
  const fullPath = `${privateDir.replace(/\/$/, "")}/products/tropitone/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  const ext = path.extname(filename);
  await file.save(buffer, { contentType: contentTypeForExt(ext), resumable: false });
  return `/objects/products/tropitone/${filename}`;
}

/**
 * Find which SKU from the candidate list is embedded in the filename.
 * Returns the longest match (most specific) to avoid false positives.
 */
function matchSku(basename: string, skus: string[]): string | null {
  const lowerBase = basename.toLowerCase();
  let best: string | null = null;
  for (const sku of skus) {
    if (lowerBase.includes(sku.toLowerCase())) {
      if (!best || sku.length > best.length) {
        best = sku;
      }
    }
  }
  return best;
}

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imageDir = path.resolve(__dirname, "../../missing_tropitone_images");

  const files = await readdir(imageDir);
  console.log(`Found ${files.length} files in missing_tropitone_images/`);

  // Fetch all Tropitone products missing images
  const missingProducts = await db.execute<{ id: number; sku: string; name: string }>(
    `SELECT p.id, p.sku, p.name
     FROM products p
     JOIN manufacturers m ON m.id = p.manufacturer_id
     LEFT JOIN product_images pi ON pi.product_id = p.id
     WHERE m.name = 'Tropitone'
     GROUP BY p.id, p.sku, p.name
     HAVING COUNT(pi.id) = 0
     ORDER BY p.sku`
  );
  const products = missingProducts.rows as { id: number; sku: string; name: string }[];
  const allSkus = products.map(p => p.sku);
  console.log(`${products.length} Tropitone products currently missing images`);

  // Match each file to a SKU
  const fileToProduct = new Map<string, { id: number; sku: string }>();
  const unmatched: string[] = [];

  for (const filename of files) {
    const basename = path.basename(filename, path.extname(filename));
    const sku = matchSku(basename, allSkus);
    if (!sku) {
      unmatched.push(filename);
      continue;
    }
    const product = products.find(p => p.sku === sku)!;
    fileToProduct.set(filename, product);
  }

  console.log(`\nMatched ${fileToProduct.size}/${files.length} files to products`);
  if (unmatched.length) {
    console.warn("  Unmatched files (no SKU found in filename):", unmatched.join(", "));
  }

  // Show the mapping
  for (const [filename, product] of fileToProduct) {
    console.log(`  ${filename}  →  ${product.sku} (${product.id})`);
  }

  // Upload each image
  const storagePaths = new Map<string, string>(); // filename → /objects/...
  let uploaded = 0;
  const BATCH = 5;
  const entries = [...fileToProduct.entries()];

  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    await Promise.all(batch.map(async ([filename]) => {
      try {
        const buffer = await readFile(path.join(imageDir, filename));
        const storagePath = await uploadImage(buffer, filename);
        storagePaths.set(filename, storagePath);
        uploaded++;
      } catch (err) {
        console.error(`  ERROR uploading "${filename}":`, err);
      }
    }));
    console.log(`  Uploaded ${Math.min(i + BATCH, entries.length)}/${entries.length}`);
  }

  console.log(`\nUpload complete: ${uploaded}/${entries.length} succeeded`);

  // Build insert rows
  const rows: Array<{
    productId: number;
    url: string;
    isPrimary: boolean;
    displayOrder: number;
    imageKind: "gallery" | "spec";
    altText: string | null;
  }> = [];

  for (const [filename, product] of fileToProduct) {
    const storagePath = storagePaths.get(filename);
    if (!storagePath) {
      console.warn(`  WARN: no uploaded path for "${filename}", skipping`);
      continue;
    }
    rows.push({
      productId: product.id,
      url: storagePath,
      isPrimary: true,
      displayOrder: 0,
      imageKind: "gallery",
      altText: null,
    });
  }

  // Insert (ignore duplicates)
  const INSERT_BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const chunk = rows.slice(i, i + INSERT_BATCH);
    await db
      .insert(productImagesTable)
      .values(chunk)
      .onConflictDoNothing();
    inserted += chunk.length;
  }

  console.log(`\nInserted ${inserted} product_images rows`);
  console.log("Done.");
  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
