/**
 * One-shot idempotent loader for the OW Lee product catalog.
 *
 * Reads `attached_assets/OWLee_Product_Specs_Master_Updated_*.xlsx` (the
 * latest file matching the prefix), upserts the OW Lee manufacturer, and
 * upserts every spec row into `products`. Each product is assigned to one
 * of the storefront's top-level categories (Chaise Lounges, Deep Seating,
 * Dining, or Fire Tables) based on its product name. The original
 * collection name is preserved in `specs.collection`.
 *
 * OW Lee products are not sold online — they are quote-only. The loader
 * sets `quoteOnly = true`, `showPriceOnline = false`, and leaves price
 * blank. The storefront swaps Add-to-Cart for a "Available through a
 * sales agent" notice; Wishlist still works.
 *
 * Images are not provided by the vendor sheet — the storefront falls
 * back to its built-in "Oasis" placeholder tile until the team uploads
 * real photos via the admin UI.
 *
 * Usage:  pnpm --filter @workspace/scripts run load-ow-lee
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";
import { eq, sql } from "drizzle-orm";
import {
  db,
  manufacturersTable,
  categoriesTable,
  productsTable,
} from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, "../../attached_assets");

const MANUFACTURER_NAME = "O.W. Lee";
const MANUFACTURER_SLUG = "o-w-lee";

/**
 * Map an O.W. Lee product name to one of the storefront's top-level
 * category slugs. Order matters — more-specific patterns must come first
 * (e.g. "Adjustable Chaise" before "Lounge Chair", "Dining" before the
 * generic seating fallback).
 */
function categorizeOwLeeProduct(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("fire pit")) return "cat-fire-tables";
  if (n.includes("chaise")) return "cat-chaise-lounges";
  if (
    n.includes("bar stool") ||
    n.includes("counter stool") ||
    n.includes("dining")
  )
    return "cat-dining";
  if (
    n.includes("table top") ||
    n.includes("table base") ||
    n.includes("pre-designed table")
  )
    return "cat-dining";
  return "cat-deep-seating";
}

type SpecRow = {
  Collection: string | null;
  "Product Name": string | null;
  SKU: string | null;
  "Height (in)": number | string | null;
  "Width/Diam (in)": number | string | null;
  "Depth/Length (in)": number | string | null;
  "Arm Height (in)": number | string | null;
  "Seat Height (in)": number | string | null;
  "Weight (lbs)": number | string | null;
  "Spec Sheet PDF URL": string | null;
};

