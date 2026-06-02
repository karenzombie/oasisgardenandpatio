/**
 * Idempotent seeder for O.W. Lee fabrics.
 *
 * Source CSV:  attached_assets/owlee_fabrics_new_cleaned_*.csv
 * Source imgs: <repo root>/owlee_fabric_images/
 *              Files named: "{SKU_UPPER} - {NAME_UPPER}.jpg"
 *              (or just "{NAME_UPPER}.jpg" when SKU is absent)
 *
 * For each CSV row this script:
 *   - Skips rows whose item_number already exists for OW Lee in DB
 *   - Uploads the swatch image to Object Storage → /objects/fabrics/owlee/{safe}.jpg
 *   - Inserts the fabric row (manufacturer_id, item_number, name, grade,
 *     color_family, swatch_image_url, is_active=true)
 *
 * Usage:  pnpm --filter @workspace/scripts run seed-ow-lee-fabrics
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { eq, sql } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { db, manufacturersTable, fabricsTable } from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, "../../attached_assets");
const IMAGES_DIR = resolve(__dirname, "../../owlee_fabric_images");

const OW_LEE_SLUG = "o-w-lee";

// ── Object Storage client ─────────────────────────────────────────────────────

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const objectStorage = new Storage({
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

// ── CSV type ──────────────────────────────────────────────────────────────────

type CsvRow = {
  Name: string;
  SKU: string;
  Grade: string;
  "Fabric Collection": string;
  "Color Family": string;
  Orientation: string;
  Repeat: string;
  Group: string;
  "Source URL": string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function clean(v: string | undefined | null): string {
  return (v ?? "").trim();
}

function findLatestCsv(prefix: string): string {
  const matches = readdirSync(ASSETS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(".csv"))
    .sort();
  if (matches.length === 0) throw new Error(`No CSV found with prefix: ${prefix}`);
  return join(ASSETS_DIR, matches[matches.length - 1]!);
}

function parseCsv(path: string): CsvRow[] {
  const text = readFileSync(path, "utf8");
  const r = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (r.errors.length > 0) console.warn("CSV parse warnings:", r.errors);
  return r.data;
}

/**
 * Normalize a string to match the uppercase image filename convention:
 *   - uppercase
 *   - normalize accented chars (NFD → strip combining marks)
 *   - keep letters, digits, spaces, hyphens; strip everything else
 *   - collapse whitespace
 */
