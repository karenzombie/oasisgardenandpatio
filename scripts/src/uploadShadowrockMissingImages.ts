import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db, productImagesTable, productsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

const SIDECAR = "http://127.0.0.1:1106";
const ASSETS_DIR = join(import.meta.dirname, "../../attached_assets");

// The 5 Shadow Rock products missing images
const TARGET_SKUS = [
  "2542SBSHNU",
  "2542SFSHNU",
  "2742SFSHNU",
  "3721SSH",
  "3722SSH",
];

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

async function uploadFile(
  localPath: string,
  storageName: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/uploads/${storageName}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const buffer = await readFile(localPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/uploads/${storageName}`;
}

async function main() {
  // 1. Upload both images once to Object Storage
  console.log("Uploading primary image...");
  const primaryPath = join(ASSETS_DIR, "ShadowRock_primary_1784223038801.jpg");
  const primaryUrl = await uploadFile(primaryPath, "shadowrock-primary.jpg");
  console.log(`  → ${primaryUrl}`);

  console.log("Uploading edge image...");
  const edgePath = join(ASSETS_DIR, "ShadowRockEdge_1784223040534.jpg");
  const edgeUrl = await uploadFile(edgePath, "shadowrock-edge.jpg");
  console.log(`  → ${edgeUrl}`);

  // 2. Fetch the 5 target products
  const products = await db
    .select({ id: productsTable.id, sku: productsTable.sku })
    .from(productsTable)
    .where(inArray(productsTable.sku, TARGET_SKUS));

  console.log(`\nFound ${products.length} products to update`);

  // 3. Insert product_images rows for each
  let inserted = 0;
  for (const product of products) {
    const rows = [
      {
        productId: product.id,
        url: primaryUrl,
        altText: "Shadow Rock table top",
        isPrimary: true,
        imageKind: "gallery" as const,
        displayOrder: 0,
      },
      {
        productId: product.id,
        url: edgeUrl,
        altText: "Shadow Rock table edge",
        isPrimary: false,
        imageKind: "gallery" as const,
        displayOrder: 1,
      },
    ];

    for (const row of rows) {
      try {
        await db.insert(productImagesTable).values(row);
        inserted++;
      } catch (err: unknown) {
        // Unique constraint violation → already exists, skip silently
        if ((err as { code?: string }).code === "23505") {
          console.log(`  Skip duplicate for ${product.sku}`);
        } else {
          throw err;
        }
      }
    }
    console.log(`  ✓ ${product.sku}`);
  }

  console.log(`\nDone. ${inserted} image rows inserted.`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
