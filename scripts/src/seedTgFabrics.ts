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
  "attached_assets/tg_fabrics_1781119373478.csv",
);
const MANUFACTURER_NAME = "Treasure Garden";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "fabrics/swatches";

// Map CSV grade → local image subfolder
const GRADE_FOLDER: Record<string, string> = {
  A: join(WORKSPACE_ROOT, "tg_fabric_swatches/Grade_A"),
  Awning: join(WORKSPACE_ROOT, "tg_fabric_swatches/Grade_Awning"),
  C: join(WORKSPACE_ROOT, "tg_fabric_swatches/Grade_C"),
};

// ---------------------------------------------------------------------------
// Color family inference from fabric name
// ---------------------------------------------------------------------------

const COLOR_KEYWORDS: [RegExp, string][] = [
  [/black/i, "Black"],
  [/navy|pacific blue|cobalt|mineral blue|spectrum indigo|indigo|air blue|true blue|capri|aruba|aqua|aquatic|teal|denim|sky|neptune|horizon|breeze|peacock|ridge beach|mediter|latitude navy|blue jay|moon/i, "Blue"],
  [/forest green|kiwi|ginkgo|grass|fern|macaw|green/i, "Green"],
  [/cardinal red|jockey red|henna|brick|burgundy|auburn|red/i, "Red"],
  [/terracotta|tuscan|tangerine|melon|sunset|coral|orange/i, "Orange"],
  [/heather beige|antique beige|sesame linen|sesame|straw|linen|champagne|vellum|oyster|vanilla|eggshell|sand|natural|taupe|beige|flax|seashell|ridge canyon/i, "Beige"],
  [/latitude gray|cast ash|cast silver|cast slate|charcoal|granite|sterling|silver linen|silver|carbon|slate|stone|coal|gray|grey|ash|pewter|boulder|mist/i, "Gray"],
  [/cloud|moon|white|ivory|cream/i, "White"],
  [/sunflower|buttercup|lemon|yellow/i, "Yellow"],
  [/camel|khaki|teak|brown/i, "Brown"],
  [/spa/i, "Blue"],
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
// Local image index — keyed by full SKU prefix
// TG filenames: "{sku}-{Name-Words}.jpg"
// Handles compound SKUs like "40599-01" and alphanumeric like "48108S"
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
    // Key = everything before the last "-word" segment that isn't digits/dash
    // Simplest reliable approach: map the exact sku prefix (before first alphabetic dash-word)
    // Strategy: strip the trailing "-Name-Words" by finding the first segment that contains a letter
    // For "4601-Pacific-Blue.jpg" → key "4601"
    // For "40599-01-Direction-Linen.jpg" → key "40599-01" (01 is digits, so keep going until alpha)
    // For "48108S-Cast-Coral.jpg" → key "48108S"
    const noExt = f.replace(/\.[^.]+$/, "");
    const parts = noExt.split("-");
    let key = "";
    for (const part of parts) {
      if (/[a-zA-Z]/.test(part) && key !== "") break; // first alpha-containing part after digits = start of name
      if (key === "") key = part;
      else key += "-" + part;
    }
    const keyLower = key.toLowerCase();
    if (!m.has(keyLower)) m.set(keyLower, f);
  }
  folderIndex.set(folderPath, m);
  return m;
}

async function findLocalImage(
  sku: string,
  grade: string,
): Promise<{ folder: string; filename: string } | null> {
  const folderPath = GRADE_FOLDER[grade];
  if (!folderPath) return null;
  const idx = await getFolderIndex(folderPath);
  const filename = idx.get(sku.toLowerCase());
  if (filename) return { folder: folderPath, filename };
  // Fallback: strip trailing letter suffix for SKUs like "48108S" → "48108"
  const stripped = sku.replace(/[a-zA-Z]+$/, "").toLowerCase();
  if (stripped !== sku.toLowerCase()) {
    const fb = idx.get(stripped);
    if (fb) return { folder: folderPath, filename: fb };
  }
  return null;
}

// ---------------------------------------------------------------------------
// CSV row shape
// ---------------------------------------------------------------------------

type CsvRow = {
  sku: string;
  fabric_name: string;
  material: string;
  grade: string;
  is_stripe: string;
  swatch_image_url: string;
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

  // Deduplicate by SKU — keep first occurrence
  const seen = new Map<string, CsvRow>();
  for (const row of parsed.data) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    if (!seen.has(sku)) seen.set(sku, row);
  }
  const uniqueRows = Array.from(seen.values());
  console.log(`CSV rows: ${parsed.data.length}, unique SKUs: ${uniqueRows.length}`);

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
        const sku = row.sku.trim();
        const name = row.fabric_name.trim();
        const grade = row.grade.trim() || null;
        const isStripe = row.is_stripe?.trim().toLowerCase() === "yes";
        const colorFamily = inferColorFamily(name, isStripe);

        // Find and upload local image
        let swatchImageUrl: string | null = null;
        const found = grade ? await findLocalImage(sku, grade) : null;
        if (found) {
          // Sanitize SKU for storage filename (replace "/" and spaces)
          const safeSku = sku.replace(/[\/\s]/g, "-");
          const storageFilename = `tg-${safeSku}.jpg`;
          try {
            const buffer = await readFile(join(found.folder, found.filename));
            swatchImageUrl = await uploadBuffer(buffer, "image/jpeg", storageFilename);
            uploaded++;
          } catch (err) {
            console.error(`  ERROR uploading ${sku} (${found.filename}):`, err);
            uploadErrors++;
          }
        } else {
          console.warn(`  WARN: no local image for sku=${sku} (${name}, grade=${grade})`);
          noImage++;
        }

        // Upsert DB record
        const [existing] = await db
          .select({ id: fabricsTable.id })
          .from(fabricsTable)
          .where(
            and(
              eq(fabricsTable.manufacturerId, mfg.id),
              eq(fabricsTable.itemNumber, sku),
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
            itemNumber: sku,
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
