import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { fabricsTable, finishesTable } from "@workspace/db";
import { eq, and, isNull, isNotNull } from "drizzle-orm";

const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "fabrics/swatches";
const WEB_PUBLIC_DIR = join(import.meta.dirname, "../../artifacts/web/public");
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

async function uploadBuffer(
  buffer: Buffer,
  contentType: string,
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
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${storageKey}`;
}

async function main() {
  // Telescope fabrics missing swatches
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

  // Telescope finishes with images
  const telescopeFinishes = await db
    .select({
      id: finishesTable.id,
      itemNumber: finishesTable.itemNumber,
      imageUrl: finishesTable.imageUrl,
    })
    .from(finishesTable)
    .where(
      and(
        eq(finishesTable.manufacturerId, TELESCOPE_MFG_ID),
        isNotNull(finishesTable.imageUrl),
      ),
    );
  console.log(`Telescope finishes with images: ${telescopeFinishes.length}`);

  // Build map: item_number -> imageUrl (skip null itemNumbers)
  const finishByItem = new Map<string, string>();
  for (const f of telescopeFinishes) {
    if (f.itemNumber) {
      finishByItem.set(f.itemNumber.toUpperCase(), f.imageUrl!);
    }
  }

  let matched = 0;
  let uploaded = 0;
  let updated = 0;
  let skipped = 0;
  let errors = 0;
  const notFoundFiles: string[] = [];
  const unmatched: string[] = [];

  for (const fabric of missingFabrics) {
    const key = fabric.itemNumber.toUpperCase();
    const imagePath = finishByItem.get(key);

    if (!imagePath) {
      unmatched.push(fabric.itemNumber);
      continue;
    }
    matched++;

    // Resolve physical file path
    const localPath = join(WEB_PUBLIC_DIR, imagePath);
    const ext = imagePath.split(".").pop()?.toLowerCase() ?? "jpg";
    const contentType = ext === "png" ? "image/png" : "image/jpeg";

    if (DRY_RUN) {
      console.log(`  [dry-run] ${fabric.itemNumber} → ${imagePath}`);
      continue;
    }

    try {
      const buffer = await readFile(localPath);
      const storageKey = `telescope-finish-${fabric.itemNumber}.${ext}`;
      const url = await uploadBuffer(buffer, contentType, storageKey);
      uploaded++;

      await db
        .update(fabricsTable)
        .set({ swatchImageUrl: url })
        .where(eq(fabricsTable.id, fabric.id));
      updated++;

      if (updated % 10 === 0) {
        console.log(`  ${updated}/${matched} updated…`);
      }
    } catch (err: unknown) {
      if ((err as { code?: string }).code === "ENOENT") {
        notFoundFiles.push(imagePath);
        skipped++;
      } else {
        errors++;
        console.error(`  ERROR ${fabric.itemNumber}:`, err);
      }
    }
  }

  console.log(`\nSummary:`);
  console.log(`  Missing fabrics:   ${missingFabrics.length}`);
  console.log(`  Matched:           ${matched}`);
  console.log(`  Uploaded:          ${uploaded}`);
  console.log(`  DB updated:        ${updated}`);
  console.log(`  Files not found:   ${skipped}`);
  console.log(`  Errors:            ${errors}`);
  console.log(`  Still unmatched:   ${unmatched.length}`);

  if (notFoundFiles.length > 0) {
    console.log(`\n  Files not found on disk (${notFoundFiles.length}):`);
    for (const p of notFoundFiles.slice(0, 20)) {
      console.log(`    - ${p}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
