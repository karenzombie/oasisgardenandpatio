import { readFile } from "node:fs/promises";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db, productImagesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

const IMAGE_DIR = resolve(process.cwd(), "../hanamint_collection_images");
const STORAGE_SUBDIR = "products/hanamint";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

// 76 products from CSV: db_id → sku
const PRODUCTS: Array<{ id: number; sku: string; name: string }> = [
  { id: 5319, sku: "722099", name: "Carlisle Rectangular Extension Dining Table" },
  { id: 5309, sku: "309111", name: "Cedar Dining Chair" },
  { id: 5311, sku: "309411", name: "Cedar Club Chair" },
  { id: 5313, sku: "309421", name: "Cedar Loveseat" },
  { id: 5314, sku: "309431", name: "Cedar Sofa" },
  { id: 5316, sku: "309451", name: "Cedar Ottoman" },
  { id: 5431, sku: "048412", name: "Grand Tuscany Club Chair" },
  { id: 5433, sku: "048422", name: "Grand Tuscany Loveseat" },
  { id: 5435, sku: "048432", name: "Grand Tuscany Sofa" },
  { id: 5434, sku: "048452", name: "Grand Tuscany Ottoman" },
  { id: 5425, sku: "048610", name: "Grand Tuscany Square End Table" },
  { id: 5426, sku: "048630", name: "Grand Tuscany Rectangular Coffee Table" },
  { id: 5407, sku: "725090", name: "Inverness Rectangular Enclosed Fire Pit Table" },
  { id: 5331, sku: "294333", name: "Malibu Left Arm Chaise Lounge" },
  { id: 5330, sku: "294334", name: "Malibu Right Arm Chaise Lounge" },
  { id: 5329, sku: "294411", name: "Malibu Club Chair" },
  { id: 5334, sku: "294441", name: "Malibu Left Arm Club Chair" },
  { id: 5332, sku: "294443", name: "Malibu Right Arm Club Chair" },
  { id: 5333, sku: "294445", name: "Malibu Middle Club Chair" },
  { id: 5336, sku: "294449", name: "Malibu Corner Club Chair" },
  { id: 5335, sku: "294451", name: "Malibu Ottoman" },
  { id: 5337, sku: "294621", name: "Malibu Square End Table" },
  { id: 5339, sku: "294794", name: "Malibu Rectangular Coffee Table" },
  { id: 5341, sku: "208141", name: "Mayfair Dining Chair" },
  { id: 5345, sku: "208331", name: "Mayfair Chaise Lounge" },
  { id: 5342, sku: "208341", name: "Mayfair Swivel Rocker" },
  { id: 5344, sku: "208351", name: "Mayfair Swivel Bar Stool" },
  { id: 5343, sku: "208353", name: "Mayfair Swivel Counter Stool" },
  { id: 5346, sku: "208411", name: "Mayfair Estate Club Chair" },
  { id: 5348, sku: "208419", name: "Mayfair Estate Club Swivel Glider" },
  { id: 5352, sku: "208441", name: "Mayfair Estate Club Left Chair" },
  { id: 5350, sku: "208443", name: "Mayfair Estate Club Right Chair" },
  { id: 5351, sku: "208445", name: "Mayfair Estate Club Middle Chair" },
  { id: 5353, sku: "208447", name: "Mayfair Estate Club Corner Chair" },
  { id: 5349, sku: "208451", name: "Mayfair Estate Ottoman" },
  { id: 5369, sku: "321413", name: "Melbourne Club Chair" },
  { id: 5370, sku: "321418", name: "Melbourne Club Swivel Rocker" },
  { id: 5374, sku: "321441", name: "Melbourne Left Arm Club Chair" },
  { id: 5372, sku: "321443", name: "Melbourne Right Arm Club Chair" },
  { id: 5373, sku: "321445", name: "Melbourne Middle Arm Club Chair" },
  { id: 5376, sku: "704131", name: "Santa Barbara Full Cushion Dining Chair" },
  { id: 5381, sku: "704331", name: "Santa Barbara Chaise Lounge" },
  { id: 5377, sku: "704341", name: "Santa Barbara Full Cushion Swivel Rocker" },
  { id: 5385, sku: "704428", name: "Santa Barbara Loveseat Glider" },
  { id: 5387, sku: "704453", name: "Santa Barbara Ottoman" },
  { id: 5388, sku: "247141", name: "Stratford Dining Chair" },
  { id: 2948, sku: "247142", name: "Stratford Sling Dining Chair" },
  { id: 5390, sku: "247331", name: "Stratford Chaise Lounge" },
  { id: 2932, sku: "247336", name: "Stratford Sling Chaise Lounge" },
  { id: 5389, sku: "247341", name: "Stratford Swivel Rocker" },
  { id: 2933, sku: "247342", name: "Stratford Sling Swivel Rocker" },
  { id: 5392, sku: "247351", name: "Stratford Swivel Bar Stool" },
  { id: 5391, sku: "247353", name: "Stratford Swivel Counter Stool" },
  { id: 5394, sku: "247412", name: "Stratford Estate Club Chair" },
  { id: 5399, sku: "247442", name: "Stratford Estate Club Left Chair" },
  { id: 5397, sku: "247444", name: "Stratford Estate Club Right Chair" },
  { id: 5398, sku: "247445", name: "Stratford Estate Club Middle Chair" },
  { id: 5396, sku: "247447", name: "Stratford Estate Club Corner Chair" },
  { id: 5393, sku: "247451", name: "Stratford Estate Ottoman" },
  { id: 5400, sku: "317112", name: "Sydney Sling Dining Chair" },
  { id: 5401, sku: "317342", name: "Sydney Sling Swivel Rocker" },
  { id: 5403, sku: "317412", name: "Sydney Sling Club Chair" },
  { id: 5404, sku: "317418", name: "Sydney Sling Club Swivel Rocker" },
  { id: 5405, sku: "317422", name: "Sydney Sling Loveseat" },
  { id: 5408, sku: "018130", name: "Tuscany Dining Chair" },
  { id: 5410, sku: "018140", name: "Tuscany Bench" },
  { id: 5409, sku: "018240", name: "Tuscany Swivel Rocker" },
  { id: 5413, sku: "018250", name: "Tuscany Swivel Bar Stool" },
  { id: 5412, sku: "018280", name: "Tuscany Swivel Counter Stool" },
  { id: 5411, sku: "018300", name: "Tuscany Chaise Lounge" },
  { id: 5436, sku: "248141", name: "Westfield Dining Chair" },
  { id: 5437, sku: "248341", name: "Westfield Swivel Rocker" },
  { id: 5440, sku: "248351", name: "Westfield Swivel Bar Stool" },
  { id: 5439, sku: "248353", name: "Westfield Swivel Counter Stool" },
];

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

