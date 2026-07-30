import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { productImagesTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";

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

async function uploadImage(buffer: Buffer, sku: string, filename: string): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/products/northcape/${sku}/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/products/northcape/${sku}/${filename}`;
}

// ---------------------------------------------------------------------------
// Assignment map: product_id → sku → { primaryFile, secondaryFiles[] }
// Files are in /home/runner/workspace/Northcape_Valencia_Images/
// ---------------------------------------------------------------------------

// Format: { sku, productId, primaryFile, secondaryFiles }
const assignments = [
  {
    sku: "NC65003S-TAN",
    productId: 5504,
    primaryFile: "NC65003S-primary.jpg",
    secondaryFiles: ["NC65003S.jpg"],
  },
  {
    sku: "NC6500LS-TAN",
    productId: 5505,
    primaryFile: "NC6500LS-primary.jpg",
    secondaryFiles: ["NC6500LS.jpg"],
  },
  {
    sku: "NC6500C-TAN",
    productId: 5506,
    primaryFile: "NC6500-primary.jpg",
    secondaryFiles: ["NC6500.jpg"],
  },
  {
    sku: "NC6500SR-TAN",
    productId: 5507,
    primaryFile: "NC6500SR-primary.jpg",
    secondaryFiles: ["NC6500SR.jpg"],
  },
];

// Files present in folder but no matching product:
// NC6400DC.jpg, NC6400DC-primary.jpg → no NC6400DC product in DB
// NC6400DT-primary.jpg               → no NC6400DT product in DB
// NC6400OT.jpg, NC6400OT-primary.jpg → no NC6400OT product in DB

async function main() {
  const imageDir = "/home/runner/workspace/Northcape_Valencia_Images";

  console.log(`Processing ${assignments.length} products…`);
  console.log("");

  // Upload images per product and collect storage paths
  const storagePaths = new Map<string, string>(); // localFilename → /objects path

  for (const { sku, productId, primaryFile, secondaryFiles } of assignments) {
    const allFiles = [primaryFile, ...secondaryFiles];
    console.log(`[${sku}] (product ${productId}) — uploading ${allFiles.length} image(s)`);

    for (const filename of allFiles) {
      const localPath = path.join(imageDir, filename);
      try {
        const buffer = await readFile(localPath);
        const storagePath = await uploadImage(buffer, sku, filename);
        storagePaths.set(filename, storagePath);
        console.log(`  ✓ ${filename} → ${storagePath}`);
      } catch (err) {
        console.error(`  ✗ ERROR uploading "${filename}":`, err);
      }
    }
  }

  console.log("");

  // Clear any existing images for these products (clean slate)
  const productIds = assignments.map((a) => a.productId);
  const deleted = await db
    .delete(productImagesTable)
    .where(inArray(productImagesTable.productId, productIds))
    .returning({ id: productImagesTable.id });
  console.log(`Removed ${deleted.length} existing image rows for ${productIds.length} products`);

  // Build insert rows
  const rows: Array<{
    productId: number;
    url: string;
    isPrimary: boolean;
    displayOrder: number;
    imageKind: string;
    altText: string | null;
  }> = [];

  for (const { productId, primaryFile, secondaryFiles } of assignments) {
    const primaryPath = storagePaths.get(primaryFile);
    if (!primaryPath) {
      console.warn(`  WARN: primary "${primaryFile}" was not uploaded for product ${productId} — skipping`);
      continue;
    }
    rows.push({
      productId,
      url: primaryPath,
      isPrimary: true,
      displayOrder: 0,
      imageKind: "gallery",
      altText: null,
    });
    secondaryFiles.forEach((filename, idx) => {
      const secPath = storagePaths.get(filename);
      if (secPath) {
        rows.push({
          productId,
          url: secPath,
          isPrimary: false,
          displayOrder: idx + 1,
          imageKind: "gallery",
          altText: null,
        });
      }
    });
  }

  if (rows.length === 0) {
    console.error("No rows to insert — aborting.");
    process.exit(1);
  }

  await db.insert(productImagesTable).values(rows);
  console.log(`Inserted ${rows.length} product_images rows across ${productIds.length} products`);

  console.log("");
  console.log("Unmatched files (no product in DB):");
  console.log("  NC6400DC.jpg, NC6400DC-primary.jpg  — no NC6400DC product");
  console.log("  NC6400DT-primary.jpg                — no NC6400DT product");
  console.log("  NC6400OT.jpg, NC6400OT-primary.jpg  — no NC6400OT product");
  console.log("");
  console.log("Products with no matching image file (still image-less):");
  console.log("  NC6500LL-TAN (5509) — Valencia Sectional Left Arm Loveseat");
  console.log("  NC6500RL-TAN (5510) — Valencia Sectional Right Arm Loveseat");
  console.log("  NC6500SCC-TAN (5511) — Valencia Sectional 90 Degree Corner");
  console.log("  NC6500SCM (5508) — Valencia Sectional Middle Armless");
  console.log("");
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