function findLatest(prefix: string, ext: string): string {
  const matches = readdirSync(ASSETS_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith(ext))
    .sort();
  if (matches.length === 0) {
    throw new Error(`No file found with prefix ${prefix} and ext ${ext}`);
  }
  return join(ASSETS_DIR, matches[matches.length - 1]!);
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function clean(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length === 0 ? null : s;
}

async function ensureManufacturer(): Promise<number> {
  const existing = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(sql`LOWER(${manufacturersTable.name}) = LOWER(${MANUFACTURER_NAME})`)
    .limit(1);
  if (existing[0]) return existing[0].id;
  const [created] = await db
    .insert(manufacturersTable)
    .values({
      name: MANUFACTURER_NAME,
      slug: MANUFACTURER_SLUG,
      displayOrder: 0,
      isActive: true,
    })
    .returning({ id: manufacturersTable.id });
  if (!created) throw new Error("Failed to create OW Lee manufacturer");
  console.log(`  + manufacturer "${MANUFACTURER_NAME}" (id=${created.id})`);
  return created.id;
}

async function getCategoryIdBySlug(slug: string): Promise<number> {
  const [row] = await db
    .select({ id: categoriesTable.id })
    .from(categoriesTable)
    .where(eq(categoriesTable.slug, slug))
    .limit(1);
  if (!row) {
    throw new Error(
      `Required category "${slug}" is missing. Seed the storefront's top-level categories before running the loader.`,
    );
  }
  return row.id;
}

function buildSpecs(r: SpecRow): Record<string, string> {
  const fields: Array<[string, unknown]> = [
    ["collection", r.Collection],
    ["height_in", r["Height (in)"]],
    ["width_diameter_in", r["Width/Diam (in)"]],
    ["depth_length_in", r["Depth/Length (in)"]],
    ["arm_height_in", r["Arm Height (in)"]],
    ["seat_height_in", r["Seat Height (in)"]],
    ["weight_lbs", r["Weight (lbs)"]],
    ["spec_sheet_pdf", r["Spec Sheet PDF URL"]],
  ];
  const out: Record<string, string> = {};
  for (const [k, v] of fields) {
    const t = clean(v);
    if (t) out[k] = t;
  }
  return out;
}

async function main(): Promise<void> {
  const xlsxPath = findLatest("OWLee_Product_Specs_Master", ".xlsx");
  console.log(`Loading OW Lee data from ${xlsxPath}`);
  const wb = xlsx.read(readFileSync(xlsxPath), { type: "buffer" });
  const sheet = wb.Sheets["Product Specs"];
  if (!sheet) throw new Error("Workbook is missing 'Product Specs' sheet");
  const rows = xlsx.utils.sheet_to_json<SpecRow>(sheet, { defval: null });
  console.log(`  parsed ${rows.length} spec rows`);

  const manufacturerId = await ensureManufacturer();

  // Cache the four functional category ids up front.
  const categoryIdBySlug = new Map<string, number>();
  for (const slug of [
    "cat-chaise-lounges",
    "cat-deep-seating",
    "cat-dining",
    "cat-fire-tables",
  ]) {
    categoryIdBySlug.set(slug, await getCategoryIdBySlug(slug));
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  let i = 0;

  for (const r of rows) {
    const sku = clean(r.SKU);
    const productName = clean(r["Product Name"]);
    const collection = clean(r.Collection);
    if (!sku || !productName || !collection) {
      skipped += 1;
      continue;
    }

    const fullName = `${collection} ${productName}`;
    const categorySlug = categorizeOwLeeProduct(fullName);
    const categoryId = categoryIdBySlug.get(categorySlug);
    if (categoryId === undefined) {
      throw new Error(`Unmapped category slug ${categorySlug}`);
    }

    const slug = slugify(`owlee-${collection}-${productName}-${sku}`);
    const specs = buildSpecs(r);
    const dimsBits: string[] = [];
    if (specs.height_in) dimsBits.push(`H ${specs.height_in}"`);
    if (specs.width_diameter_in) dimsBits.push(`W ${specs.width_diameter_in}"`);
    if (specs.depth_length_in) dimsBits.push(`D ${specs.depth_length_in}"`);
    const dimensions = dimsBits.length > 0 ? dimsBits.join(" × ") : null;
    const weight = specs.weight_lbs
      ? specs.weight_lbs.replace(/\s*\(.*?\)\s*/g, "").trim() || null
      : null;
    const shortDescription = `${collection} collection · ${productName} by O.W. Lee`;
    const description =
      `Part of the O.W. Lee ${collection} collection. Crafted in the USA, ` +
      `O.W. Lee pieces are built to order and sold exclusively through ` +
      `our showroom — contact a sales agent for pricing, finishes, and ` +
      `cushion options.`;
    const tags = ["o-w-lee", slugify(collection), "made-in-usa"];

    const existing = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    if (existing[0]) {
      await db
        .update(productsTable)
        .set({
          name: fullName,
          slug,
          manufacturerId,
          categoryId,
          shortDescription,
          description,
          dimensions,
          weight: weight && /^[\d.]+$/.test(weight) ? weight : null,
          specs,
          tags,
          showPriceOnline: false,
          availableOnline: true,
          inStoreOnly: true,
          quoteOnly: true,
          isActive: true,
          updatedAt: new Date(),
        })
        .where(eq(productsTable.id, existing[0].id));
      updated += 1;
    } else {
      await db.insert(productsTable).values({
        name: fullName,
        slug,
        sku,
        shortDescription,
        description,
        dimensions,
        weight: weight && /^[\d.]+$/.test(weight) ? weight : null,
        specs,
        tags,
        manufacturerId,
        categoryId,
        displayOrder: i,
        showPriceOnline: false,
        availableOnline: true,
        inStoreOnly: true,
        quoteOnly: true,
        featured: false,
        lowStockThreshold: 0,
        isActive: true,
      });
      created += 1;
    }
    i += 1;
  }

  console.log(
    `OW Lee load complete: ${created} created, ${updated} updated, ${skipped} skipped (of ${rows.length} rows)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
