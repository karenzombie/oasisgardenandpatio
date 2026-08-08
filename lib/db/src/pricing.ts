/**
 * Product pricing helpers.
 *
 * The DB always stores a concrete `price` (the number actually used at
 * checkout / shown to customers). `pricing_mode` is metadata describing how
 * that price was derived. These helpers compute the *suggested* price from
 * inputs so admin tools / importers / vendor-rate updates can keep `price`
 * in sync. They do NOT mutate the DB.
 *
 * All numeric fields are passed as strings (numeric(p,s) columns) and
 * results are returned as 2-decimal strings to round-trip safely.
 *
 * This file also exports resolveLineCost and resolveAddonCost — async
 * helpers that look up the correct per-unit cost for an order line or
 * add-on line from the DB. They are the single shared resolution path used
 * by every order-creation route so cost is never computed differently
 * between paths.
 */

import { and, eq } from "drizzle-orm";
import { type PgDatabase } from "drizzle-orm/pg-core";
import { type NodePgQueryResultHKT } from "drizzle-orm/node-postgres";
import * as schema from "./schema";
import {
  productsTable,
  productVariantsTable,
  variantGradePricesTable,
  productAddonOptionsTable,
  productAddonGradePricesTable,
} from "./schema";

// Covers both NodePgDatabase (the main db instance) and PgTransaction
// (from db.transaction()), which both extend PgDatabase.
type DbOrTx = PgDatabase<NodePgQueryResultHKT, typeof schema>;

export type PricingMode =
  | "fixed"
  | "cost_plus_markup"
  | "msrp_minus_dealer_rate";

export interface PricingInputs {
  pricingMode: PricingMode;
  /** Currently authored sell price; returned as-is for `fixed`. */
  price: string | null;
  cost: string | null;
  msrp: string | null;
  /** % markup over cost, e.g. "80.00" → cost * 1.80 */
  markupPercent: string | null;
  /** Manufacturer's default dealer discount %. e.g. "50.00" → msrp * 0.50 */
  dealerRate: string | null;
}

function toNum(s: string | null | undefined): number | null {
  if (s == null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function fmt(n: number): string {
  // numeric(10,2) — round half-away-from-zero to 2 decimals.
  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * Compute the suggested sell price from the supplied pricing inputs.
 * Returns null when inputs are insufficient for the chosen mode.
 *
 * - `fixed`: returns `price` unchanged.
 * - `cost_plus_markup`: requires `cost` + `markupPercent`.
 *     suggested = cost * (1 + markupPercent/100)
 * - `msrp_minus_dealer_rate`: requires `msrp` + `dealerRate`.
 *     suggested = msrp * (1 - dealerRate/100)
 */
export function computeSuggestedPrice(inputs: PricingInputs): string | null {
  switch (inputs.pricingMode) {
    case "fixed":
      return inputs.price;
    case "cost_plus_markup": {
      const cost = toNum(inputs.cost);
      const markup = toNum(inputs.markupPercent);
      if (cost == null || markup == null) return null;
      return fmt(cost * (1 + markup / 100));
    }
    case "msrp_minus_dealer_rate": {
      const msrp = toNum(inputs.msrp);
      const rate = toNum(inputs.dealerRate);
      if (msrp == null || rate == null) return null;
      return fmt(msrp * (1 - rate / 100));
    }
  }
}

// ---------------------------------------------------------------------------
// Cost resolvers (async, DB-backed)
// ---------------------------------------------------------------------------

/**
 * Resolve the per-unit cost for an order_items line.
 *
 * Resolution priority:
 * 1. Grade-priced variant (`variantId` + `grade` both provided): look up
 *    `variant_grade_prices` by (variantId, grade) and return the row's
 *    `cost`. Returns null if no matching row exists or if the row's cost is
 *    null.
 * 2. Absolute / size-priced variant (`variantId` set, no `grade`): return
 *    `product_variants.cost`.
 * 3. Flat product (no `variantId`): return `products.cost`.
 * 4. Anything else → null. Never returns 0, never fabricates a value.
 *
 * The `grade` parameter must carry the SAME key the product stores in
 * `variant_grade_prices.grade`:
 *   - Fabric-graded products: the fabric grade label (e.g. "A", "B", "C").
 *   - Finish-graded products (tile / frame): `String(finishId)`.
 *
 * Pass either the main `db` instance or a transaction (`tx`) — both
 * satisfy `DbOrTx`.
 */
export async function resolveLineCost(
  db: DbOrTx,
  params: {
    productId: number;
    variantId: number | null;
    grade: string | null;
  },
): Promise<string | null> {
  const { productId, variantId, grade } = params;

  // Case 1: grade-priced variant
  if (variantId != null && grade != null) {
    const [row] = await db
      .select({ cost: variantGradePricesTable.cost })
      .from(variantGradePricesTable)
      .where(
        and(
          eq(variantGradePricesTable.variantId, variantId),
          eq(variantGradePricesTable.grade, grade),
        ),
      )
      .limit(1);
    return row?.cost ?? null;
  }

  // Case 2: absolute / size-priced variant — use variant.cost when it is
  // explicitly set. Legacy variants (base + price_adjustment) carry no own
  // cost and inherit from the product, so fall through to Case 3 when
  // variant.cost is null.
  if (variantId != null) {
    const [vrow] = await db
      .select({ cost: productVariantsTable.cost })
      .from(productVariantsTable)
      .where(eq(productVariantsTable.id, variantId))
      .limit(1);
    if (vrow?.cost != null) return vrow.cost;
    // Fall through: variant.cost is null → inherit from product.
  }

  // Case 3: flat product (also the fallthrough target for Case 2 when
  // variant.cost is null).
  const [prow] = await db
    .select({ cost: productsTable.cost })
    .from(productsTable)
    .where(eq(productsTable.id, productId))
    .limit(1);
  return prow?.cost ?? null;
}

/**
 * Resolve the per-unit cost for an order_item_addons line.
 *
 * - `per_grade` add-on: look up `product_addon_grade_prices` by
 *   (addonOptionId, grade) → return `cost`. Returns null when grade is
 *   null, no row matches, or the row's cost is null.
 * - `flat` add-on: return `product_addon_options.flat_cost`.
 * - Anything else → null. Never returns 0, never fabricates a value.
 *
 * Pass either the main `db` instance or a transaction (`tx`).
 */
export async function resolveAddonCost(
  db: DbOrTx,
  params: {
    addonOptionId: number;
    pricingMode: "flat" | "per_grade";
    grade: string | null;
  },
): Promise<string | null> {
  const { addonOptionId, pricingMode, grade } = params;

  if (pricingMode === "per_grade") {
    if (grade == null) return null;
    const [row] = await db
      .select({ cost: productAddonGradePricesTable.cost })
      .from(productAddonGradePricesTable)
      .where(
        and(
          eq(productAddonGradePricesTable.addonOptionId, addonOptionId),
          eq(productAddonGradePricesTable.grade, grade),
        ),
      )
      .limit(1);
    return row?.cost ?? null;
  }

  // flat
  const [row] = await db
    .select({ cost: productAddonOptionsTable.flatCost })
    .from(productAddonOptionsTable)
    .where(eq(productAddonOptionsTable.id, addonOptionId))
    .limit(1);
  return row?.cost ?? null;
}
