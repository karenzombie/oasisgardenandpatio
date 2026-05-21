import { readdir, readFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { fabricsTable } from "@workspace/db/schema";
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
  const swatchDir = path.resolve(__dirname, "../../sunbrella_swatches");
  const files = (await readdir(swatchDir)).filter((f) =>
    f.toLowerCase().endsWith(".jpg"),
  );

  console.log(`Found ${files.length} swatch files`);

  let uploaded = 0;
  let skipped = 0;
  let errors = 0;
  const BATCH = 10;

  for (let i = 0; i < files.length; i += BATCH) {
    const batch = files.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (filename) => {
        const itemNumber = filename.replace(/\.jpg$/i, "");
        try {
          const buffer = await readFile(path.join(swatchDir, filename));
          const storagePath = await uploadBuffer(
            buffer,
            "image/jpeg",
            "fabrics/swatches",
            filename,
          );
          const result = await db
            .update(fabricsTable)
            .set({ swatchImageUrl: storagePath })
            .where(eq(fabricsTable.itemNumber, itemNumber))
            .returning({ id: fabricsTable.id });

          if (result.length === 0) {
            console.warn(`  WARN: no fabric found for item number ${itemNumber}`);
            skipped++;
          } else {
            uploaded++;
          }
        } catch (err) {
          console.error(`  ERROR uploading ${filename}:`, err);
          errors++;
        }
      }),
    );
    console.log(
      `  Progress: ${Math.min(i + BATCH, files.length)}/${files.length} processed (${uploaded} uploaded, ${skipped} skipped, ${errors} errors)`,
    );
  }

  console.log(`\nDone. ${uploaded} uploaded, ${skipped} skipped, ${errors} errors.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
