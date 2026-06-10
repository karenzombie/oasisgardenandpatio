import { readFileSync, existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import Papa from "papaparse";
import { and, eq } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { db, fabricsTable, manufacturersTable } from "@workspace/db";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const CSV_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/galtech_fabrics_1781119371325.csv",
);
const MANUFACTURER_NAME = "Galtech International";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "fabrics/swatches";

// Map CSV grade → local image subfolder
const GRADE_FOLDER: Record<string, string> = {
  A: join(WORKSPACE_ROOT, "galtech_fabric_swatches/Grade_A_Sunbrella"),
  B: join(WORKSPACE_ROOT, "galtech_fabric_swatches/Grade_B_Sunbrella"),
  C: join(WORKSPACE_ROOT, "galtech_fabric_swatches/Grade_C_Suncrylic"),
};

// ---------------------------------------------------------------------------
// Color family inference from fabric name
// ---------------------------------------------------------------------------

const COLOR_KEYWORDS: [RegExp, string][] = [
  [/black/i, "Black"],
  [/navy|pacific blue|cobalt|mineral blue|spectrum indigo|indigo|air blue|true blue|capri|aruba|aqua|aquatic|teal|denim|sky|neptune|horizon|breeze|peacock/i, "Blue"],
  [/forest green|kiwi|ginkgo|grass|fern|macaw|green/i, "Green"],
  [/cardinal red|jockey red|henna|brick|burgundy|red/i, "Red"],
  [/terracotta|tuscan|tangerine|melon|sunset|auburn|coral|orange/i, "Orange"],
  [/heather beige|antique beige|sesame linen|sesame|straw|linen|champagne|vellum|oyster|vanilla|eggshell|sand|natural|taupe|beige/i, "Beige"],
  [/latitude gray|cast ash|cast silver|cast slate|cast slate|charcoal|granite|sterling|silver linen|silver|carbon|slate|stone|coal|gray|grey|ash/i, "Gray"],
  [/cloud|moon|white|ivory/i, "White"],
  [/sunflower|buttercup|lemon|yellow/i, "Yellow"],
  [/camel|khaki|teak|boulder|brown/i, "Brown"],
  [/spa/i, "Blue"],
  [/flax/i, "Beige"],
  [/pacific/i, "Blue"],
];

