/**
 * OW Lee catalog refresh (v2).
 *
 * Treats `attached_assets/owlee_products_clean_v2_*.csv` as the source of
 * truth for ALL OW Lee product data. It:
 *   - Updates existing products (matched by SKU): description, short
 *     description, material, and specs. Existing name + slug are PRESERVED
 *     (the storefront's collection filter keys on the product name's first
 *     word, and the current names already work with it).
 *   - Creates the new products in the CSV (quote-only — no pricing in the
 *     file) with a collection-prefixed name so the filter keeps working.
 *   - Handles the three fire-pit SKUs that appear as BOTH a Phoenix
 *     (wrought iron) and a Volante (aluminum) product. Because product SKUs
 *     are globally unique, both variants are stored under a suffixed SKU
 *     (-PH / -VO). Any existing bare-SKU row is migrated to its suffixed
 *     form first.
 *
 * Specs are MERGED, never blindly replaced: the CSV's free-text
 * `specifications` column ("Weight: 46 lbs", "Width/Diameter (in): 42\" | ...")
 * is parsed into the same structured keys the existing data uses, and only
 * the fields the CSV provides override existing values — dimensions the CSV
 * omits are kept.
 *
 * Images are handled by `uploadOwleeImagesV2.ts`.
 *
 * Idempotent. Run with:
 *   pnpm --filter @workspace/scripts exec tsx src/loadOwLeeV2.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { eq, sql } from "drizzle-orm";
import {
  db,
  manufacturersTable,
  categoriesTable,
  productsTable,
  materialsTable,
  productMaterialsTable,
} from "@workspace/db";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS_DIR = resolve(__dirname, "../../attached_assets");

const MANUFACTURER_SLUG = "o-w-lee";

// Fire-pit SKUs that exist as both a Phoenix and a Volante product.
const DUP_BASE_SKUS = new Set(["5113-3156O", "5113-3156C", "5113-42RDC"]);

type CsvRow = {
  collection: string;
  name: string;
  sku: string;
  material: string;
  description: string;
  specifications: string;
  datasheet_url: string;
  product_url: string;
};

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

/** Effective (storable) SKU: dup fire-pit bases get a collection suffix. */
function effectiveSku(sku: string, collection: string): string {
  if (DUP_BASE_SKUS.has(sku)) {
    return collection.toLowerCase() === "phoenix" ? `${sku}-PH` : `${sku}-VO`;
  }
  return sku;
}

/** Collection-prefixed display name so the first word is the collection. */
function buildName(collection: string, csvName: string): string {
  if (csvName.toLowerCase().startsWith(collection.toLowerCase())) return csvName;
  return `${collection} ${csvName}`;
}

/** First paragraph of a (plain-text) description, used as the top blurb. */
function firstParagraph(desc: string): string {
  const normalized = desc.replace(/\r\n/g, "\n").replace(/^\s+/, "");
  const idx = normalized.search(/\n\s*\n/);
  return (idx === -1 ? normalized : normalized.slice(0, idx)).trim();
}

/**
 * Parse the CSV `specifications` free text into the structured spec keys the
 * existing data + the PDP use. Format is "Label: value | Label: value".
 */
