import { readFileSync, readdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db, productsTable, productImagesTable } from "@workspace/db";
import { eq, inArray, and, sql } from "drizzle-orm";

const textPath = resolve(process.cwd(), "../attached_assets/Pasted-Slate-Image-Assignments-All-filenames-are-in-the-Homecr_1783558656681.txt");
const text = readFileSync(textPath, "utf-8");
const imageDir = resolve(process.cwd(), "../Homecrest_Slate_Images/");
const fireTableDir = resolve(process.cwd(), "../homecrest_images/Slate Fire Tables/");

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const objectStorage = new Storage({
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

function parsePrivateDir() {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR env var not set");
  const trimmed = dir.startsWith("/") ? dir.slice(1) : dir;
  const slash = trimmed.indexOf("/");
  if (slash === -1) return { bucket: trimmed, prefix: "" };
  return { bucket: trimmed.slice(0, slash), prefix: trimmed.slice(slash + 1) };
}

async function uploadImage(localPath: string, safeFilename: string, bucketName: string, prefix: string): Promise<string> {
  const bucket = objectStorage.bucket(bucketName);
  const objectName = prefix ? `${prefix}/products/homecrest-slate/${safeFilename}` : `products/homecrest-slate/${safeFilename}`;
  const buffer = await readFile(localPath);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/products/homecrest-slate/${safeFilename}`;
}

function getAllImageFiles(): string[] {
  const main = readdirSync(imageDir).filter(f => f.toLowerCase().endsWith('.jpg'));
  const fire: string[] = [];
  try {
    fire.push(...readdirSync(fireTableDir).filter(f => f.toLowerCase().endsWith('.jpg')));
  } catch { /* directory may not exist */ }
  return [...main, ...fire];
}

function findFile(filename: string, allFiles: string[]): string | null {
  const lower = filename.toLowerCase();
  const found = allFiles.find(f => f.toLowerCase() === lower);
  return found || null;
}

function parseAssignments(files: string[]): Array<{ sku: string; filename: string }> {
  const pairs: Array<{ sku: string; filename: string }> = [];
  const seenSkus = new Set<string>();
  const lines = text.split('\n');

  for (const line of lines) {
    const t = line.trim();
    if (!t || !t.includes('.jpg')) continue;
    const data = t.startsWith('SKUImage') ? t.slice(8) : t;

    const positions: number[] = [];
    let idx = 0;
    while ((idx = data.indexOf('.jpg', idx)) !== -1) {
      positions.push(idx);
      idx += 4;
    }

    let prevEnd = 0;
    for (const pos of positions) {
      const segment = data.slice(prevEnd, pos);
      let matchedFile: string | null = null;
      let sku = '';

      for (const file of files) {
        const base = file.slice(0, -4);
        if (segment.endsWith(base)) {
          const candidate = segment.slice(0, segment.length - base.length);
          if (candidate.length > 0) {
            matchedFile = file;
            sku = candidate;
            break;
          }
        }
      }

      if (matchedFile && !seenSkus.has(sku)) {
        seenSkus.add(sku);
        pairs.push({ sku, filename: matchedFile });
      }
      prevEnd = pos + 4;
    }
  }

  return pairs;
}

async function main() {
  const allFiles = getAllImageFiles();
  console.log(`Found ${allFiles.length} local image files`);

  const assignments = parseAssignments(allFiles);
  console.log(`Parsed ${assignments.length} SKU→image assignments`);

  const slateProducts = await db.select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.manufacturerId, 16));

  const skuToProduct = new Map(slateProducts.map(p => [p.sku, p]));
  console.log(`Found ${slateProducts.length} Slate products in DB`);

  const { bucket: bucketName, prefix } = parsePrivateDir();

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  let notFound = 0;

  for (const { sku, filename } of assignments) {
    const product = skuToProduct.get(sku);
    if (!product) {
      console.warn(`SKU not found in DB: ${sku}`);
      notFound++;
      continue;
    }

    const foundFile = findFile(filename, allFiles);
    if (!foundFile) {
      console.warn(`Image file not found: ${filename} for SKU ${sku}`);
      failed++;
      continue;
    }

    const imageDirPath = allFiles.indexOf(foundFile) >= allFiles.indexOf(filename) && readdirSync(imageDir).includes(foundFile) ? imageDir : fireTableDir;
    const filepath = resolve(imageDirPath, foundFile);

    // Remove existing gallery images so the document assignment is exact
    await db.delete(productImagesTable)
      .where(and(eq(productImagesTable.productId, product.id), eq(productImagesTable.imageKind, 'gallery')));

    try {
      const safeName = `${sku.toLowerCase().replace(/[^a-z0-9]/g, '-')}.jpg`;
      const url = await uploadImage(filepath, safeName, bucketName, prefix);
      await db.insert(productImagesTable).values({
        productId: product.id,
        url,
        imageKind: 'gallery',
        displayOrder: 1,
      });
      console.log(`${sku}: uploaded ${filename}`);
      uploaded++;
    } catch (e: any) {
      console.error(`${sku}: FAILED → ${e.message}`);
      failed++;
    }
  }

  console.log(`\nDone: ${uploaded} uploaded, ${skipped} skipped (already had), ${failed} failed, ${notFound} not found in DB`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
