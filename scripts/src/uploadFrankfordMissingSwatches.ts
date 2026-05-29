import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { Storage } from "@google-cloud/storage";
import { db } from "@workspace/db";
import { fabricsTable } from "@workspace/db";
import { eq, isNull, and } from "drizzle-orm";

const SIDECAR = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "fabrics/swatches";
const BASE = join(import.meta.dirname, "../../frankford_images");
const DRY_RUN = process.env.DRY_RUN === "1";

// Directories to search, in priority order (last writer wins for duplicates)
const SEARCH_DIRS = [
  join(BASE, "frankford_fabric_swatches_updated"),
  join(BASE, "frankford_fabric_swatches_recacril"),
];

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
  dir: string,
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
  const buffer = await readFile(join(dir, localFilename));
  const ext = localFilename.split(".").pop()?.toLowerCase() ?? "jpg";
  const ct = ext === "png" ? "image/png" : "image/jpeg";
  await file.save(buffer, { contentType: ct, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${storageKey}`;
}

function fileExt(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "jpg";
}

function extractItemNumber(filename: string): string | null {
  const stem = filename.replace(/\.[^.]+$/, "");

  // Outdura: outdura_{collection}_{name}_{ITEM}
  // e.g. outdura_sparkle_sparkle-pesto_1702 → 1702
  // e.g. outdura_jinga_jinga-nautical_213J  → 213J
  const outduraMatch = stem.match(/^outdura_.+_(.+)$/);
  if (outduraMatch) return outduraMatch[1].toUpperCase();

  // Tempotest: tempotest_{collection}_{name}_{ITEM_DASHED}
  // e.g. tempotest_foundations_ottomano-sand_1276-501 → 1276/501
  const tempoMatch = stem.match(/^tempotest_.+_([0-9].+)$/);
  if (tempoMatch) {
    const raw = tempoMatch[1];
    return raw.replace(/^(\d+(?:\/\d+)*)-(\d+)$/, "$1/$2");
  }

  // Recacril: R{digits} in various messy formats
  // R005.jpg, R-237.jpg, R_051_0.jpg, r_239_0 - Dec 29 2022.jpeg,
  // R_196.jpg, R-796_Baltic_Tweed.jpg, R-182.png, R-292_Teal.jpg
  // Normalise: find R (case-insensitive) followed by optional dash/underscore then digits
  const recacrilMatch = stem.match(/^[rR][-_]?(\d+)/);
  if (recacrilMatch) {
    return `R${recacrilMatch[1]}`;
  }

  return null;
}

async function buildFileMap(): Promise<Map<string, { dir: string; filename: string }>> {
  const fileMap = new Map<string, { dir: string; filename: string }>();
  let indexed = 0;
  let unrecognized = 0;

  for (const dir of SEARCH_DIRS) {
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      console.warn(`  Skipping missing directory: ${dir}`);
      continue;
    }
    const imageFiles = files.filter((f) =>
      ["jpg", "jpeg", "png"].includes(fileExt(f)),
    );
    for (const f of imageFiles) {
      const itemNum = extractItemNumber(f);
      if (itemNum) {
        fileMap.set(itemNum.toUpperCase(), { dir, filename: f });
        indexed++;
      } else {
        unrecognized++;
      }
    }
  }

  console.log(`Indexed ${indexed} files across ${SEARCH_DIRS.length} folders (${unrecognized} unrecognized).`);
  return fileMap;
}

async function main() {
  const fileMap = await buildFileMap();

  const missing = await db
    .select({
      id: fabricsTable.id,
      itemNumber: fabricsTable.itemNumber,
      name: fabricsTable.name,
    })
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
    const entry = fileMap.get(key);
    if (!entry) {
      unmatched.push(fabric.itemNumber);
      continue;
    }
    matched++;

    if (DRY_RUN) {
      console.log(`  [dry-run] ${fabric.itemNumber} → ${entry.filename}`);
      continue;
    }

    try {
      const ext = fileExt(entry.filename);
      const storageKey = `frankford-${fabric.itemNumber.replace(/[/\\]/g, "-")}.${ext}`;
      const url = await uploadSwatch(entry.dir, entry.filename, storageKey);
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

  if (unmatched.length > 0 && unmatched.length <= 50) {
    console.log("Unmatched item numbers:", unmatched.join(", "));
  } else if (unmatched.length > 50) {
    console.log("First 50 unmatched:", unmatched.slice(0, 50).join(", "));
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
