import { readFile, readdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { productImagesTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

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

async function uploadBuffer(
  buffer: Buffer,
  contentType: string,
  filename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/products/homecrest/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/products/homecrest/${filename}`;
}

// SKU → product id (confirmed from DB)
const PRODUCTS: { productId: number; sku: string; altText: string }[] = [
  { productId: 5928, sku: "2542SBSH",       altText: "Shadow Rock Square Balcony Table 42\" Post Base No Hole" },
  { productId: 5927, sku: "2542SFSH",       altText: "Shadow Rock Square Balcony Table 42\" X Base" },
  { productId: 5926, sku: "274282FSH",      altText: "Shadow Rock Rectangular Dining Table 82\" Fan Base" },
  { productId: 5924, sku: "2742SFSH",       altText: "Shadow Rock Rectangular Dining Table 42\" Fan Base" },
  { productId: 6170, sku: "3722SWZ",        altText: "Shadow Rock Square Dining Table 42\" Wide Z Base" },
  { productId: 6303, sku: "SPL11601UMST",   altText: "SPLASH Modular Bench 11601" },
  { productId: 6304, sku: "SPL22101T1ST",   altText: "SPLASH Modular Bench 22101 T1" },
  { productId: 6307, sku: "SPLSIDETABLEST", altText: "SPLASH Side Table" },
  { productId: 6308, sku: "SPLWIDETABLEST", altText: "SPLASH Wide Side Table" },
];

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const assetsDir = path.resolve(__dirname, "../../attached_assets");

  console.log("Uploading Homecrest product images to Object Storage...\n");

  for (const p of PRODUCTS) {
    // attached_assets filenames include a timestamp suffix, e.g. 2542SBSH_1783917301729.jpg
    const dirents = (await readdir(assetsDir)).filter(
      (f) => f.startsWith(p.sku) && f.toLowerCase().endsWith(".jpg"),
    );
    if (dirents.length === 0) {
      console.error(`  ✗ ${p.sku} — no matching image file found in ${assetsDir}`);
      continue;
    }
    const filename = dirents[0];
    const filepath = path.join(assetsDir, filename);

    let buffer: Buffer;
    try {
      buffer = await readFile(filepath);
    } catch (err) {
      console.error(`  ✗ ${p.sku} — file not found: ${filepath}`);
      continue;
    }

    const objectPath = await uploadBuffer(buffer, "image/jpeg", filename);
    console.log(`  ↑ ${p.sku} → ${objectPath}`);

    // Insert product_images row (idempotent via unique index on product_id + url)
    try {
      await db.insert(productImagesTable).values({
        productId: p.productId,
        url: objectPath,
        altText: p.altText,
        isPrimary: true,
        displayOrder: 0,
        imageKind: "gallery",
      });
      console.log(`  ✓ ${p.sku} (id ${p.productId}) — row inserted`);
    } catch (err: any) {
      if (err.message?.includes("duplicate key")) {
        console.log(`  • ${p.sku} — already linked, skipping`);
      } else {
        console.error(`  ✗ ${p.sku} — insert error: ${err.message}`);
      }
    }
  }

  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
