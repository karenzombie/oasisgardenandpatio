import { readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { categoriesTable } from "@workspace/db/schema";
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
  subdir: string,
  filename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${subdir}/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${subdir}/${filename}`;
}

async function main() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const imagePath = path.resolve(
    __dirname,
    "../../attached_assets/umbrella_category_image_1780965978290.jpg",
  );

  console.log(`Reading image: ${imagePath}`);
  const buffer = await readFile(imagePath);

  const storagePath = await uploadBuffer(
    buffer,
    "image/jpeg",
    "categories",
    "umbrellas.jpg",
  );
  console.log(`Uploaded to: ${storagePath}`);

  const result = await db
    .update(categoriesTable)
    .set({ imageUrl: storagePath })
    .where(eq(categoriesTable.id, 38))
    .returning({ id: categoriesTable.id, name: categoriesTable.name });

  console.log(`Updated category:`, result[0]);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
