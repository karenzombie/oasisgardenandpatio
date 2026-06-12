/**
 * Re-load Galtech (mfr 29) umbrella pricing using the existing grade engine
 * (variant_grade_prices), mirroring the Treasure Garden / Frankford customer
 * experience. Source of truth is the revised 2026 pricing CSV + fabrics CSV.
 *
 * Each Galtech umbrella is configured by Finish × Wind Vent × Fabric grade:
 *   - One product_variant per (frame finish, wind vent) combination.
 *   - Price depends only on (size/product, wind vent, grade) — it is NEVER
 *     finish-dependent (verified 0/320 conflicts), so every finish of a given
 *     product+vent shares the same per-grade price set.
 *   - Per-grade prices (C / B / A / BB / AA) live in variant_grade_prices; grades
 *     the CSV marks "n/a" are skipped (the PDP/cart hide fabrics of that grade).
 *
 * Variant convention (owned by this loader, mirrors Treasure Garden so the PDP's
 * Finish × Wind Vent selectors + PO vent-stripping work unchanged):
 *   - variant_sku  = `{productSku}-{finishCode}-{SWV|DWV}`
 *   - variant_name = `{FinishName} (SWV|DWV)`   (finish name from the catalog)
 *   - option_label = "Finish & Wind Vent"
 * Order/PO SKU = variant_sku minus the `-(SWV|DWV)$` suffix; the vent acronym
 * rides along in variant_name so it still prints on the vendor PO.
 *
 * Fabrics (Phase A, authoritative Galtech umbrella fabric list = fabrics CSV):
 *   - Grades A/B/C already exist as Galtech (29) fabrics (item_number =
 *     fabric_number); we set their grade + notes.
 *   - Grades AA/BB do not exist yet; we create them as Galtech (29) fabrics with
 *     the grade + notes, borrowing only the swatch image / color family / stripe
 *     flag from the matching Sunbrella (11) swatch by item_number.
 * Fabric attachment is SIZE-AWARE: a fabric is attached to a product only if the
 * fabric's `sizes_available` is blank (all sizes) or contains the product's size
 * token. Grade filtering still happens in the PDP from the selected variant.
 *
 * Idempotent: variants are upserted by variant_sku, stale umbrella variants are
 * deactivated (history-safe), grade prices are fully replaced, fabric/finish A-Z
 * grade+notes are set, and fabric attachments are reconciled (add missing /
 * remove ineligible) per product.
 *
 * Run:   pnpm --filter @workspace/scripts exec tsx src/loadGaltechUmbrellaPricing.ts
 * Prod:  DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/loadGaltechUmbrellaPricing.ts
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
  cartItemsTable,
} from "@workspace/db";

const MFR_ID = 29;
const SUNBRELLA_MFR = 11;
const CATEGORY_UMBRELLAS = 38;
const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const PRICING_CSV = resolve(
  WORKSPACE_ROOT,
  "attached_assets/galtech_umbrella_pricing_msrp_sale_revised_2026_1781225464885.csv",
);
const FABRICS_CSV = resolve(
  WORKSPACE_ROOT,
  "attached_assets/galtech_fabrics_v2_1781225466999.csv",
);

// Maps a CSV grade column pair to the grade string stored in
// variant_grade_prices. These MUST match fabrics.grade exactly so the PDP/cart
// can resolve the line price from the selected fabric's grade.
const GRADE_COLUMNS: { grade: string; msrpCol: string; saleCol: string }[] = [
  { grade: "C", msrpCol: "msrp_C_Suncrylic", saleCol: "sale_C_Suncrylic" },
  { grade: "B", msrpCol: "msrp_B_Sunbrella", saleCol: "sale_B_Sunbrella" },
  { grade: "A", msrpCol: "msrp_A_Sunbrella", saleCol: "sale_A_Sunbrella" },
  { grade: "BB", msrpCol: "msrp_BB_Sunbrella", saleCol: "sale_BB_Sunbrella" },
  { grade: "AA", msrpCol: "msrp_AA_Sunbrella", saleCol: "sale_AA_Sunbrella" },
];

type CsvRow = Record<string, string>;
type GradePrice = { grade: string; msrp: string; salePrice: string };
type Desired = {
  variantSku: string;
  variantName: string;
  finishCode: string;
  vent: "SWV" | "DWV";
  gradePrices: GradePrice[];
};

function naClean(v: string | undefined): string | null {
  const t = (v ?? "").trim();
  if (t === "" || t.toLowerCase() === "n/a") return null;
  return t;
}

function ventSuffix(ventType: string): "SWV" | "DWV" | null {
  const t = ventType.trim().toLowerCase();
  if (t.startsWith("single")) return "SWV";
  if (t.startsWith("double")) return "DWV";
  return null;
}

// "7.5'" -> "7.5", "6x6'" -> "6x6", "10x10'" -> "10x10", "13'" -> "13".
function sizeToken(size: string): string {
  return size.trim().replace(/'+$/, "").trim();
}

// ---------------------------------------------------------------------------
// Phase A — sync the Galtech umbrella fabric list from the fabrics CSV.
// ---------------------------------------------------------------------------
type FabricCsvRow = {
  itemNumber: string;
  grade: string;
  sizes: string[] | "all";
};

async function syncFabrics(): Promise<Map<string, FabricCsvRow>> {
  const raw = readFileSync(FABRICS_CSV, "utf8");
  const parsed = Papa.parse<CsvRow>(raw, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    console.warn("Fabrics CSV parse warnings:", parsed.errors.slice(0, 3));
  }

  // Sunbrella swatch source (for the new AA/BB grades) keyed by item_number.
  const sunRows = await db
    .select({
      itemNumber: fabricsTable.itemNumber,
      swatchImageUrl: fabricsTable.swatchImageUrl,
      colorFamily: fabricsTable.colorFamily,
      isStripe: fabricsTable.isStripe,
    })
    .from(fabricsTable)
    .where(eq(fabricsTable.manufacturerId, SUNBRELLA_MFR));
  const sunByItem = new Map(sunRows.map((r) => [r.itemNumber, r]));

  // Existing Galtech fabrics keyed by item_number (A/B/C update + AA/BB upsert).
  const galRows = await db
    .select({ id: fabricsTable.id, itemNumber: fabricsTable.itemNumber })
    .from(fabricsTable)
    .where(eq(fabricsTable.manufacturerId, MFR_ID));
  const galByItem = new Map(galRows.map((r) => [r.itemNumber, r.id]));

  const csvByItem = new Map<string, FabricCsvRow>();
  let updated = 0;
  let created = 0;
  let skipped = 0;
  let displayOrder = 1000;

  for (const row of parsed.data) {
    const itemNumber = (row.fabric_number ?? "").trim();
    const grade = (row.grade ?? "").trim();
    if (!itemNumber || !grade) continue;
    const name = (row.fabric_name ?? "").trim();
    const notes = (row.notes ?? "").trim() || null;
    const sizesRaw = (row.sizes_available ?? "").trim();
    const sizes: string[] | "all" = sizesRaw
      ? sizesRaw.split("|").map((s) => s.trim()).filter(Boolean)
      : "all";

    const existingId = galByItem.get(itemNumber);
    const isNewGrade = grade === "AA" || grade === "BB";
    if (existingId) {
      // Existing Galtech fabric (A/B/C, or a re-run of AA/BB): set grade + notes.
      await db
        .update(fabricsTable)
        .set({ grade, notes, isActive: true })
        .where(eq(fabricsTable.id, existingId));
      updated++;
    } else if (isNewGrade) {
      // New AA/BB grade — borrow swatch/color/stripe from Sunbrella by item #.
      // Skip (do not create) when there is no Sunbrella swatch source: a
      // swatchless fabric is unusable on the PDP and violates the contract that
      // every AA/BB row is sourced from a real Sunbrella swatch.
      const sun = sunByItem.get(itemNumber);
      if (!sun) {
        console.warn(
          `! fabric ${itemNumber} (${grade}) has no Sunbrella swatch source — skipped (not created).`,
        );
        skipped++;
        continue;
      }
      const [ins] = await db
        .insert(fabricsTable)
        .values({
          manufacturerId: MFR_ID,
          itemNumber,
          name,
          grade,
          notes,
          colorFamily: sun.colorFamily ?? null,
          isStripe: sun.isStripe ?? false,
          swatchImageUrl: sun.swatchImageUrl ?? null,
          isActive: true,
          displayOrder: displayOrder++,
        })
        .returning({ id: fabricsTable.id });
      galByItem.set(itemNumber, ins.id);
      created++;
    } else {
      // A/B/C are supposed to already exist as Galtech fabrics (confirmed rule:
      // A/B/C use ONLY existing fabrics). A missing one has no swatch source, so
      // skip it rather than create a broken, swatchless row.
      console.warn(
        `! fabric ${itemNumber} (${grade}) not found among existing Galtech fabrics — skipped (no swatch source).`,
      );
      skipped++;
      continue;
    }
    csvByItem.set(itemNumber, { itemNumber, grade, sizes });
  }

  console.log(
    `Galtech fabrics synced: updated=${updated} created=${created} skipped=${skipped} (attachable=${csvByItem.size})`,
  );
  return csvByItem;
}

async function main(): Promise<void> {
  const fabricCsvByItem = await syncFabrics();

  // Finish code -> { name, displayOrder } (source of truth = catalog). The
  // variant name uses the catalog finish name so the API's name-based swatch
  // lookup resolves (the CSV finish_name can drift, e.g. "Ribbed Champagne").
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

  // All Galtech umbrella products, keyed for base-sku resolution.
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
  const resolveProduct = (item: string, finishCode: string) => {
    // 1. Exact item_number is the product sku (teak 532TK, wood 121).
    const exact = bySku.get(item);
    if (exact) return exact;
    // 2. item_number minus the finish-code suffix (aluminum 727AB -> 727).
    const base = item.endsWith(finishCode)
      ? item.slice(0, item.length - finishCode.length)
      : item;
    const baseHit = bySku.get(base);
    if (baseHit) return baseHit;
    // 3. Dark-wood convention: DW item = Light-wood item + 100 (221 -> 121,
    //    232 -> 132). Dark wood is a selectable finish on the light-wood product.
    if (finishCode === "DW" && /^\d+$/.test(item)) {
      const lw = String(Number(item) - 100);
      const lwHit = bySku.get(lw);
      if (lwHit) return lwHit;
    }
    return null;
  };

  // Galtech fabrics (id + grade + sizes) that are in the authoritative CSV list.
  const galFabricRows = await db
    .select({
      id: fabricsTable.id,
      itemNumber: fabricsTable.itemNumber,
      name: fabricsTable.name,
    })
    .from(fabricsTable)
    .where(
      and(eq(fabricsTable.manufacturerId, MFR_ID), eq(fabricsTable.isActive, true)),
    )
    .orderBy(fabricsTable.displayOrder, fabricsTable.name);
  const attachableFabrics = galFabricRows
    .map((f) => ({ ...f, csv: fabricCsvByItem.get(f.itemNumber) }))
    .filter((f) => f.csv != null) as {
    id: number;
    itemNumber: string;
    name: string;
    csv: FabricCsvRow;
  }[];

  // Parse pricing CSV → desired variants grouped by product id, plus the product
  // size token (all rows of a product share one size).
  const raw = readFileSync(PRICING_CSV, "utf8");
  const parsed = Papa.parse<CsvRow>(raw, { header: true, skipEmptyLines: true });
  if (parsed.errors.length) {
    console.warn("Pricing CSV parse warnings:", parsed.errors.slice(0, 3));
  }

  const byProduct = new Map<
    number,
    { product: { id: number; sku: string }; sizeToken: string; variants: Map<string, Desired> }
  >();

  for (const row of parsed.data) {
    const item = (row.item_number ?? "").trim();
    const finishCode = (row.finish_code ?? "").trim();
    if (!item || !finishCode) continue;
    const vent = ventSuffix(row.vent_type ?? "");
    if (!vent) {
      console.warn(`! ${item}: unrecognized vent_type "${row.vent_type}" — skipped.`);
      continue;
    }
    const product = resolveProduct(item, finishCode);
    if (!product) {
      console.warn(`! ${item}/${finishCode}: no Galtech umbrella product found — skipped.`);
      continue;
    }
    const fin = finishByCode.get(finishCode);
    if (!fin) {
      throw new Error(
        `Finish code "${finishCode}" (item ${item}) not found in Galtech finish catalog.`,
      );
    }

    const gradePrices: GradePrice[] = [];
    for (const gc of GRADE_COLUMNS) {
      const msrp = naClean(row[gc.msrpCol]);
      const salePrice = naClean(row[gc.saleCol]);
      if (msrp == null || salePrice == null) continue;
      gradePrices.push({ grade: gc.grade, msrp, salePrice });
    }
    if (gradePrices.length === 0) {
      console.warn(`! ${item}/${finishCode} (${vent}): no priced grades — skipped.`);
      continue;
    }

    let entry = byProduct.get(product.id);
    if (!entry) {
      entry = { product, sizeToken: sizeToken(row.size ?? ""), variants: new Map() };
      byProduct.set(product.id, entry);
    }
    const variantSku = `${product.sku}-${finishCode}-${vent}`;
    entry.variants.set(variantSku, {
      variantSku,
      variantName: `${fin.name} (${vent})`,
      finishCode,
      vent,
      gradePrices,
    });
  }

  let productsUpdated = 0;
  let variantsUpserted = 0;
  let variantsDeactivated = 0;
  let fabricsAttached = 0;
  let fabricsDetached = 0;

  for (const { product, sizeToken: prodSize, variants: desiredMap } of byProduct.values()) {
    // Deterministic ordering: by finish catalog order, then SWV before DWV.
    const ventOrder = (v: "SWV" | "DWV") => (v === "DWV" ? 1 : 0);
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
            optionLabel: "Finish & Wind Vent",
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
            optionLabel: "Finish & Wind Vent",
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

    // Deactivate stale variants (history-safe). Drop their grade prices so they
    // can't leak into pricing.
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

    // Size-aware fabric attachment (reconcile add/remove; minimal churn so we
    // never needlessly touch rows). A fabric is eligible when its sizes list is
    // "all" or contains this product's size token.
    const eligible = attachableFabrics.filter(
      (f) => f.csv.sizes === "all" || f.csv.sizes.includes(prodSize),
    );
    const eligibleIds = new Set(eligible.map((f) => f.id));
    const haveRows = await db
      .select({ fabricId: productFabricOptionsTable.fabricId })
      .from(productFabricOptionsTable)
      .where(eq(productFabricOptionsTable.productId, product.id));
    const have = new Set(haveRows.map((r) => r.fabricId));

    const toDetach = [...have].filter((id) => !eligibleIds.has(id));
    if (toDetach.length) {
      // Drop any cart lines that reference a (product, fabric) pair we're about
      // to detach. The cart_items_product_fabric_fk is ON DELETE SET NULL, but
      // product_id is NOT NULL, so deleting a referenced option would otherwise
      // error. Surgical (only the affected pairs) so unrelated carts survive.
      await db
        .delete(cartItemsTable)
        .where(
          and(
            eq(cartItemsTable.productId, product.id),
            inArray(cartItemsTable.fabricId, toDetach),
          ),
        );
      await db
        .delete(productFabricOptionsTable)
        .where(
          and(
            eq(productFabricOptionsTable.productId, product.id),
            inArray(productFabricOptionsTable.fabricId, toDetach),
          ),
        );
      fabricsDetached += toDetach.length;
    }
    const toAttach = eligible.filter((f) => !have.has(f.id));
    if (toAttach.length) {
      await db
        .insert(productFabricOptionsTable)
        .values(
          toAttach.map((f, k) => ({
            productId: product.id,
            fabricId: f.id,
            displayOrder: have.size + k,
          })),
        )
        .onConflictDoNothing();
      fabricsAttached += toAttach.length;
    }

    // Product-level price = lowest configured line (drives buy-gate + the
    // storefront "from" price). Real prices come from variant_grade_prices.
    const allMsrp = desired.flatMap((d) => d.gradePrices.map((g) => Number(g.msrp)));
    const allSale = desired.flatMap((d) => d.gradePrices.map((g) => Number(g.salePrice)));
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
    `Galtech umbrella pricing loaded: products=${productsUpdated} ` +
      `variants_upserted=${variantsUpserted} variants_deactivated=${variantsDeactivated} ` +
      `fabrics_attached=${fabricsAttached} fabrics_detached=${fabricsDetached}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
