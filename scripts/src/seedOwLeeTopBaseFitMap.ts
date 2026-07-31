/**
 * Seed OW Lee table-top → table-base compatibility recommendations from the
 * vendor fit map CSV.
 *
 * Source: attached_assets/owlee_top_base_fit_map_1785463205745.csv
 *   table_top_sku, base_sku
 *
 * The "top" SKUs are VARIANT skus on the 7 OW Lee *-TOPS products (D/E/K/MM/
 * P/V/W-TOPS), so rows are keyed source_sku = variant_sku (e.g. "#K-24RDS").
 * The customer PDP fetches recommendations for the selected top size and shows
 * the fitting bases (base SKUs are real products under mfr 13).
 *
 * Rules (per owner):
 *   - Only OW Lee table tops; no other manufacturers or SKUs.
 *   - CSV top/base SKUs not already in the DB are skipped (never created).
 *   - No primary "Recommended" pick — all fits are equal; CSV order preserved
 *     per top via display_order.
 *   - Customer UI only; no reverse recommendation on base PDPs.
 *
 * Idempotent: upserts on (source_sku, compatible_sku).
 */
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  productsTable,
  productVariantsTable,
  productRecommendationsTable,
} from "@workspace/db";

const CSV_PATH =
  "/home/runner/workspace/attached_assets/owlee_top_base_fit_map_1785463205745.csv";
const OW_LEE_MANUFACTURER_ID = 13;

type CsvRow = { table_top_sku: string; base_sku: string };

async function main() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const parsed = Papa.parse<CsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length > 0) {
    throw new Error(`CSV parse errors: ${JSON.stringify(parsed.errors.slice(0, 3))}`);
  }
  const rows = parsed.data
    .map((r) => ({
      topSku: (r.table_top_sku ?? "").trim(),
      baseSku: (r.base_sku ?? "").trim(),
    }))
    .filter((r) => r.topSku !== "" && r.baseSku !== "");
  console.log(`CSV rows: ${rows.length}`);

  // Valid top variant SKUs: variants belonging to OW Lee products.
  const topSkus = [...new Set(rows.map((r) => r.topSku))];
  const validTops = new Set(
    (
      await db
        .select({ variantSku: productVariantsTable.variantSku })
        .from(productVariantsTable)
        .innerJoin(
          productsTable,
          eq(productsTable.id, productVariantsTable.productId),
        )
        .where(
          and(
            inArray(productVariantsTable.variantSku, topSkus),
            eq(productsTable.manufacturerId, OW_LEE_MANUFACTURER_ID),
          ),
        )
    ).map((v) => v.variantSku),
  );

  // Valid base SKUs: real OW Lee products.
  const baseSkus = [...new Set(rows.map((r) => r.baseSku))];
  const validBases = new Set(
    (
      await db
        .select({ sku: productsTable.sku })
        .from(productsTable)
        .where(
          and(
            inArray(productsTable.sku, baseSkus),
            eq(productsTable.manufacturerId, OW_LEE_MANUFACTURER_ID),
          ),
        )
    ).map((p) => p.sku),
  );

  const skippedTops = topSkus.filter((s) => !validTops.has(s));
  const skippedBases = baseSkus.filter((s) => !validBases.has(s));
  if (skippedTops.length) console.log(`Skipping unknown top SKUs: ${skippedTops.join(", ")}`);
  if (skippedBases.length) console.log(`Skipping unknown base SKUs: ${skippedBases.join(", ")}`);

  // display_order = CSV order within each top.
  const perTopCounter = new Map<string, number>();
  let upserted = 0;
  let skipped = 0;
  for (const r of rows) {
    if (!validTops.has(r.topSku) || !validBases.has(r.baseSku)) {
      skipped++;
      continue;
    }
    const order = perTopCounter.get(r.topSku) ?? 0;
    perTopCounter.set(r.topSku, order + 1);
    await db
      .insert(productRecommendationsTable)
      .values({
        sourceSku: r.topSku,
        compatibleSku: r.baseSku,
        isRecommended: false,
        displayOrder: order,
      })
      .onConflictDoUpdate({
        target: [
          productRecommendationsTable.sourceSku,
          productRecommendationsTable.compatibleSku,
        ],
        set: { isRecommended: false, displayOrder: order },
      });
    upserted++;
  }
  console.log(`Upserted ${upserted} recommendation rows; skipped ${skipped}.`);
  console.log(`Tops mapped: ${perTopCounter.size}`);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
