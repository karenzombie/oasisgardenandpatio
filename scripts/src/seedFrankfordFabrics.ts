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
  "attached_assets/frankford_fabrics_1780093291964.csv",
);
const MANUFACTURER_NAME = "Frankford Umbrellas";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "fabrics/swatches";
const LOCAL_SWATCH_DIR = join(
  WORKSPACE_ROOT,
  "frankford_images/frankford_fabric_swatches",
);

// ---------------------------------------------------------------------------
// Design → isStripe
// ---------------------------------------------------------------------------
const STRIPE_DESIGNS = new Set(["Stripes"]);

// ---------------------------------------------------------------------------
// "All Colors" → normalized colorFamily
// The CSV "Primary Color" column is already normalized to single words;
// we use that as our colorFamily value.
// ---------------------------------------------------------------------------
const VALID_COLOR_FAMILIES = new Set([
  "Beige",
  "Black",
  "Blue",
  "Brown",
  "Gold",
  "Gray",
  "Green",
  "Grey",
  "Ivory",
  "Multicolor",
  "Orange",
  "Pink",
  "Purple",
  "Red",
  "Turquoise",
  "White",
  "Yellow",
]);

function normalizeColorFamily(raw: string): string | null {
  if (!raw?.trim()) return null;
  const v = raw.trim();
  // Map "Grey" → "Gray" for consistency with Sunbrella vocabulary
  if (v === "Grey") return "Gray";
  if (VALID_COLOR_FAMILIES.has(v)) return v;
  return null;
}

function normalizeGrade(raw: string): string | null {
  const v = raw?.trim();
  if (!v) return null;
  // Grades in this CSV: A, A+, B, C, D
  // Map A+ → A for storage (no separate A+ tier in schema)
  if (v === "A+" || v === "A") return "A";
  if (v === "B") return "B";
  if (v === "C") return "C";
  if (v === "D") return "D";
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
// Local image lookup
// SKU → filename matching rules (built once from the local directory):
//   - The local filename starts with the SKU (before the first `_`)
//   - SKUs that contain "/" have the slash stripped in the filename
//     e.g. "102/615" → file "102615_*.jpg"
//   - Prefix match is case-insensitive
// ---------------------------------------------------------------------------

// Map: normalizedSku → actual filename
let swatchIndex: Map<string, string> | null = null;

async function getSwatchIndex(): Promise<Map<string, string>> {
  if (swatchIndex) return swatchIndex;
  const m = new Map<string, string>();
  if (!existsSync(LOCAL_SWATCH_DIR)) {
    console.warn(`WARN: swatch dir not found: ${LOCAL_SWATCH_DIR}`);
    swatchIndex = m;
    return m;
  }
  const files = await readdir(LOCAL_SWATCH_DIR);
  for (const f of files) {
    // Key = everything before the first underscore, lower-cased
    const prefix = f.split("_")[0].toLowerCase();
    // Keep first match per prefix (some folders may have duplicates)
    if (!m.has(prefix)) m.set(prefix, f);
  }
  swatchIndex = m;
  return m;
}

function skuToIndexKey(sku: string): string {
  // Strip "/" for Tempotest-style SKUs like "102/615" → "102615"
  return sku.replace(/\//g, "").toLowerCase();
}

async function findLocalImage(sku: string): Promise<string | null> {
  const idx = await getSwatchIndex();
  const key = skuToIndexKey(sku);
  return idx.get(key) ?? null;
}

// ---------------------------------------------------------------------------
// CSV row shape
// ---------------------------------------------------------------------------

type CsvRow = {
  SKU: string;
  Name: string;
  Brand: string;
  Grade: string;
  "Primary Color": string;
  "All Colors": string;
  Design: string;
  "Swatch Image URL": string;
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
  const seenSkus = new Map<string, CsvRow>();
  for (const row of parsed.data) {
    const sku = row.SKU?.trim();
    if (!sku) continue;
    if (!seenSkus.has(sku)) seenSkus.set(sku, row);
  }
  const uniqueRows = Array.from(seenSkus.values());
  console.log(
    `CSV total rows: ${parsed.data.length}, unique SKUs: ${uniqueRows.length}`,
  );

  // Ensure manufacturer exists
  let [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);

  if (!mfg) {
    const [inserted] = await db
      .insert(manufacturersTable)
      .values({
        name: MANUFACTURER_NAME,
        slug: "frankford-umbrellas",
        isActive: true,
      })
      .returning({ id: manufacturersTable.id });
    mfg = inserted;
    console.log(`Created manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);
  } else {
    console.log(`Found manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);
  }

  let uploaded = 0;
  let uploadSkipped = 0;
  let uploadErrors = 0;
  let inserted = 0;
  let updated = 0;
  let noImage = 0;

  const BATCH = 8;
  for (let i = 0; i < uniqueRows.length; i += BATCH) {
    const batch = uniqueRows.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (row) => {
        const sku = row.SKU.trim();
        const name = row.Name.trim();
        // Store brand as a prefix in the fabric name for sub-grouping display
        // e.g. "Recasens / Recacril® — Orange & White Stripe"
        const brand = row.Brand.trim();
        const grade = normalizeGrade(row.Grade);
        const colorFamily = normalizeColorFamily(row["Primary Color"]);
        const isStripe = STRIPE_DESIGNS.has(row.Design?.trim());

        // Find and upload image
        let swatchImageUrl: string | null = null;
        const filename = await findLocalImage(sku);
        if (filename) {
          const ext = filename.toLowerCase().endsWith(".png") ? "png" : "jpg";
          const contentType = ext === "png" ? "image/png" : "image/jpeg";
          // Sanitize SKU for storage filename (replace / and spaces)
          const safeSkuPart = sku.replace(/[\/\s]/g, "-");
          const storageFilename = `frankford-${safeSkuPart}.${ext}`;
          try {
            const buffer = await readFile(join(LOCAL_SWATCH_DIR, filename));
            swatchImageUrl = await uploadBuffer(buffer, contentType, storageFilename);
            uploaded++;
          } catch (err) {
            console.error(`  ERROR uploading ${sku} (${filename}):`, err);
            uploadErrors++;
          }
        } else {
          noImage++;
        }

        // Check existing record
        const [existing] = await db
          .select({ id: fabricsTable.id, swatchImageUrl: fabricsTable.swatchImageUrl })
          .from(fabricsTable)
          .where(
            and(
              eq(fabricsTable.manufacturerId, mfg.id),
              eq(fabricsTable.itemNumber, sku),
            ),
          )
          .limit(1);

        const fabricName = `${brand} — ${name}`;

        if (existing) {
          await db
            .update(fabricsTable)
            .set({
              name: fabricName,
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
            name: fabricName,
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
      `uploaded=${uploaded} upload-skipped=${uploadSkipped} no-image=${noImage} errors=${uploadErrors}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
