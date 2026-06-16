import { readFileSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import Papa from "papaparse";
import { eq } from "drizzle-orm";
import { Storage } from "@google-cloud/storage";
import { db, manufacturersTable } from "@workspace/db";
import {
  productsTable,
  productImagesTable,
  inventoryTable,
} from "@workspace/db";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const CSV_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/frankford_non_umbrella_products_all_pricing_1781634202596.csv",
);
const MANUFACTURER_NAME = "Frankford Umbrellas";
const MANUFACTURER_ID = 28;
const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";
const STORAGE_SUBDIR = "products/frankford-non-umbrella";
const IMAGE_ROOT = join(WORKSPACE_ROOT, "frankford_nonumbrella_images");

// Frankford uses a single shared category id per CSV category name.
// "Bases & Mounts" → Umbrella Bases (39)
// "Beach" and "Accessories" → Replacement Parts (41)
const CATEGORY_MAP: Record<string, number> = {
  "Bases & Mounts": 39,
  Beach: 41,
  Accessories: 41,
};

// Products whose CSV SKU is shared between two rows get a disambiguated SKU.
// Key = product name exactly as in CSV; value = new unique SKU.
const SKU_REMAP: Record<string, string> = {
  "18ST2 Stem (Classic)": "18ST2-Classic",
  "18ST2 Stem (Giant)": "18ST2-Giant",
  "SS-DB (4)": "SS-DB-4",
  "SS-DB (4) Marella": "SS-DB-4-Marella",
};

// ---------------------------------------------------------------------------
// Object Storage helpers (mirrors existing Frankford loader pattern)
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
// Image index
// ---------------------------------------------------------------------------
// Filename pattern: {SKU_normalized}_{rest...}.{ext}
// SKU normalization: remove +, (, ) and replace spaces with nothing.
// e.g. "SS-DB (4)" → "SS-DB_4", "40G+36G" → "40G36G", "18ST2" → "18ST2"
// For duplicates (18ST2 Classic/Giant, SS-DB_4 / SS-DB_4_Marella) we also
// check that the product name hint ("Classic", "Giant", "Marella") appears
// in the full filename.

type ImageEntry = { file: string; dir: string };
let _imageIndex: Map<string, ImageEntry[]> | null = null;

