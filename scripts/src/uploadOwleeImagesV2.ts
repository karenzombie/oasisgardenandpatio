/**
 * Upload the revised OW Lee photos (`owlee_images_v2_revised_6-10-2026/`,
 * workspace root) and (re)attach them to the matching products.
 *
 * Image files are named `SKU_Collection_Name.jpg`. Matching is by product
 * SKU against the DB (manufacturer 13):
 *   - normal SKUs: file === `${sku}.jpg` OR file starts with `${sku}_`
 *   - the 3 dup fire-pit SKUs (stored as `${base}-PH` / `${base}-VO`): match
 *     the file for the same base whose name contains the collection
 *     (Phoenix / Volante)
 *   - two SKUs whose photo is named descriptively rather than by SKU use an
 *     explicit override map
 *
 * Uploads to Object Storage under `/products/owlee-v2/` and replaces all
 * `product_images` rows for the touched products (clean slate). Idempotent.
 *
 * Run AFTER loadOwLeeV2.ts:
 *   pnpm --filter @workspace/scripts exec tsx src/uploadOwleeImagesV2.ts
 */
import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Storage } from "@google-cloud/storage";
import { eq, inArray } from "drizzle-orm";
import { db, productsTable, productImagesTable } from "@workspace/db";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const MANUFACTURER_ID = 13;
const IMAGE_DIRNAME = "owlee_images_v2_revised_6-10-2026";

// SKUs whose photo is named descriptively instead of by SKU.
const OVERRIDE_FILE: Record<string, string> = {
  "E-4284RTD": "Table_Tops_42_x_84_Porcelain_Table_Top.jpg",
  "MM-3658RTU": "Table_Tops_36_x_58_Micro_Mesh_Top_with_Umbrella_Hole.jpg",
};

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
  return { bucketName: parts[0]!, objectName: parts.slice(1).join("/") };
}

async function uploadImage(buffer: Buffer, filename: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/products/owlee-v2/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const file = storage.bucket(bucketName).file(objectName);
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/products/owlee-v2/${filename}`;
}

function matchFiles(
  sku: string,
  collection: string,
  files: string[],
): string[] {
  if (OVERRIDE_FILE[sku]) {
    const f = OVERRIDE_FILE[sku]!;
    return files.includes(f) ? [f] : [];
  }
  // Dup fire pits stored as base-PH / base-VO.
  const dup = sku.match(/^(.*)-(PH|VO)$/);
  if (dup && (collection.toLowerCase() === "phoenix" || collection.toLowerCase() === "volante")) {
    const base = dup[1]!;
    return files.filter(
      (f) =>
        f.startsWith(`${base}_`) &&
        f.toLowerCase().includes(collection.toLowerCase()),
    );
  }
  const exact = files.filter((f) => f === `${sku}.jpg`);
  if (exact.length > 0) return exact;
  return files.filter((f) => f.startsWith(`${sku}_`));
}

async function main(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imageDir = path.resolve(__dirname, "../..", IMAGE_DIRNAME);
  const files = readdirSync(imageDir).filter((f) =>
    /\.(jpe?g|png)$/i.test(f),
  );
  console.log(`Found ${files.length} image files in ${IMAGE_DIRNAME}`);

  const products = await db
    .select({
      id: productsTable.id,
      sku: productsTable.sku,
      specs: productsTable.specs,
    })
    .from(productsTable)
    .where(eq(productsTable.manufacturerId, MANUFACTURER_ID));

  // productId -> ordered filenames (primary first)
  const assignments = new Map<number, string[]>();
  const usedFiles = new Set<string>();
  let noMatch = 0;
  for (const p of products) {
    if (!p.sku) continue;
    const collection = String(
      (p.specs as Record<string, unknown> | null)?.collection ?? "",
    );
    const matched = matchFiles(p.sku, collection, files).sort();
    if (matched.length === 0) {
      noMatch += 1;
      continue;
    }
    assignments.set(p.id, matched);
    matched.forEach((f) => usedFiles.add(f));
  }
  console.log(
    `Matched images for ${assignments.size} products (${noMatch} mfr-13 products had no v2 image and were left untouched)`,
  );

  const unused = files.filter((f) => !usedFiles.has(f));
  if (unused.length > 0) {
    console.warn(`WARNING: ${unused.length} image files were not used:`);
    unused.forEach((f) => console.warn(`  - ${f}`));
  }

  // Upload every needed file (overwrites are fine — idempotent).
  const storagePaths = new Map<string, string>();
  const allFiles = [...usedFiles];
  const BATCH = 5;
  for (let i = 0; i < allFiles.length; i += BATCH) {
    const batch = allFiles.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (filename) => {
        const buffer = await readFile(path.join(imageDir, filename));
        storagePaths.set(filename, await uploadImage(buffer, filename));
      }),
    );
    console.log(`  uploaded ${Math.min(i + BATCH, allFiles.length)}/${allFiles.length}`);
  }

  // Replace all image rows for the touched products.
  const productIds = [...assignments.keys()];
  for (let i = 0; i < productIds.length; i += 200) {
    await db
      .delete(productImagesTable)
      .where(inArray(productImagesTable.productId, productIds.slice(i, i + 200)));
  }

  const rows: Array<{
    productId: number;
    url: string;
    isPrimary: boolean;
    displayOrder: number;
    imageKind: string;
    altText: string | null;
  }> = [];
  for (const [productId, filenames] of assignments.entries()) {
    filenames.forEach((filename, idx) => {
      const url = storagePaths.get(filename);
      if (!url) return;
      rows.push({
        productId,
        url,
        isPrimary: idx === 0,
        displayOrder: idx,
        imageKind: "gallery",
        altText: null,
      });
    });
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    await db.insert(productImagesTable).values(batch);
    inserted += batch.length;
  }
  console.log(
    `Inserted ${inserted} product_images rows for ${assignments.size} products. Done.`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