function normalizeForFilename(s: string): string {
  return s
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // strip diacritics (Café → CAFE)
    .replace(/[^A-Z0-9 \-]/g, "")   // remove non-alpha/space/dash
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Make a URL-safe filename from a raw string.
 * e.g. "RV01 - BECKON HEMP.jpg" → "rv01-beckon-hemp.jpg"
 *      "GS38 - SAHARA CAFÉ.jpg" → "gs38-sahara-cafe.jpg"
 */
function sanitizeFilename(raw: string): string {
  const noExt = raw.replace(/\.jpg$/i, "");
  return (
    noExt
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") + ".jpg"
  );
}

/** Find the local image file for a fabric row. Returns null if not found. */
function findImagePath(sku: string, name: string): string | null {
  const normSku = sku ? normalizeForFilename(sku) : "";
  const normName = normalizeForFilename(name);

  // Also try just raw uppercase (preserves accented chars like CAFÉ)
  const rawName = name.toUpperCase();
  const rawSku = sku.toUpperCase();

  const candidates: string[] = [];
  if (sku) {
    candidates.push(join(IMAGES_DIR, `${normSku} - ${normName}.jpg`));
    candidates.push(join(IMAGES_DIR, `${rawSku} - ${rawName}.jpg`));
  }
  candidates.push(join(IMAGES_DIR, `${normName}.jpg`));
  candidates.push(join(IMAGES_DIR, `${rawName}.jpg`));

  for (const c of candidates) {
    if (existsSync(c)) return c;
  }
  return null;
}

// ── Object Storage ────────────────────────────────────────────────────────────

function parsePrivateDir(): { bucket: string; prefix: string } {
  const dir = process.env.PRIVATE_OBJECT_DIR;
  if (!dir) throw new Error("PRIVATE_OBJECT_DIR env var not set");
  const trimmed = dir.startsWith("/") ? dir.slice(1) : dir;
  const slash = trimmed.indexOf("/");
  if (slash === -1) return { bucket: trimmed, prefix: "" };
  return { bucket: trimmed.slice(0, slash), prefix: trimmed.slice(slash + 1) };
}

async function uploadSwatch(
  localPath: string,
  safeFilename: string,
  bucketName: string,
  prefix: string,
): Promise<string> {
  const bucket = objectStorage.bucket(bucketName);
  const objectName = prefix
    ? `${prefix}/fabrics/owlee/${safeFilename}`
    : `fabrics/owlee/${safeFilename}`;
  const buffer = await readFile(localPath);
  await bucket.file(objectName).save(buffer, {
    contentType: "image/jpeg",
    resumable: false,
  });
  return `/objects/fabrics/owlee/${safeFilename}`;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("== Seeding O.W. Lee fabrics ==\n");

  const csvPath = findLatestCsv("owlee_fabrics_new_cleaned_");
  console.log(`CSV: ${csvPath}`);
  const rows = parseCsv(csvPath);
  console.log(`Parsed ${rows.length} rows\n`);

  // Resolve manufacturer
  const [mfr] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.slug, OW_LEE_SLUG))
    .limit(1);
  if (!mfr) throw new Error(`Manufacturer "${OW_LEE_SLUG}" not found`);
  const manufacturerId = mfr.id;

  // Load existing item_numbers for OW Lee (for idempotency)
  const existing = await db
    .select({ itemNumber: fabricsTable.itemNumber })
    .from(fabricsTable)
    .where(eq(fabricsTable.manufacturerId, manufacturerId));
  const existingItemNumbers = new Set(existing.map((r) => r.itemNumber.toUpperCase()));

  // Storage config
  const { bucket: bucketName, prefix } = parsePrivateDir();

  let created = 0;
  let skipped = 0;
  let imagesUploaded = 0;
  let imagesMissing = 0;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    const rowNum = i + 1;

    const name = clean(row.Name);
    const sku = clean(row.SKU);
    const grade = clean(row.Grade) || null;
    const colorFamily = clean(row["Color Family"]) || null;

    if (!name) {
      console.log(`  [${rowNum}] SKIP (empty name)`);
      skipped++;
      continue;
    }

    // item_number: SKU if present, otherwise the fabric name
    const itemNumber = sku || name;

    // Idempotency check
    if (existingItemNumbers.has(itemNumber.toUpperCase())) {
      console.log(`  [${rowNum}] SKIP (already in DB): ${itemNumber} — "${name}"`);
      skipped++;
      continue;
    }

    // Find and upload image
    const localImg = findImagePath(sku, name);
    let swatchImageUrl: string | null = null;
    if (localImg) {
      const rawFilename = localImg.split("/").pop()!;
      const safeFilename = sanitizeFilename(rawFilename);
      swatchImageUrl = await uploadSwatch(localImg, safeFilename, bucketName, prefix);
      imagesUploaded++;
    } else {
      console.warn(`  [${rowNum}] ! No image found for: "${sku || name}" — "${name}"`);
      imagesMissing++;
    }

    // Insert fabric
    await db.insert(fabricsTable).values({
      manufacturerId,
      itemNumber,
      name,
      grade,
      colorFamily,
      swatchImageUrl,
      isActive: true,
      displayOrder: 0,
      isStripe: false,
    });

    existingItemNumbers.add(itemNumber.toUpperCase());
    created++;
    console.log(`  [${rowNum}] CREATED: ${itemNumber} — "${name}" (grade: ${grade ?? "—"}, color: ${colorFamily ?? "—"})`);
  }

  console.log("\n== Summary ==");
  console.log(`  fabrics created:  ${created}`);
  console.log(`  rows skipped:     ${skipped}`);
  console.log(`  images uploaded:  ${imagesUploaded}`);
  console.log(`  images missing:   ${imagesMissing}`);

  // Verification
  const verify = await db.execute(sql`
    SELECT COUNT(*)::int AS total_ow_lee_fabrics
    FROM fabrics
    WHERE manufacturer_id = ${manufacturerId}
  `);
  console.log(`\n== DB Verification ==`);
  console.log(verify.rows[0]);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
