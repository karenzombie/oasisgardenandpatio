/**
 * Idempotent price loader for Treasure Garden (TG) products.
 *
 *   Source CSV: attached_assets/TreasureGarden_2026_Prices_*.csv (latest by name)
 *   Columns:    SKU, Product_Name, MSRP, Sale_Price
 *
 * Mapping (per the storefront sale display + staff portal expectations):
 *   - products.price     <- CSV MSRP        (struck-through "MSRP" on storefront)
 *   - products.msrp      <- CSV MSRP        (staff "MSRP" field)
 *   - products.salePrice <- CSV Sale_Price  (emphasized active/sale price; used at checkout)
 *
 * SKU resolution (TG products only, matched by manufacturer):
 *   1. Direct match: products.sku === CSV SKU.
 *   2. Finish fallback: when a product has no direct CSV row but the CSV carries
 *      finish-suffixed rows (e.g. AKZP13_00 / AKZP13_SSWO), use a SINGLE price for
 *      the product — preferring the standard "_00" finish, else the lowest MSRP
 *      row. Per product requirement, finish selection itself never changes price.
 *
 * Products with no resolvable CSV price are left untouched and reported.
 *
 * Idempotent: re-running simply re-applies the same prices.
 *
 * Usage:  pnpm --filter @workspace/scripts exec tsx src/importTreasureGardenPrices.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Papa from "papaparse";
import { db, productsTable, manufacturersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const TG_NAME = "Treasure Garden";

type PriceRow = { sku: string; name: string; msrp: number; sale: number };

function findLatestPriceCsv(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const assetsDir = resolve(here, "../../attached_assets");
  const matches = readdirSync(assetsDir)
    .filter((f) => /^TreasureGarden_.*Prices.*\.csv$/i.test(f))
    .sort();
  if (matches.length === 0) {
    throw new Error(
      `No TreasureGarden price CSV found in ${assetsDir} (expected TreasureGarden_*Prices*.csv)`,
    );
  }
  return join(assetsDir, matches[matches.length - 1]!);
}

function parsePriceCsv(path: string): PriceRow[] {
  const raw = readFileSync(path, "utf8");
  const parsed = Papa.parse<Record<string, string>>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  const rows: PriceRow[] = [];
  for (const r of parsed.data) {
    const sku = (r.SKU ?? "").trim();
    if (!sku) continue;
    const msrp = Number(r.MSRP);
    const sale = Number(r.Sale_Price);
    if (!Number.isFinite(msrp) || !Number.isFinite(sale)) continue;
    rows.push({ sku, name: (r.Product_Name ?? "").trim(), msrp, sale });
  }
  return rows;
}

/** Resolve a single {msrp, sale} for a product SKU, with finish fallback. */
function resolvePrice(
  productSku: string,
  byExact: Map<string, PriceRow>,
  rows: PriceRow[],
): { row: PriceRow; via: "direct" | "finish-fallback" } | null {
  const direct = byExact.get(productSku);
  if (direct) return { row: direct, via: "direct" };

  // Finish-suffixed candidates: "<sku>_..." (underscore boundary avoids matching
  // sibling SKUs like AKZP13 when looking up AKZP).
  const prefix = `${productSku}_`;
  const candidates = rows.filter((r) => r.sku.startsWith(prefix));
  if (candidates.length === 0) return null;

  const standard = candidates.find((r) => r.sku === `${productSku}_00`);
  const chosen =
    standard ??
    candidates.reduce((lo, r) => (r.msrp < lo.msrp ? r : lo), candidates[0]!);
  return { row: chosen, via: "finish-fallback" };
}

async function main() {
  const csvPath = findLatestPriceCsv();
  const rows = parsePriceCsv(csvPath);
  const byExact = new Map<string, PriceRow>();
  for (const r of rows) byExact.set(r.sku, r);
  console.log(`Loaded ${rows.length} price rows from ${csvPath}`);

  const [tg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, TG_NAME));
  if (!tg) throw new Error(`Manufacturer "${TG_NAME}" not found`);

  const products = await db
    .select({ id: productsTable.id, sku: productsTable.sku })
    .from(productsTable)
    .where(eq(productsTable.manufacturerId, tg.id));
  console.log(`Found ${products.length} ${TG_NAME} products`);

  let updated = 0;
  const fallbacks: string[] = [];
  const skipped: string[] = [];

  for (const p of products) {
    if (!p.sku) {
      skipped.push(`(id ${p.id}, no sku)`);
      continue;
    }
    const resolved = resolvePrice(p.sku, byExact, rows);
    if (!resolved) {
      skipped.push(p.sku);
      continue;
    }
    const { row, via } = resolved;
    const msrp = row.msrp.toFixed(2);
    const sale = row.sale.toFixed(2);
    await db
      .update(productsTable)
      .set({ price: msrp, msrp, salePrice: sale })
      .where(eq(productsTable.id, p.id));
    updated += 1;
    if (via === "finish-fallback") {
      fallbacks.push(`${p.sku} -> ${row.sku} (MSRP ${msrp}, Sale ${sale})`);
    }
  }

  console.log(`\nUpdated ${updated} products.`);
  if (fallbacks.length) {
    console.log(`\nFinish fallback used (single price, no per-finish change):`);
    for (const f of fallbacks) console.log(`  - ${f}`);
  }
  if (skipped.length) {
    console.log(`\nNo CSV price found (left untouched): ${skipped.join(", ")}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
