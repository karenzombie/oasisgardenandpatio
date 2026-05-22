import { readFile, readdir } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { productsTable, productImagesTable } from "@workspace/db/schema";
import { eq, inArray } from "drizzle-orm";

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

async function uploadImage(buffer: Buffer, filename: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/products/tropitone/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/products/tropitone/${filename}`;
}

/**
 * Normalize a Tropitone SKU to its base form by stripping style suffixes.
 * Compound suffixes must be stripped before their components.
 * Examples:
 *   161101PS    → 161101
 *   161125NTPS  → 161125
 *   161125NT    → 161125
 *   381527PS-28 → 381527-28
 *   381527WS-28 → 381527-28
 *   381537WS    → 381537
 */
function normalizeSku(sku: string): string {
  return sku
    .replace(/NTPS/g, "")
    .replace(/NTWS/g, "")
    .replace(/NT/g, "")
    .replace(/PS/g, "")
    .replace(/WS/g, "");
}

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imageDir = path.resolve(__dirname, "../../tropitone_images");

  // Read all .jpg files from the folder
  const files = (await readdir(imageDir)).filter((f) =>
    f.toLowerCase().endsWith(".jpg"),
  );
  console.log(`Found ${files.length} image files`);

  // Fetch all Tropitone products
  const products = await db
    .select({ id: productsTable.id, name: productsTable.name, sku: productsTable.sku })
    .from(productsTable)
    .where(eq(productsTable.manufacturerId, 25));
  console.log(`Loaded ${products.length} Tropitone products from DB`);

  // Build a map: normalizedSku → products[]
  const normalizedMap = new Map<string, typeof products>();
  for (const p of products) {
    const norm = normalizeSku(p.sku);
    if (!normalizedMap.has(norm)) normalizedMap.set(norm, []);
    normalizedMap.get(norm)!.push(p);
  }

  // Match each image file to its products
  type Assignment = { filename: string; storagePath: string; productIds: number[] };
  const assignments: Assignment[] = [];
  const unmatched: string[] = [];

  for (const filename of files) {
    const stem = filename.replace(/\.jpg$/i, "");
    const matched = normalizedMap.get(stem) ?? [];

    if (matched.length === 0) {
      unmatched.push(filename);
    } else {
      assignments.push({ filename, storagePath: "", productIds: matched.map((p) => p.id) });
      console.log(`  ${filename} → ${matched.map((p) => `${p.sku} (${p.name})`).join(", ")}`);
    }
  }

  if (unmatched.length > 0) {
    console.warn(`\nNo matching products for:`);
    unmatched.forEach((f) => console.warn(`  ✗ ${f}`));
  }

  console.log(`\nUploading ${assignments.length} images…`);
  const BATCH = 5;
  for (let i = 0; i < assignments.length; i += BATCH) {
    const batch = assignments.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (entry) => {
        const buffer = await readFile(path.join(imageDir, entry.filename));
        entry.storagePath = await uploadImage(buffer, entry.filename);
      }),
    );
    console.log(`  Uploaded ${Math.min(i + BATCH, assignments.length)}/${assignments.length}`);
  }

  // Clear existing images for affected products then insert fresh rows
  const affectedIds = [...new Set(assignments.flatMap((a) => a.productIds))];
  if (affectedIds.length > 0) {
    const deleted = await db
      .delete(productImagesTable)
      .where(inArray(productImagesTable.productId, affectedIds))
      .returning({ id: productImagesTable.id });
    console.log(`Removed ${deleted.length} existing image rows`);
  }

  const rows = assignments.flatMap(({ storagePath, productIds }) =>
    productIds.map((productId) => ({
      productId,
      url: storagePath,
      isPrimary: true,
      displayOrder: 0,
      imageKind: "gallery" as const,
      altText: null,
    })),
  );

  const INSERT_BATCH = 50;
  let inserted = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    await db.insert(productImagesTable).values(rows.slice(i, i + INSERT_BATCH));
    inserted += Math.min(INSERT_BATCH, rows.length - i);
  }

  console.log(`\nDone: ${inserted} image rows inserted across ${affectedIds.length} products.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
