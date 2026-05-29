import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { fabricsTable } from "@workspace/db";
import { eq, isNull, and } from "drizzle-orm";

const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "fabrics/swatches";
const IMG_DIR = join(
  import.meta.dirname,
  "../../frankford_images/frankford_fabric_swatches_updated",
);
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
  localFilename: string,
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
  const buffer = await readFile(join(IMG_DIR, localFilename));
  const ct = localFilename.endsWith(".png") ? "image/png" : "image/jpeg";
  await file.save(buffer, { contentType: ct, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${storageKey}`;
}

function extractItemNumberFromFilename(filename: string): string | null {
  const stem = filename.replace(/\.[^.]+$/, "");

  // Outdura pattern: outdura_{collection}_{name}_{ITEM_NUMBER}
  // e.g. outdura_sparkle_sparkle-pesto_1702  → 1702
  // e.g. outdura_jinga_jinga-nautical_213J   → 213J
  const outduraMatch = stem.match(/^outdura_.+_(.+)$/);
  if (outduraMatch) return outduraMatch[1].toUpperCase();

  // Tempotest pattern: tempotest_{collection}_{name}_{ITEM_DASHED}
  // e.g. tempotest_foundations_ottomano-sand_1276-501 → 1276/501
  // e.g. tempotest_foundations_ciao-white_15-615      → 15/615
  const tempoMatch = stem.match(/^tempotest_.+_([0-9].+)$/);
  if (tempoMatch) {
    const raw = tempoMatch[1];
    // Replace the LAST dash-number group that looks like a slash replacement
    // Pattern: {base}-{suffix} where both parts are numbers → {base}/{suffix}
    return raw.replace(/^(\d+(?:\/\d+)*)-(\d+)$/, "$1/$2");
  }

  return null;
}

async function main() {
  const files = await readdir(IMG_DIR);
  const ext = (f: string) => f.split(".").pop()?.toLowerCase() ?? "";
  const imageFiles = files.filter((f) => ["jpg", "jpeg", "png"].includes(ext(f)));

  // Build lookup: normalizedItemNumber → filename
  const fileMap = new Map<string, string>();
  let noMatch = 0;
  for (const f of imageFiles) {
    const itemNum = extractItemNumberFromFilename(f);
    if (itemNum) {
      fileMap.set(itemNum.toUpperCase(), f);
    } else {
      noMatch++;
    }
  }
  console.log(
    `Indexed ${fileMap.size} files from folder (${noMatch} unrecognized pattern).`,
  );

  // Query missing fabrics
  const missing = await db
    .select({ id: fabricsTable.id, itemNumber: fabricsTable.itemNumber, name: fabricsTable.name })
    .from(fabricsTable)
    .where(
      and(
        eq(fabricsTable.manufacturerId, 28),
        isNull(fabricsTable.swatchImageUrl),
      ),
    );
  console.log(`Found ${missing.length} fabrics missing swatch images.`);

  let matched = 0;
  let uploaded = 0;
  let updated = 0;
  let errors = 0;
  const unmatched: string[] = [];

  for (const fabric of missing) {
    const key = fabric.itemNumber.toUpperCase();
    const localFile = fileMap.get(key);
    if (!localFile) {
      unmatched.push(fabric.itemNumber);
      continue;
    }
    matched++;

    if (DRY_RUN) {
      console.log(`  [dry-run] ${fabric.itemNumber} → ${localFile}`);
      continue;
    }

    try {
      const storageKey = `frankford-${fabric.itemNumber.replace(/[/\\]/g, "-")}.${ext(localFile)}`;
      const url = await uploadSwatch(localFile, storageKey);
      uploaded++;

      await db
        .update(fabricsTable)
        .set({ swatchImageUrl: url })
        .where(eq(fabricsTable.id, fabric.id));
      updated++;

      if (updated % 25 === 0) {
        console.log(`  ${updated}/${matched} updated…`);
      }
    } catch (err) {
      errors++;
      console.error(`  ERROR uploading ${fabric.itemNumber}:`, err);
    }
  }

  console.log(`
Summary:
  Fabrics missing:  ${missing.length}
  Matched to files: ${matched}
  Uploaded:         ${uploaded}
  DB updated:       ${updated}
  Errors:           ${errors}
  Still unmatched:  ${unmatched.length}
`);

  if (unmatched.length > 0 && unmatched.length <= 30) {
    console.log("Unmatched item numbers:", unmatched.join(", "));
  } else if (unmatched.length > 30) {
    console.log("First 30 unmatched:", unmatched.slice(0, 30).join(", "));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