function parseSpecifications(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const labelMap: Array<[RegExp, string, "dim" | "weight" | "text"]> = [
    [/^height\s*\(in\)$/i, "height_in", "dim"],
    [/^width\/?diameter\s*\(in\)$/i, "width_diameter_in", "dim"],
    [/^depth\/?length\s*\(in\)$/i, "depth_length_in", "dim"],
    [/^arm\s*height\s*\(in\)$/i, "arm_height_in", "dim"],
    [/^seat\s*height\s*\(in\)$/i, "seat_height_in", "dim"],
    [/^packaged\s*weight$/i, "weight_lbs", "weight"],
    [/^weight$/i, "weight_lbs", "weight"],
    [/^special\s*notes$/i, "special_notes", "text"],
  ];
  for (const part of text.split("|")) {
    const ci = part.indexOf(":");
    if (ci === -1) continue;
    const label = part.slice(0, ci).trim();
    let value = part.slice(ci + 1).trim();
    if (!value) continue;
    const entry = labelMap.find(([re]) => re.test(label));
    if (!entry) continue;
    const [, key, kind] = entry;
    if (kind === "dim") {
      value = value.replace(/["″]+\s*$/, "").trim();
    } else if (kind === "weight") {
      const isPackaged = /packaged/i.test(label);
      const num = value.replace(/\s*lbs\.?\s*$/i, "").trim();
      value = isPackaged ? `${num} (pkg)` : num;
    }
    if (value) out[key] = value;
  }
  return out;
}

const DIM_KEYS = [
  "height_in",
  "width_diameter_in",
  "depth_length_in",
  "arm_height_in",
  "seat_height_in",
  "weight_lbs",
  "special_notes",
] as const;

function buildDimensions(specs: Record<string, unknown>): string | null {
  const bits: string[] = [];
  if (specs.height_in) bits.push(`H ${specs.height_in}"`);
  if (specs.width_diameter_in) bits.push(`W ${specs.width_diameter_in}"`);
  if (specs.depth_length_in) bits.push(`D ${specs.depth_length_in}"`);
  return bits.length > 0 ? bits.join(" × ") : null;
}

function weightColumn(specs: Record<string, unknown>): string | null {
  const w = specs.weight_lbs ? String(specs.weight_lbs).trim() : "";
  return /^[\d.]+$/.test(w) ? w : null;
}

async function getManufacturerId(): Promise<number> {
  const [row] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.slug, MANUFACTURER_SLUG))
    .limit(1);
  if (!row) throw new Error(`Manufacturer ${MANUFACTURER_SLUG} not found`);
  return row.id;
}

async function buildCategoryMap(): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  for (const slug of [
    "cat-chaise-lounges",
    "cat-deep-seating",
    "cat-dining",
    "cat-fire-tables",
  ]) {
    const [row] = await db
      .select({ id: categoriesTable.id })
      .from(categoriesTable)
      .where(eq(categoriesTable.slug, slug))
      .limit(1);
    if (!row) throw new Error(`Required category "${slug}" missing`);
    map.set(slug, row.id);
  }
  return map;
}

async function buildMaterialMap(): Promise<Map<string, number>> {
  const rows = await db
    .select({ id: materialsTable.id, name: materialsTable.name })
    .from(materialsTable);
  const map = new Map<string, number>();
  for (const r of rows) map.set(r.name.toLowerCase(), r.id);
  return map;
}

/** Migrate the 3 bare fire-pit SKUs to their suffixed form before upserting. */
async function migrateDupFirePits(manufacturerId: number): Promise<void> {
  for (const base of DUP_BASE_SKUS) {
    const [row] = await db
      .select({ id: productsTable.id, specs: productsTable.specs })
      .from(productsTable)
      .where(eq(productsTable.sku, base))
      .limit(1);
    if (!row) continue; // already migrated or never existed
    const specs = (row.specs ?? {}) as Record<string, unknown>;
    const collection = String(specs.collection ?? "").toLowerCase();
    const suffix = collection === "phoenix" ? "-PH" : "-VO";
    await db
      .update(productsTable)
      .set({ sku: `${base}${suffix}`, updatedAt: new Date() })
      .where(eq(productsTable.id, row.id));
    console.log(`  migrated fire-pit SKU ${base} -> ${base}${suffix}`);
  }
}

async function nextDisplayOrder(manufacturerId: number): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`COALESCE(MAX(${productsTable.displayOrder}), 0)` })
    .from(productsTable)
    .where(eq(productsTable.manufacturerId, manufacturerId));
  return (row?.max ?? 0) + 1;
}

