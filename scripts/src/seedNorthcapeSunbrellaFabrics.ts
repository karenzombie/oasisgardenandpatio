import { readFileSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve, join, basename } from "node:path";
import Papa from "papaparse";
import { and, eq } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { db, fabricsTable } from "@workspace/db";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const CSV_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/new_northcape_fabrics_insert_1782254316660.csv",
);
const SWATCH_DIR = resolve(WORKSPACE_ROOT, "nc_sunbrella_swatches");
const MANUFACTURER_ID = 17; // NorthCape
const COLLECTION = "Sunbrella";
const STORAGE_SUBDIR = "fabrics/swatches/northcape";
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

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
  await file.save(buffer, { contentType, resumable: false });
  return `/objects/${STORAGE_SUBDIR}/${filename}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type CsvRow = {
  brand: string;
  name: string;
  grade: string;
  color_family: string;
  swatch_image_url: string;
  manufacturer_id: string;
  is_active: string;
};

function normalizeGrade(raw: string): string | null {
  const v = raw?.trim().toUpperCase();
  return v ? v : null;
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

  const rows = parsed.data.filter((r) => r.name?.trim());
  console.log(`CSV rows: ${rows.length}`);

  let inserted = 0;
  let updated = 0;
  let uploaded = 0;
  const missingSwatch: string[] = [];
  const errors: string[] = [];

  for (const row of rows) {
    const name = row.name.trim();
    const grade = normalizeGrade(row.grade);
    const colorFamily = row.color_family?.trim() || null;
    const filename = basename(row.swatch_image_url.trim());
    const localPath = join(SWATCH_DIR, filename);

    if (!existsSync(localPath)) {
      // No swatch image on disk — skip per the no-assume rule; reported below.
      missingSwatch.push(`${name} (expected ${filename})`);
      continue;
    }

    let swatchImageUrl: string | null = null;
    try {
      const buffer = await readFile(localPath);
      swatchImageUrl = await uploadBuffer(buffer, "image/jpeg", filename);
      uploaded++;
    } catch (err) {
      errors.push(`${name}: upload failed — ${String(err)}`);
      continue;
    }

    // Upsert by (manufacturer_id, item_number). NorthCape fabrics have no
    // vendor SKU, so the fabric name doubles as the natural item_number.
    const [existing] = await db
      .select({ id: fabricsTable.id })
      .from(fabricsTable)
      .where(
        and(
          eq(fabricsTable.manufacturerId, MANUFACTURER_ID),
          eq(fabricsTable.itemNumber, name),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(fabricsTable)
        .set({
          name,
          collection: COLLECTION,
          grade,
          colorFamily,
          swatchImageUrl,
          isActive: true,
        })
        .where(eq(fabricsTable.id, existing.id));
      updated++;
    } else {
      await db.insert(fabricsTable).values({
        manufacturerId: MANUFACTURER_ID,
        itemNumber: name,
        name,
        collection: COLLECTION,
        grade,
        colorFamily,
        isStripe: false,
        swatchImageUrl,
        isActive: true,
      });
      inserted++;
    }
  }

  console.log(
    `\nDone. inserted=${inserted} updated=${updated} uploaded=${uploaded}`,
  );
  if (missingSwatch.length > 0) {
    console.log(`\nSKIPPED — no swatch image on disk (${missingSwatch.length}):`);
    for (const m of missingSwatch) console.log(`  - ${m}`);
  }
  if (errors.length > 0) {
    console.log(`\nERRORS (${errors.length}):`);
    for (const e of errors) console.log(`  - ${e}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