function inferColorFamily(name: string, isStripe: boolean): string | null {
  if (isStripe) return "Multicolor";
  for (const [rx, family] of COLOR_KEYWORDS) {
    if (rx.test(name)) return family;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Object Storage
// ---------------------------------------------------------------------------

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
  filename: string,
): Promise<string> {
  const privateDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const fullPath = `${privateDir.replace(/\/$/, "")}/${STORAGE_SUBDIR}/${filename}`;
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const bucket = storage.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

// ---------------------------------------------------------------------------
// Local image index — keyed by fabric_number prefix
// Build once per grade folder: "80" → "80-Linen-Sesame.jpg"
// ---------------------------------------------------------------------------

const folderIndex = new Map<string, Map<string, string>>();

async function getFolderIndex(folderPath: string): Promise<Map<string, string>> {
  if (folderIndex.has(folderPath)) return folderIndex.get(folderPath)!;
  const m = new Map<string, string>();
  if (!existsSync(folderPath)) {
    console.warn(`WARN: image folder not found: ${folderPath}`);
    folderIndex.set(folderPath, m);
    return m;
  }
  const files = await readdir(folderPath);
  for (const f of files) {
    const prefix = f.split("-")[0].toLowerCase();
    if (!m.has(prefix)) m.set(prefix, f);
  }
  folderIndex.set(folderPath, m);
  return m;
}

async function findLocalImage(
  fabricNumber: string,
  grade: string,
): Promise<{ folder: string; filename: string } | null> {
  const folderPath = GRADE_FOLDER[grade];
  if (!folderPath) return null;
  const idx = await getFolderIndex(folderPath);
  const filename = idx.get(fabricNumber.toLowerCase());
  if (filename) return { folder: folderPath, filename };
  return null;
}

// ---------------------------------------------------------------------------
// CSV row shape
// ---------------------------------------------------------------------------

type CsvRow = {
  fabric_number: string;
  fabric_name: string;
  grade: string;
  fabric_brand: string;
  warranty: string;
  notes: string;
  swatch_image_url: string;
  is_stripe: string;
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const parsed = Papa.parse<CsvRow>(raw, { header: true, skipEmptyLines: true });
  if (parsed.errors.length > 0) {
    console.error("CSV parse errors:", parsed.errors.slice(0, 5));
    throw new Error("CSV parse failed");
  }

  // Deduplicate by fabric_number — keep first occurrence
  const seen = new Map<string, CsvRow>();
  for (const row of parsed.data) {
    const num = row.fabric_number?.trim();
    if (!num) continue;
    if (!seen.has(num)) seen.set(num, row);
  }
  const uniqueRows = Array.from(seen.values());
  console.log(`CSV rows: ${parsed.data.length}, unique fabric numbers: ${uniqueRows.length}`);

  // Manufacturer lookup
  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);
  if (!mfg) throw new Error(`Manufacturer "${MANUFACTURER_NAME}" not found`);
  console.log(`Manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);

  let uploaded = 0, uploadErrors = 0, inserted = 0, updated = 0, noImage = 0;

  const BATCH = 8;
  for (let i = 0; i < uniqueRows.length; i += BATCH) {
    const batch = uniqueRows.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (row) => {
        const itemNumber = row.fabric_number.trim();
        const name = row.fabric_name.trim();
        const grade = row.grade.trim() || null;
        const isStripe = row.is_stripe?.trim().toLowerCase() === "yes";
        const colorFamily = inferColorFamily(name, isStripe);

        // Find and upload local image
        let swatchImageUrl: string | null = null;
        const found = grade ? await findLocalImage(itemNumber, grade) : null;
        if (found) {
          const storageFilename = `galtech-${itemNumber}.jpg`;
          try {
            const buffer = await readFile(join(found.folder, found.filename));
            swatchImageUrl = await uploadBuffer(buffer, "image/jpeg", storageFilename);
            uploaded++;
          } catch (err) {
            console.error(`  ERROR uploading ${itemNumber} (${found.filename}):`, err);
            uploadErrors++;
          }
        } else {
          console.warn(`  WARN: no local image for fabric_number=${itemNumber} (${name}, grade=${grade})`);
          noImage++;
        }

        // Upsert DB record
        const [existing] = await db
          .select({ id: fabricsTable.id })
          .from(fabricsTable)
          .where(
            and(
              eq(fabricsTable.manufacturerId, mfg.id),
              eq(fabricsTable.itemNumber, itemNumber),
            ),
          )
          .limit(1);

        if (existing) {
          await db
            .update(fabricsTable)
            .set({
              name,
              grade,
              colorFamily,
              isStripe,
              ...(swatchImageUrl ? { swatchImageUrl } : {}),
            })
            .where(eq(fabricsTable.id, existing.id));
          updated++;
        } else {
          await db.insert(fabricsTable).values({
            manufacturerId: mfg.id,
            itemNumber,
            name,
            grade,
            colorFamily,
            isStripe,
            swatchImageUrl,
            isActive: true,
          });
          inserted++;
        }
      }),
    );
    const done = Math.min(i + BATCH, uniqueRows.length);
    console.log(
      `  ${done}/${uniqueRows.length} — inserted=${inserted} updated=${updated} ` +
        `uploaded=${uploaded} no-image=${noImage} errors=${uploadErrors}`,
    );
  }

  console.log(
    `\nDone. inserted=${inserted} updated=${updated} ` +
      `uploaded=${uploaded} no-image=${noImage} errors=${uploadErrors}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