function parsePrivateDir(): { bucket: string; prefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR env var not set");
  const trimmed = dir.startsWith("/") ? dir.slice(1) : dir;
  const slash = trimmed.indexOf("/");
  if (slash === -1) return { bucket: trimmed, prefix: "" };
  return { bucket: trimmed.slice(0, slash), prefix: trimmed.slice(slash + 1) };
}

async function uploadImage(
  localPath: string,
  safeFilename: string,
  bucketName: string,
  prefix: string,
): Promise<string> {
  const objectName = prefix
    ? `${prefix}/${STORAGE_SUBDIR}/${safeFilename}`
    : `${STORAGE_SUBDIR}/${safeFilename}`;
  const buffer = await readFile(localPath);
  const contentType = safeFilename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
  const file = objectStorage.bucket(bucketName).file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${safeFilename}`;
}

/** Group all image files by SKU (first 6 chars), sorted alphabetically (case-insensitive). */
function groupFilesBySku(): Map<string, string[]> {
  const allFiles = readdirSync(IMAGE_DIR).filter((f) => {
    const lower = f.toLowerCase();
    return lower.endsWith(".jpg") || lower.endsWith(".jpeg") || lower.endsWith(".png");
  });

  const grouped = new Map<string, string[]>();
  for (const file of allFiles) {
    const sku = file.slice(0, 6);
    if (!/^\d{6}$/.test(sku)) continue; // skip anything not starting with 6 digits
    if (!grouped.has(sku)) grouped.set(sku, []);
    grouped.get(sku)!.push(file);
  }

  // Sort each group alphabetically (case-insensitive) — first = primary
  for (const [sku, files] of grouped) {
    grouped.set(
      sku,
      files.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
    );
  }

  return grouped;
}

async function main() {
  const { bucket: bucketName, prefix } = parsePrivateDir();
  const filesBySku = groupFilesBySku();

  console.log(`\nImage folder: ${IMAGE_DIR}`);
  console.log(`Object Storage subdir: ${STORAGE_SUBDIR}`);
  console.log(`Found SKUs with images: ${filesBySku.size}`);

  let totalUploaded = 0;
  let totalFailed = 0;
  let skuNoFiles = 0;

  for (const product of PRODUCTS) {
    const files = filesBySku.get(product.sku);
    if (!files || files.length === 0) {
      console.warn(`[SKIP] ${product.sku} (${product.name}) — no image files found`);
      skuNoFiles++;
      continue;
    }

    console.log(`\n[${product.sku}] ${product.name} — ${files.length} file(s)`);

    // Delete ALL existing gallery images for this product
    const deleted = await db
      .delete(productImagesTable)
      .where(
        and(
          eq(productImagesTable.productId, product.id),
          eq(productImagesTable.imageKind, "gallery"),
        ),
      );
    console.log(`  Cleared existing images`);

    // Upload and insert each file; first = primary
    let productFailed = false;
    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      const isPrimary = i === 0;
      // Sanitize: replace anything non-alphanumeric (except hyphens and dots) with hyphens
      const safeFilename = filename
        .toLowerCase()
        .replace(/[^a-z0-9.\-]/g, "-")
        .replace(/-+/g, "-");

      const localPath = resolve(IMAGE_DIR, filename);
      try {
        const url = await uploadImage(localPath, safeFilename, bucketName, prefix);
        await db.insert(productImagesTable).values({
          productId: product.id,
          url,
          isPrimary,
          displayOrder: i,
          imageKind: "gallery",
          altText: product.name,
        }).onConflictDoNothing();
        console.log(`  [${isPrimary ? "PRIMARY" : `secondary ${i}`}] ${filename} → ${url}`);
        totalUploaded++;
      } catch (e: any) {
        console.error(`  FAILED: ${filename} → ${e.message}`);
        productFailed = true;
        totalFailed++;
      }
    }

    if (productFailed) {
      console.warn(`  [WARN] ${product.sku} had upload failures`);
    }
  }

  console.log(`\n========================================`);
  console.log(`Done.`);
  console.log(`  Images uploaded : ${totalUploaded}`);
  console.log(`  Upload failures : ${totalFailed}`);
  console.log(`  SKUs no files   : ${skuNoFiles}`);
  console.log(`========================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
