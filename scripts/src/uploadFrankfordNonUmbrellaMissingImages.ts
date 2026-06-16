import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { eq } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { productsTable, productImagesTable } from "@workspace/db";

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const IMAGE_ROOT = join(WORKSPACE_ROOT, "frankford_nonumbrella_images");
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "products/frankford-non-umbrella";

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
  } as never,
  projectId: "",
});

function parseObjectPath(fullPath: string) {
  const parts = fullPath.replace(/^\//, "").split("/");
  return { bucketName: parts[0], objectName: parts.slice(1).join("/") };
}

async function uploadBuffer(buffer: Buffer, contentType: string, filename: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

function toSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

// Products that were skipped due to SKU normalization issues with special chars
const MISSING = [
  { sku: "SS-DB-4",          subdir: "bases_cantilever", filename: "SS-DB_4_SS-DB_4.png",                        ext: "png" },
  { sku: "SS-DB-4-Marella",  subdir: "bases_marella",    filename: "SS-DB_4_SS-DB_4_Marella.png",                ext: "png" },
  { sku: "Sand Anchor",      subdir: "beach",             filename: "Sand_Anchor_Sand_Anchor.png",                ext: "png" },
  { sku: "CB87-B-SS (2)",    subdir: "beach",             filename: "CB87-B-SS_2_CB87-B-SS_2.jpg",               ext: "jpg" },
  { sku: "ECU/ARU-PC",       subdir: "accessories",       filename: "ECUARU-PC_Protective_Cover_EclipseAurora.jpg", ext: "jpg" },
  { sku: "GS/876-PC",        subdir: "accessories",       filename: "GS876-PC_Protective_Cover_G-Series876.jpg",  ext: "jpg" },
  { sku: "Pagoda Kit",       subdir: "accessories",       filename: "Pagoda_Kit_Pagoda_Shade_Accent.jpg",         ext: "jpg" },
];

async function main() {
  let uploaded = 0;
  let skipped = 0;

  for (const { sku, subdir, filename, ext } of MISSING) {
    const [product] = await db
      .select({ id: productsTable.id, name: productsTable.name })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    if (!product) {
      console.warn(`  WARN: product with sku="${sku}" not found in DB`);
      skipped++;
      continue;
    }

    // Check if image already attached
    const [existingImg] = await db
      .select({ id: productImagesTable.id })
      .from(productImagesTable)
      .where(eq(productImagesTable.productId, product.id))
      .limit(1);

    if (existingImg) {
      console.log(`  SKIP: ${product.name} already has an image`);
      skipped++;
      continue;
    }

    const localPath = join(IMAGE_ROOT, subdir, filename);
    const buffer = await readFile(localPath);
    const contentType = ext === "png" ? "image/png" : "image/jpeg";
    const storageFilename = `${toSlug(product.name)}.${ext}`;
    const url = await uploadBuffer(buffer, contentType, storageFilename);

    await db.insert(productImagesTable).values({
      productId: product.id,
      variantId: null,
      url,
      altText: product.name,
      displayOrder: 0,
      isPrimary: true,
    });

    console.log(`  Uploaded: ${product.name} → ${storageFilename}`);
    uploaded++;
  }

  console.log(`\nDone. uploaded=${uploaded} skipped=${skipped}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => { console.error(err); process.exit(1); });
