import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { productImagesTable } from "@workspace/db/schema";

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

async function uploadImage(
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/products/owlee/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/products/owlee/${filename}`;
}

// product_id → image filename in OWLEE_Table_Tops_Images/
const assignments: Array<{ productId: number; filename: string; name: string }> = [
  { productId: 5491, filename: "E-TopsCitySeries.png",  name: "City Series Porcelain Tops" },
  { productId: 5492, filename: "D-TopsDakota.jpg",      name: "Dakota Porcelain Tops" },
  { productId: 5493, filename: "V-Tops_Valencia.jpg",   name: "Valencia Porcelain Tops" },
  { productId: 5494, filename: "K-TopsDekton.jpg",      name: "Dekton Tops" },
  { productId: 5495, filename: "MM-TopsMicroMesh.jpg",  name: "Micro Mesh Tops" },
  { productId: 5490, filename: "P-TopsFresco.jpg",      name: "Fresco Porcelain Tops" },
  { productId: 6336, filename: "W-TopsReclaimed.png",   name: "Reclaimed Porcelain Tops" },
];

function contentTypeFor(filename: string): string {
  return filename.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
}

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imageDir = path.resolve(__dirname, "../../OWLEE_Table_Tops_Images");

  console.log("Uploading OW Lee table tops images…\n");

  const rows: Array<{
    productId: number;
    url: string;
    isPrimary: boolean;
    displayOrder: number;
    imageKind: string;
    altText: string | null;
  }> = [];

  for (const { productId, filename, name } of assignments) {
    try {
      const buffer = await readFile(path.join(imageDir, filename));
      const contentType = contentTypeFor(filename);
      const storagePath = await uploadImage(buffer, filename, contentType);
      rows.push({
        productId,
        url: storagePath,
        isPrimary: true,
        displayOrder: 0,
        imageKind: "gallery",
        altText: null,
      });
      console.log(`  ✓ ${name} (${productId}) → ${storagePath}`);
    } catch (err) {
      console.error(`  ✗ ${name} (${productId}): ${err}`);
    }
  }

  if (rows.length === 0) {
    console.error("\nNo images uploaded — aborting DB insert.");
    process.exit(1);
  }

  await db.insert(productImagesTable).values(rows);
  console.log(`\nInserted ${rows.length} product_images rows.`);
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
