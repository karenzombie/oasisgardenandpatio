import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { fabricsTable } from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";

const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "fabrics/swatches";
const SWATCH_DIR = join(import.meta.dirname, "../../telescope_fabric_swatches");
const TELESCOPE_MFG_ID = 23;
const DRY_RUN = process.env.DRY_RUN === "1";

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

async function uploadSwatch(
  buffer: Buffer,
  storageKey: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${storageKey}`;
  const parts = fullPath.replace(/^\//, "").split("/");
  const bucketName = parts[0];
  const objectName = parts.slice(1).join("/");
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: "image/jpeg", resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${storageKey}`;
}

async function main() {
  let files: string[];
  try {
    files = await readdir(SWATCH_DIR);
  } catch {
    console.error(`Swatch directory not found: ${SWATCH_DIR}`);
    process.exit(1);
  }

  const imageFiles = files.filter((f) => f.toLowerCase().endsWith(".jpg"));
  console.log(`Found ${imageFiles.length} telescope swatch files`);

  // Find Telescope fabrics missing swatch images
  const missingFabrics = await db
    .select({ id: fabricsTable.id, itemNumber: fabricsTable.itemNumber })
    .from(fabricsTable)
    .where(
      and(
        eq(fabricsTable.manufacturerId, TELESCOPE_MFG_ID),
        isNull(fabricsTable.swatchImageUrl),
      ),
    );

  console.log(`Telescope fabrics missing swatches: ${missingFabrics.length}`);

  const missingByItem = new Map(
    missingFabrics.map((f) => [f.itemNumber.toUpperCase(), f.id]),
  );

  let matched = 0;
  let uploaded = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const unmatched: string[] = [];
  const BATCH = 10;

  for (let i = 0; i < imageFiles.length; i += BATCH) {
    const batch = imageFiles.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (filename) => {
        const itemNumber = filename.replace(/\.jpg$/i, "");
        const fabricId = missingByItem.get(itemNumber.toUpperCase());

        if (!fabricId) {
          unmatched.push(itemNumber);
          return;
        }
        matched++;

        if (DRY_RUN) {
          console.log(`  [dry-run] ${itemNumber} → ${filename}`);
          return;
        }

        try {
          const buffer = await readFile(join(SWATCH_DIR, filename));
          const storageKey = `telescope-${itemNumber}.jpg`;
          const url = await uploadSwatch(buffer, storageKey);
          uploaded++;

          await db
            .update(fabricsTable)
            .set({ swatchImageUrl: url })
            .where(eq(fabricsTable.id, fabricId));
          updated++;
        } catch (err) {
          errors++;
          console.error(`  ERROR ${itemNumber}:`, err);
        }
      }),
    );

    console.log(
      `  Progress: ${Math.min(i + BATCH, imageFiles.length)}/${imageFiles.length}` +
        ` (matched ${matched}, uploaded ${uploaded}, updated ${updated}, errors ${errors})`,
    );
  }

  console.log(`\nSummary:`);
  console.log(`  Swatch files:      ${imageFiles.length}`);
  console.log(`  Missing fabrics:   ${missingFabrics.length}`);
  console.log(`  Matched:           ${matched}`);
  console.log(`  Uploaded:          ${uploaded}`);
  console.log(`  DB updated:        ${updated}`);
  console.log(`  Errors:            ${errors}`);
  console.log(`  Unmatched files:   ${unmatched.length}`);

  if (unmatched.length > 0 && unmatched.length <= 50) {
    console.log("  Unmatched item numbers:", unmatched.join(", "));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