async function main(): Promise<void> {
  const csvPath = findLatest("owlee_products_clean_v2", ".csv");
  console.log(`Loading OW Lee v2 data from ${csvPath}`);
  const parsed = Papa.parse<CsvRow>(readFileSync(csvPath, "utf-8"), {
    header: true,
    skipEmptyLines: true,
  });
  const rows = parsed.data.filter((r) => clean(r.sku));
  console.log(`  parsed ${rows.length} rows`);

  const manufacturerId = await getManufacturerId();
  const categoryMap = await buildCategoryMap();
  const materialMap = await buildMaterialMap();

  await migrateDupFirePits(manufacturerId);
  let displayOrder = await nextDisplayOrder(manufacturerId);

  let created = 0;
  let updated = 0;

  for (const r of rows) {
    const rawSku = clean(r.sku)!;
    const collection = clean(r.collection) ?? "";
    const csvName = clean(r.name) ?? rawSku;
    const sku = effectiveSku(rawSku, collection);

    const description = clean(r.description) ?? "";
    const shortDescription = firstParagraph(description) || null;

    const materialName = clean(r.material);
    const materialId = materialName
      ? (materialMap.get(materialName.toLowerCase()) ?? null)
      : null;

    const csvSpecs: Record<string, string> = {};
    if (collection) csvSpecs.collection = collection;
    const datasheet = clean(r.datasheet_url);
    if (datasheet) csvSpecs.spec_sheet_pdf = datasheet;
    const specText = clean(r.specifications);
    if (specText) Object.assign(csvSpecs, parseSpecifications(specText));

    const [existing] = await db
      .select({
        id: productsTable.id,
        specs: productsTable.specs,
      })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    if (existing) {
      // Merge: keep existing specs, let CSV-provided keys override.
      const mergedSpecs: Record<string, unknown> = {
        ...((existing.specs ?? {}) as Record<string, unknown>),
        ...csvSpecs,
      };
      const set: Record<string, unknown> = {
        description: description || undefined,
        shortDescription,
        specs: mergedSpecs,
        dimensions: buildDimensions(mergedSpecs),
        weight: weightColumn(mergedSpecs),
        showPriceOnline: false,
        availableOnline: true,
        inStoreOnly: true,
        quoteOnly: true,
        isActive: true,
        updatedAt: new Date(),
      };
      // For the dup fire-pit SKUs, normalize the name to be collection-prefixed
      // so both the Phoenix and Volante variants group under the collection
      // filter (which keys on the product name's first word).
      if (DUP_BASE_SKUS.has(rawSku)) {
        const name = buildName(collection, csvName);
        set.name = name;
        set.slug = slugify(`owlee-${collection}-${csvName}-${sku}`);
        const categorySlug = categorizeOwLeeProduct(name);
        set.categoryId = categoryMap.get(categorySlug)!;
      }
      await db
        .update(productsTable)
        .set(set)
        .where(eq(productsTable.id, existing.id));
      // Only link material when the CSV provides one (junction, idempotent).
      if (materialId !== null) {
        await db
          .insert(productMaterialsTable)
          .values({ productId: existing.id, materialId, displayOrder: 0 })
          .onConflictDoNothing();
      }
      updated += 1;
    } else {
      const name = buildName(collection, csvName);
      const categorySlug = categorizeOwLeeProduct(name);
      const categoryId = categoryMap.get(categorySlug)!;
      const slug = slugify(`owlee-${collection}-${csvName}-${sku}`);
      const [insertedRow] = await db
        .insert(productsTable)
        .values({
          name,
          slug,
          sku,
          shortDescription,
          description: description || null,
          dimensions: buildDimensions(csvSpecs),
          weight: weightColumn(csvSpecs),
          specs: csvSpecs,
          tags: ["o-w-lee", slugify(collection), "made-in-usa"],
          manufacturerId,
          categoryId,
          displayOrder: displayOrder++,
          showPriceOnline: false,
          availableOnline: true,
          inStoreOnly: true,
          quoteOnly: true,
          featured: false,
          lowStockThreshold: 0,
          isActive: true,
        })
        .returning({ id: productsTable.id });
      if (insertedRow && materialId !== null) {
        await db
          .insert(productMaterialsTable)
          .values({ productId: insertedRow.id, materialId, displayOrder: 0 })
          .onConflictDoNothing();
      }
      created += 1;
    }
  }

  console.log(
    `OW Lee v2 load complete: ${created} created, ${updated} updated (of ${rows.length} rows)`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
