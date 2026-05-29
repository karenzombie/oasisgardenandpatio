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
  "attached_assets/tropitone_fabrics_final_1780091765854.csv",
);
const MANUFACTURER_NAME = "Tropitone";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "fabrics/swatches";

// Map each CSV category to the local image folder (at workspace root)
const CATEGORY_FOLDER: Record<string, string> = {
  "Sling Fabrics": "tropitone_sling_fabrics",
  "Cushion Fabrics": "tropitone_cushion_fabrics",
  "Padded Sling Fabrics (Front)": "tropitone_padded_sling_fabrics_front",
  "Padded Sling Fabrics (Back)": "tropitone_padded_sling_fabrics_back",
  "Tight Seat and Pad Fabrics": "tropitone_tight_seat_and_pad_fabrics",
  "Elios Fabrics": "tropitone_elios_fabrics",
  "Cord Welt Fabrics": "tropitone_cord_welt_fabrics",
  "Marine Grade Fabrics": "tropitone_marine_grade_fabrics",
  "Firesist Fabrics": "tropitone_firesist_fabrics",
};

// Ordered list of folder names to search for an image when the primary
// category folder doesn't have the file (most SKUs appear in multiple cats)
const FOLDER_SEARCH_ORDER = [
  "tropitone_sling_fabrics",
  "tropitone_cushion_fabrics",
  "tropitone_padded_sling_fabrics_front",
  "tropitone_padded_sling_fabrics_back",
  "tropitone_tight_seat_and_pad_fabrics",
  "tropitone_elios_fabrics",
  "tropitone_cord_welt_fabrics",
  "tropitone_marine_grade_fabrics",
  "tropitone_firesist_fabrics",
  "tropitone_umbrella_fabrics",
];

// Normalize Tropitone compound color families → single values matching the
// Sunbrella vocabulary already in use on the /fabrics page.
const COLOR_MAP: Record<string, string> = {
  "beige / sand / tan": "Beige",
  black: "Black",
  "blue / navy / teal": "Blue",
  "brown / bronze / earth": "Brown",
  "gray / charcoal": "Gray",
  green: "Green",
  "multi / pattern": "Multicolor",
  "orange / rust": "Orange",
  "purple / lavender": "Purple",
  "red / coral / pink": "Red",
  "white / ivory / cream": "White",
  "yellow / gold": "Yellow",
};

// ---------------------------------------------------------------------------
// Object Storage client (mirrors uploadSwatches.ts)
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
  await file.save(buffer, { contentType: contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CsvRow = {
  sku: string;
  name: string;
  category: string;
  grade: string;
  color_family: string;
  image_url: string;
  detail_url: string;
};

function normalizeColor(raw: string): string | null {
  if (!raw?.trim()) return null;
  return COLOR_MAP[raw.trim().toLowerCase()] ?? null;
}

function normalizeGrade(raw: string): string | null {
  const v = raw?.trim().toUpperCase();
  if (v === "A" || v === "B" || v === "C") return v;
  return null;
}

// Build a sku→filename map for a given folder (lazy-loaded per folder)
const folderIndex = new Map<string, Map<string, string>>();

async function getFolderIndex(folderPath: string): Promise<Map<string, string>> {
  if (folderIndex.has(folderPath)) return folderIndex.get(folderPath)!;
  const m = new Map<string, string>();
  if (!existsSync(folderPath)) {
    folderIndex.set(folderPath, m);
    return m;
  }
  const files = await readdir(folderPath);
  for (const f of files) {
    const sku = f.split("_")[0].toLowerCase();
    m.set(sku, f);
  }
  folderIndex.set(folderPath, m);
  return m;
}

async function findImageFile(
  sku: string,
  primaryCategory: string,
): Promise<{ folder: string; filename: string } | null> {
  const skuLower = sku.toLowerCase();
  const primaryFolder = CATEGORY_FOLDER[primaryCategory];
  const searchOrder = primaryFolder
    ? [primaryFolder, ...FOLDER_SEARCH_ORDER.filter((f) => f !== primaryFolder)]
    : FOLDER_SEARCH_ORDER;

  for (const folderName of searchOrder) {
    const folderPath = join(WORKSPACE_ROOT, folderName);
    const idx = await getFolderIndex(folderPath);
    const filename = idx.get(skuLower);
    if (filename) return { folder: folderPath, filename };
  }
  return null;
}

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

  // Deduplicate by SKU — keep the first category occurrence as primary
  const seenSkus = new Map<string, CsvRow>();
  for (const row of parsed.data) {
    const sku = row.sku?.trim();
    if (!sku) continue;
    if (!seenSkus.has(sku)) seenSkus.set(sku, row);
  }
  const uniqueRows = Array.from(seenSkus.values());
  console.log(
    `CSV total rows: ${parsed.data.length}, unique SKUs: ${uniqueRows.length}`,
  );

  // Manufacturer lookup
  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);
  if (!mfg) throw new Error(`Manufacturer "${MANUFACTURER_NAME}" not found`);
  console.log(`Tropitone manufacturer id = ${mfg.id}`);

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
        const sku = row.sku.trim();
        const name = row.name.trim();
        const grade = normalizeGrade(row.grade);
        const colorFamily = normalizeColor(row.color_family);

        // Find and upload image
        let swatchImageUrl: string | null = null;
        const found = await findImageFile(sku, row.category.trim());
        if (found) {
          const storageFilename = `${sku}.jpg`;
          try {
            const buffer = await readFile(join(found.folder, found.filename));
            swatchImageUrl = await uploadBuffer(buffer, "image/jpeg", storageFilename);
            uploaded++;
          } catch (err) {
            console.error(`  ERROR uploading ${sku} (${found.filename}):`, err);
            uploadErrors++;
          }
        } else {
          console.warn(`  WARN: no local image found for SKU ${sku} (${name})`);
          noImage++;
        }

        // Upsert DB record
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

        if (existing) {
          await db
            .update(fabricsTable)
            .set({
              name,
              grade,
              colorFamily,
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
            isStripe: false,
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
