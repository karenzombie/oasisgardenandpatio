/**
 * Re-load Treasure Garden (mfr 12) umbrella pricing using the existing grade
 * engine (variant_grade_prices). Source of truth is the revised pricing CSV.
 *
 * Each TG umbrella is configured by Finish × Wind Vent × Fabric grade:
 *   - One product_variant per (finish code, wind vent) combination.
 *   - Per-grade prices (Awning / A / C) live in variant_grade_prices; grades the
 *     CSV marks "n/a" are skipped (the PDP/cart hide fabrics of that grade).
 *
 * Variant convention (owned by this loader):
 *   - vented:     variant_sku = `{base}-{code}-{SWV|DWV}`
 *                 variant_name = `{FinishName} ({SWV|DWV})`
 *   - non-vented: variant_sku = `{base}-{code}`
 *                 variant_name = `{FinishName}`
 * Order/PO SKU = variant_sku minus the `-(SWV|DWV)$` suffix = `{base}-{code}`.
 * The vent acronym rides along in variant_name so it prints on the vendor PO.
 *
 * Also ensures the "Hardwood" (1H) finish exists, attaches TG's own fabrics, and
 * clears any discrete product_finish_options (the PDP enters finish-in-variant
 * mode only when a grade-priced product has zero discrete finishes).
 *
 * Idempotent: variants are upserted by variant_sku, stale umbrella variants are
 * deactivated (history-safe), grade prices are fully replaced, and fabric
 * attachments are inserted with onConflictDoNothing.
 *
 * Run:   pnpm --filter @workspace/scripts exec tsx src/loadTgUmbrellaPricing.ts
 * Prod:  DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/loadTgUmbrellaPricing.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  productsTable,
  productVariantsTable,
  variantGradePricesTable,
  productFinishOptionsTable,
  productFabricOptionsTable,
  fabricsTable,
  finishesTable,
} from "@workspace/db";

const MFR_ID = 12;
const CATEGORY_UMBRELLAS = 38;
const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const CSV_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/tg_umbrella_pricing_msrp_and_sale_revised_6-11-2026_1781217119297.csv",
);
const HARDWOOD_SWATCH = "/finish-swatches/finish-1H.jpg";

// Maps a CSV grade column pair to the grade string stored in
// variant_grade_prices. These MUST match fabrics.grade exactly so the PDP/cart
// can resolve the line price from the selected fabric's grade.
const GRADE_COLUMNS: { grade: string; msrpCol: string; saleCol: string }[] = [
  { grade: "Awning", msrpCol: "msrp_grade_awning", saleCol: "sale_grade_awning" },
  { grade: "A", msrpCol: "msrp_grade_a", saleCol: "sale_grade_a" },
  { grade: "C", msrpCol: "msrp_grade_c", saleCol: "sale_grade_c" },
];

type CsvRow = Record<string, string>;

type GradePrice = { grade: string; msrp: string; salePrice: string };
type Desired = {
  variantSku: string;
  variantName: string;
  optionLabel: string;
  finishCode: string;
  vent: string | null;
  gradePrices: GradePrice[];
};

function naClean(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  if (t === "" || t.toLowerCase() === "n/a") return null;
  return t;
}

async function ensureHardwood(): Promise<void> {
  const [existing] = await db
    .select({ id: finishesTable.id })
    .from(finishesTable)
    .where(
      and(
        eq(finishesTable.manufacturerId, MFR_ID),
        eq(finishesTable.itemNumber, "1H"),
      ),
    )
    .limit(1);
  if (existing) {
    await db
      .update(finishesTable)
      .set({ name: "Hardwood", imageUrl: HARDWOOD_SWATCH, isActive: true })
      .where(eq(finishesTable.id, existing.id));
    console.log("= finish 1H (Hardwood) updated.");
  } else {
    await db.insert(finishesTable).values({
      manufacturerId: MFR_ID,
      itemNumber: "1H",
      name: "Hardwood",
      imageUrl: HARDWOOD_SWATCH,
      isActive: true,
      displayOrder: 45,
    });
    console.log("+ finish 1H (Hardwood) inserted.");
  }
}

async function main(): Promise<void> {
  await ensureHardwood();

  // Finish code -> { name, displayOrder } (source of truth = catalog).
  const finRows = await db
    .select({
      code: finishesTable.itemNumber,
      name: finishesTable.name,
      displayOrder: finishesTable.displayOrder,
    })
    .from(finishesTable)
    .where(eq(finishesTable.manufacturerId, MFR_ID));
  const finishByCode = new Map(
    finRows.filter((r) => r.code).map((r) => [r.code!, r]),
  );

  // All TG umbrella products, keyed for base-sku resolution.
  const prods = await db
    .select({ id: productsTable.id, sku: productsTable.sku })
    .from(productsTable)
    .where(
      and(
        eq(productsTable.manufacturerId, MFR_ID),
        eq(productsTable.categoryId, CATEGORY_UMBRELLAS),
      ),
    );
  const bySku = new Map(prods.map((p) => [p.sku, p]));
  const resolveProduct = (base: string) => {
    const exact = bySku.get(base);
    if (exact) return exact;
    // Single-finish models store the finish in the product sku (USA45-09,
    // UM809-1H); match on the `{base}-` prefix.
    return prods.find((p) => p.sku.startsWith(base + "-")) ?? null;
  };

  // TG's own active fabrics (attached to every umbrella for grade filtering).
  const tgFabrics = await db
    .select({ id: fabricsTable.id })
    .from(fabricsTable)
    .where(
      and(eq(fabricsTable.manufacturerId, MFR_ID), eq(fabricsTable.isActive, true)),
    )
    .orderBy(fabricsTable.name);

  // Parse CSV and group desired variants by product base sku.
  const raw = readFileSync(CSV_PATH, "utf8");
  const parsed = Papa.parse<CsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors.length) {
    console.warn("CSV parse warnings:", parsed.errors.slice(0, 3));
  }

  const byBase = new Map<string, Map<string, Desired>>();
  for (const row of parsed.data) {
    const base = (row.sku ?? "").trim().replace(/-_$/, "");
    if (!base) continue;
    const finishCodes = (row.finish_group ?? "")
      .split("|")
      .map((s) => s.trim())
      .filter(Boolean);
    const vent = naClean(row.canopy_option); // "SWV" | "DWV" | null

    const gradePrices: GradePrice[] = [];
    for (const gc of GRADE_COLUMNS) {
      const msrp = naClean(row[gc.msrpCol]);
      const salePrice = naClean(row[gc.saleCol]);
      if (msrp == null || salePrice == null) continue;
      gradePrices.push({ grade: gc.grade, msrp, salePrice });
    }
    if (gradePrices.length === 0) {
      console.warn(`! ${base}: row has no priced grades — skipped.`);
      continue;
    }

    let variants = byBase.get(base);
    if (!variants) {
      variants = new Map();
      byBase.set(base, variants);
    }
    for (const code of finishCodes) {
      const fin = finishByCode.get(code);
      if (!fin) {
        throw new Error(
          `Finish code "${code}" (product ${base}) not found in TG finish catalog.`,
        );
      }
      const variantSku = vent ? `${base}-${code}-${vent}` : `${base}-${code}`;
      const variantName = vent ? `${fin.name} (${vent})` : fin.name;
      variants.set(variantSku, {
        variantSku,
        variantName,
        optionLabel: vent ? "Finish & Wind Vent" : "Frame Finish",
        finishCode: code,
        vent,
        gradePrices,
      });
    }
  }

  let productsUpdated = 0;
  let variantsUpserted = 0;
  let variantsDeactivated = 0;

  for (const [base, desiredMap] of byBase) {
    const product = resolveProduct(base);
    if (!product) {
      console.warn(`! ${base}: no TG umbrella product found — skipped.`);
      continue;
    }

    // Deterministic ordering: by finish catalog order, then SWV before DWV.
    const ventOrder = (v: string | null) => (v === "DWV" ? 1 : 0);
    const desired = [...desiredMap.values()].sort((a, b) => {
      const da = finishByCode.get(a.finishCode)?.displayOrder ?? 0;
      const db_ = finishByCode.get(b.finishCode)?.displayOrder ?? 0;
      return da - db_ || ventOrder(a.vent) - ventOrder(b.vent);
    });

    const existing = await db
      .select({ id: productVariantsTable.id, sku: productVariantsTable.variantSku })
      .from(productVariantsTable)
      .where(eq(productVariantsTable.productId, product.id));
    const existingBySku = new Map(existing.map((e) => [e.sku, e]));
    const desiredSkus = new Set(desired.map((d) => d.variantSku));

    for (let i = 0; i < desired.length; i++) {
      const d = desired[i];
      const displayOrder = i * 10;
      let variantId: number;
      const ex = existingBySku.get(d.variantSku);
      if (ex) {
        await db
          .update(productVariantsTable)
          .set({
            variantName: d.variantName,
            optionLabel: d.optionLabel,
            displayOrder,
            isActive: true,
            priceAdjustment: "0",
            msrp: null,
            salePrice: null,
          })
          .where(eq(productVariantsTable.id, ex.id));
        variantId = ex.id;
      } else {
        const [ins] = await db
          .insert(productVariantsTable)
          .values({
            productId: product.id,
            variantSku: d.variantSku,
            variantName: d.variantName,
            optionLabel: d.optionLabel,
            displayOrder,
            isActive: true,
            priceAdjustment: "0",
          })
          .returning({ id: productVariantsTable.id });
        variantId = ins.id;
      }
      variantsUpserted++;

      // Fully replace grade prices for this variant.
      await db
        .delete(variantGradePricesTable)
        .where(eq(variantGradePricesTable.variantId, variantId));
      await db.insert(variantGradePricesTable).values(
        d.gradePrices.map((gp) => ({
          variantId,
          grade: gp.grade,
          msrp: gp.msrp,
          salePrice: gp.salePrice,
        })),
      );
    }

    // Deactivate stale variants (history-safe: never deleted). Drop their grade
    // prices so they can't leak into pricing.
    const stale = existing.filter((e) => !desiredSkus.has(e.sku));
    if (stale.length) {
      const staleIds = stale.map((e) => e.id);
      await db
        .delete(variantGradePricesTable)
        .where(inArray(variantGradePricesTable.variantId, staleIds));
      await db
        .update(productVariantsTable)
        .set({ isActive: false })
        .where(inArray(productVariantsTable.id, staleIds));
      variantsDeactivated += staleIds.length;
    }

    // Clear discrete finishes — the PDP enters finish-in-variant mode only when
    // a grade-priced product has zero discrete product_finish_options.
    await db
      .delete(productFinishOptionsTable)
      .where(eq(productFinishOptionsTable.productId, product.id));

    // Replace fabric options: delete stale links, then insert the full correct
    // set. Insert-only accumulates old Sunbrella links across runs.
    await db
      .delete(productFabricOptionsTable)
      .where(eq(productFabricOptionsTable.productId, product.id));
    if (tgFabrics.length) {
      await db
        .insert(productFabricOptionsTable)
        .values(
          tgFabrics.map((f, k) => ({
            productId: product.id,
            fabricId: f.id,
            displayOrder: k,
          })),
        )
        .onConflictDoNothing();
    }

    // Product-level price = lowest configured line (drives buy-gate + the
    // storefront "from" price). Real prices come from variant_grade_prices.
    const allMsrp = desired.flatMap((d) => d.gradePrices.map((g) => Number(g.msrp)));
    const allSale = desired.flatMap((d) =>
      d.gradePrices.map((g) => Number(g.salePrice)),
    );
    const minMsrp = Math.min(...allMsrp);
    const minSale = Math.min(...allSale);
    await db
      .update(productsTable)
      .set({
        price: String(minMsrp),
        msrp: String(minMsrp),
        salePrice: String(minSale),
        quoteOnly: false,
        availableOnline: true,
        showPriceOnline: true,
      })
      .where(eq(productsTable.id, product.id));
    productsUpdated++;
  }

  console.log(
    `TG umbrella pricing loaded: products=${productsUpdated} ` +
      `variants_upserted=${variantsUpserted} variants_deactivated=${variantsDeactivated}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
