/**
 * Seed OW Lee seating variants + fabric-grade pricing from the vendor CSV.
 *
 * Source: attached_assets/owlee_frame_fabric_msrp_1785457964325.csv
 *   sku, item_name, msrp_frame, aa_fabrics, a_fabrics, b_fabrics, c_fabrics,
 *   d_fabrics, frame_only_available
 *
 * For each CSV row whose sku matches an existing OW Lee product (mfr 13):
 *   - Upsert ONE variant (variant_sku = product sku, option "Configuration")
 *   - Upsert variant_grade_prices rows for each non-empty grade cell
 *     (AA, A, B, C, D) with msrp only (sale_price NULL, cost NULL)
 *   - When frame_only_available = Yes and msrp_frame is present, upsert a
 *     reserved "Frame Only" grade row carrying the frame-only MSRP.
 *
 * SKUs not present in the DB are skipped (reported, never created).
 * Never touches products from other manufacturers, nor any product's
 * available_online / show_price_online flags.
 *
 * Idempotent: re-running updates MSRPs in place (sale/cost left untouched).
 */
import { readFileSync } from "node:fs";
import Papa from "papaparse";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  productsTable,
  productVariantsTable,
  variantGradePricesTable,
} from "@workspace/db";

const CSV_PATH =
  "/home/runner/workspace/attached_assets/owlee_frame_fabric_msrp_1785457964325.csv";
const OW_LEE_MANUFACTURER_ID = 13;
const FRAME_ONLY_GRADE = "Frame Only";

type CsvRow = {
  sku: string;
  item_name: string;
  msrp_frame: string;
  aa_fabrics: string;
  a_fabrics: string;
  b_fabrics: string;
  c_fabrics: string;
  d_fabrics: string;
  frame_only_available: string;
};

const GRADE_COLUMNS: Array<{ col: keyof CsvRow; grade: string }> = [
  { col: "aa_fabrics", grade: "AA" },
  { col: "a_fabrics", grade: "A" },
  { col: "b_fabrics", grade: "B" },
  { col: "c_fabrics", grade: "C" },
  { col: "d_fabrics", grade: "D" },
];

const money = /^\d+(\.\d{1,2})?$/;

function cleanMoney(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  if (t === "") return null;
  if (!money.test(t)) throw new Error(`Bad money value: "${t}"`);
  return t;
}

async function main() {
  const text = readFileSync(CSV_PATH, "utf8");
  const parsed = Papa.parse<CsvRow>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  if (parsed.errors.length > 0) {
    console.error("CSV parse errors:", parsed.errors);
    process.exit(1);
  }
  const rows = parsed.data;
  console.log(`CSV rows: ${rows.length}`);

  // Load OW Lee products keyed by sku
  const products = await db
    .select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.manufacturerId, OW_LEE_MANUFACTURER_ID));
  const bySku = new Map(products.map((p) => [p.sku, p]));

  let skipped: string[] = [];
  let variantsCreated = 0;
  let variantsExisting = 0;
  let gradeRowsUpserted = 0;
  let frameRows = 0;

  for (const row of rows) {
    const sku = (row.sku ?? "").trim();
    if (!sku) continue;
    const product = bySku.get(sku);
    if (!product) {
      skipped.push(sku);
      continue;
    }

    const frameOnly = (row.frame_only_available ?? "").trim().toLowerCase() === "yes";
    const frameMsrp = cleanMoney(row.msrp_frame);

    // Build grade price list from non-empty cells
    const gradePrices: Array<{ grade: string; msrp: string }> = [];
    for (const { col, grade } of GRADE_COLUMNS) {
      const v = cleanMoney(row[col]);
      if (v != null) gradePrices.push({ grade, msrp: v });
    }
    if (frameOnly && frameMsrp != null) {
      gradePrices.push({ grade: FRAME_ONLY_GRADE, msrp: frameMsrp });
    }
    if (frameOnly && frameMsrp == null) {
      console.warn(`  WARN ${sku}: frame_only=Yes but msrp_frame empty — no Frame Only row`);
    }
    if (gradePrices.length === 0) {
      console.warn(`  WARN ${sku}: no priced grades at all — skipping`);
      continue;
    }

    // Upsert the single variant (variant_sku = product sku)
    const existing = await db
      .select({ id: productVariantsTable.id })
      .from(productVariantsTable)
      .where(
        and(
          eq(productVariantsTable.productId, product.id),
          eq(productVariantsTable.variantSku, sku),
        ),
      );
    let variantId: number;
    if (existing.length > 0) {
      variantId = existing[0]!.id;
      variantsExisting++;
    } else {
      const [ins] = await db
        .insert(productVariantsTable)
        .values({
          productId: product.id,
          variantSku: sku,
          variantName: product.name,
          optionLabel: "Configuration",
          priceAdjustment: "0",
          displayOrder: 0,
          isActive: true,
        })
        .returning({ id: productVariantsTable.id });
      variantId = ins!.id;
      variantsCreated++;
    }

    // Upsert grade rows: update msrp on conflict, leave sale/cost untouched
    for (const gp of gradePrices) {
      await db
        .insert(variantGradePricesTable)
        .values({
          variantId,
          grade: gp.grade,
          msrp: gp.msrp,
          salePrice: null,
          cost: null,
        })
        .onConflictDoUpdate({
          target: [variantGradePricesTable.variantId, variantGradePricesTable.grade],
          set: { msrp: gp.msrp },
        });
      gradeRowsUpserted++;
      if (gp.grade === FRAME_ONLY_GRADE) frameRows++;
    }
  }

  console.log("\n== Summary ==");
  console.log(`  variants created:      ${variantsCreated}`);
  console.log(`  variants pre-existing: ${variantsExisting}`);
  console.log(`  grade rows upserted:   ${gradeRowsUpserted}`);
  console.log(`  frame-only rows:       ${frameRows}`);
  console.log(`  skipped (not in DB):   ${skipped.length} ${JSON.stringify(skipped)}`);

  // Verification
  const verify = await db
    .select({ variantId: variantGradePricesTable.variantId })
    .from(variantGradePricesTable)
    .where(
      inArray(
        variantGradePricesTable.variantId,
        (
          await db
            .select({ id: productVariantsTable.id })
            .from(productVariantsTable)
            .innerJoin(productsTable, eq(productsTable.id, productVariantsTable.productId))
            .where(eq(productsTable.manufacturerId, OW_LEE_MANUFACTURER_ID))
        ).map((r) => r.id),
      ),
    );
  console.log(`\nOW Lee grade-price rows in DB now: ${verify.length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
