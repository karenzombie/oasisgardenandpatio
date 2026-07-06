/**
 * Upload the Shoreline color-variant gallery photos (`shoreline_color_images/`,
 * workspace root — extracted from the customer-supplied Dropbox folder) and
 * attach them to the matching products as additional gallery images.
 *
 * Image files are named `SKU_suffix.png` (e.g. `SL-calirondack_white.png`,
 * `SL-cafe-arm-dining-counter-bar-chair_dove-grey-counter-height.png`, or the
 * dining-table lifestyle shots `SL-round-dining-table_ex-round-w-cafe-chairs.png`).
 * Matching is by exact SKU prefix (`${sku}_`) against `products.sku`.
 *
 * These are appended AFTER the existing hero image (kept as isPrimary) with
 * increasing displayOrder — no existing rows are deleted. Idempotent via the
 * (productId, url) unique index (onConflictDoNothing).
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/uploadShorelineColorImages.ts
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Storage } from "@google-cloud/storage";
import { and, eq, max } from "drizzle-orm";
import { db, productsTable, productImagesTable } from "@workspace/db";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const IMAGE_DIRNAME = "shoreline_color_images";
const STORAGE_SUBDIR = "products/shoreline-color";

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
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const file = storage.bucket(bucketName).file(objectName);
  await file.save(buffer, { contentType: "image/png", resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

async function findAllFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await findAllFiles(full)));
    } else if (/\.(png|jpe?g)$/i.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

async function main(): Promise<void> {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imageDir = path.resolve(__dirname, "../..", IMAGE_DIRNAME);
  const filePaths = await findAllFiles(imageDir);
  console.log(`Found ${filePaths.length} image files under ${IMAGE_DIRNAME}/`);

  const products = await db
    .select({ id: productsTable.id, sku: productsTable.sku })
    .from(productsTable);
  const shorelineProducts = products.filter((p) => p.sku?.startsWith("SL-"));

  const assignments = new Map<number, { filePath: string; filename: string }[]>();
  const noMatch: string[] = [];
  for (const filePath of filePaths) {
    const filename = path.basename(filePath);
    const match = shorelineProducts
      .filter((p) => p.sku && filename.startsWith(`${p.sku}_`))
      .sort((a, b) => (b.sku?.length ?? 0) - (a.sku?.length ?? 0))[0]; // longest sku wins
    if (!match) {
      noMatch.push(filename);
      continue;
    }
    const list = assignments.get(match.id) ?? [];
    list.push({ filePath, filename });
    assignments.set(match.id, list);
  }

  if (noMatch.length > 0) {
    console.warn(`WARNING: ${noMatch.length} files did not match any SKU:`);
    noMatch.forEach((f) => console.warn(`  - ${f}`));
  }
  console.log(`Matched files for ${assignments.size} products`);

  let uploaded = 0;
  let inserted = 0;
  let skippedExisting = 0;

  for (const [productId, files] of assignments.entries()) {
    files.sort((a, b) => a.filename.localeCompare(b.filename));

    const [{ value: currentMax } = { value: null }] = await db
      .select({ value: max(productImagesTable.displayOrder) })
      .from(productImagesTable)
      .where(eq(productImagesTable.productId, productId));
    let nextOrder = (currentMax ?? -1) + 1;

    for (const { filePath, filename } of files) {
      const url = `/objects/${STORAGE_SUBDIR}/${filename}`;

      const [existing] = await db
        .select({ id: productImagesTable.id })
        .from(productImagesTable)
        .where(and(eq(productImagesTable.productId, productId), eq(productImagesTable.url, url)))
        .limit(1);
      if (existing) {
        skippedExisting++;
        continue;
      }

      const buffer = await readFile(filePath);
      await uploadImage(buffer, filename);
      uploaded++;

      await db.insert(productImagesTable).values({
        productId,
        variantId: null,
        url,
        altText: null,
        displayOrder: nextOrder++,
        isPrimary: false,
        imageKind: "gallery",
      });
      inserted++;
    }
  }

  console.log(
    `Done. uploaded=${uploaded} inserted=${inserted} skippedExisting=${skippedExisting} unmatched=${noMatch.length}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