function normalizeSkuForImage(sku: string): string {
  return sku
    .replace(/\(/g, "_")
    .replace(/[)+ ]/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

async function buildImageIndex(): Promise<Map<string, ImageEntry[]>> {
  if (_imageIndex) return _imageIndex;
  const m = new Map<string, ImageEntry[]>();
  const subdirs = ["accessories", "bases_cantilever", "bases_classic", "bases_giant", "bases_marella", "beach"];
  for (const sub of subdirs) {
    const dir = join(IMAGE_ROOT, sub);
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      console.warn(`WARN: image subdir not found: ${dir}`);
      continue;
    }
    for (const f of files) {
      // Key = everything before the first underscore in the filename (the SKU part)
      const noExt = f.replace(/\.[^.]+$/, "");
      const key = noExt.split("_")[0].toLowerCase();
      const entries = m.get(key) ?? [];
      entries.push({ file: f, dir });
      m.set(key, entries);
    }
  }
  _imageIndex = m;
  return m;
}

async function findImage(
  sku: string,
  productName: string,
): Promise<{ file: string; dir: string } | null> {
  const idx = await buildImageIndex();
  const key = normalizeSkuForImage(sku).toLowerCase();
  const entries = idx.get(key);
  if (!entries || entries.length === 0) return null;
  if (entries.length === 1) return entries[0];

  // Multiple matches — pick the one whose filename best matches the product name.
  // Extract significant words from the product name (title words, skip short ones).
  const nameWords = productName
    .toLowerCase()
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);

  let best: ImageEntry | null = null;
  let bestScore = -1;
  for (const entry of entries) {
    const fn = entry.file.toLowerCase();
    const score = nameWords.filter((w) => fn.includes(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  // If we couldn't differentiate, prefer the one WITHOUT "marella" for non-Marella products
  if (best && bestScore === 0) {
    const hasMar = productName.toLowerCase().includes("marella");
    const marEntry = entries.find((e) => e.file.toLowerCase().includes("marella"));
    const nonMarEntry = entries.find((e) => !e.file.toLowerCase().includes("marella"));
    return hasMar ? (marEntry ?? entries[0]) : (nonMarEntry ?? entries[0]);
  }
  return best;
}

// ---------------------------------------------------------------------------
// Slug / money helpers
// ---------------------------------------------------------------------------

function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function ensureUniqueSlug(base: string, used: Set<string>): string {
  let slug = base;
  let n = 2;
  while (used.has(slug)) {
    slug = `${base}-${n++}`;
  }
  used.add(slug);
  return slug;
}

function parseMoney(raw: string | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "").trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n.toFixed(2);
}

function parseWeight(raw: string | undefined): string | null {
  if (!raw) return null;
  // "100 lbs./45 kg." → take the number before "lbs"
  const m = raw.match(/^([\d.]+)\s*lbs?/i);
  if (m) return m[1];
  // fallback: first number
  const n = parseFloat(raw.replace(/[^0-9.]/g, ""));
  return !isNaN(n) ? String(n) : null;
}

// ---------------------------------------------------------------------------
// CSV row shape
// ---------------------------------------------------------------------------

interface CsvRow {
  "Product Name": string;
  Category: string;
  "SKU / Model": string;
  Weight: string;
  Dimensions: string;
  Description: string;
  MSRP: string;
  "Sale Price": string;
  "Image Note": string;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const { data, errors } = Papa.parse<CsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length > 0) {
    console.error("CSV parse errors:", errors.slice(0, 5));
    throw new Error("CSV parse failed");
  }
  console.log(`Parsed ${data.length} rows from CSV`);

  const usedSlugs = new Set<string>();
  let inserted = 0;
  let updated = 0;
  let imagesUploaded = 0;
  const skipped: string[] = [];

  for (const row of data) {
    const productName = row["Product Name"]?.trim();
    if (!productName) continue;

    const csvSku = (row["SKU / Model"] ?? "").trim();
    const sku = SKU_REMAP[productName] ?? csvSku;
    if (!sku) {
      console.warn(`  WARN: no SKU for "${productName}", skipping`);
      skipped.push(productName);
      continue;
    }

    const csvCategory = (row.Category ?? "").trim();
    const categoryId = CATEGORY_MAP[csvCategory];
    if (!categoryId) {
      console.warn(`  WARN: unknown category "${csvCategory}" for "${productName}", skipping`);
      skipped.push(productName);
      continue;
    }

    const msrp = parseMoney(row.MSRP);
    const salePrice = parseMoney(row["Sale Price"]);
    const hasPricing = msrp !== null && salePrice !== null;

    const weight = parseWeight(row.Weight);
    const dimensions = row.Dimensions?.trim() || null;
    const description = row.Description?.trim() || null;

    const slug = ensureUniqueSlug(
      toSlug(productName) + "-frankford",
      usedSlugs,
    );

    // Check if already exists by SKU
    const [existing] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    // Find and upload image (only for new products)
    let primaryImageUrl: string | null = null;
    if (!existing) {
      const imgEntry = await findImage(csvSku, productName);
      if (imgEntry) {
        try {
          const buffer = await readFile(join(imgEntry.dir, imgEntry.file));
          const ext = imgEntry.file.toLowerCase().endsWith(".png") ? "png"
            : imgEntry.file.toLowerCase().endsWith(".webp") ? "webp"
            : "jpg";
          const contentType =
            ext === "png" ? "image/png"
            : ext === "webp" ? "image/webp"
            : "image/jpeg";
          const storageFilename = `${toSlug(productName)}.${ext}`;
          primaryImageUrl = await uploadBuffer(buffer, contentType, storageFilename);
          imagesUploaded++;
          console.log(`  Uploaded image: ${storageFilename}`);
        } catch (err) {
          console.error(`  ERROR uploading image for "${productName}":`, err);
        }
      } else {
        console.warn(`  WARN: no image found for "${productName}" (normalized SKU key: ${normalizeSkuForImage(csvSku).toLowerCase()})`);
      }
    }

    if (existing) {
      await db
        .update(productsTable)
        .set({
          name: productName,
          description,
          dimensions,
          ...(weight ? { weight } : {}),
          ...(hasPricing ? { msrp, price: msrp!, salePrice } : {}),
        })
        .where(eq(productsTable.id, existing.id));
      updated++;
      console.log(`  Updated: ${productName} (sku=${sku})`);
    } else {
      const [ins] = await db
        .insert(productsTable)
        .values({
          name: productName,
          slug,
          sku,
          description,
          shortDescription: description,
          manufacturerId: MANUFACTURER_ID,
          categoryId,
          dimensions,
          ...(weight ? { weight } : {}),
          ...(hasPricing
            ? { msrp, price: msrp!, salePrice }
            : {}),
          availableOnline: hasPricing,
          showPriceOnline: hasPricing,
          quoteOnly: !hasPricing,
          inStoreOnly: false,
          isActive: true,
          featured: false,
          displayOrder: 0,
          lowStockThreshold: 0,
          pricingMode: "fixed",
        })
        .returning({ id: productsTable.id });

      const productId = ins.id;
      inserted++;
      console.log(`  Inserted: ${productName} (sku=${sku}, id=${productId})`);

      // Inventory row (product-level, no variants)
      await db.insert(inventoryTable).values({
        productId,
        variantId: null,
        onHand: 0,
        reorderThreshold: 0,
      });

      // Primary image
      if (primaryImageUrl) {
        await db.insert(productImagesTable).values({
          productId,
          variantId: null,
          url: primaryImageUrl,
          altText: productName,
          displayOrder: 0,
          isPrimary: true,
        });
      }
    }
  }

  console.log(
    `\nDone. inserted=${inserted} updated=${updated} images=${imagesUploaded}` +
      (skipped.length ? `\nSkipped: ${skipped.join(", ")}` : ""),
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
