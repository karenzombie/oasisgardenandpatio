import { asc, eq } from "drizzle-orm";
import {
  db,
  shippingRulesTable,
  shippingRuleProductsTable,
  shippingWeightTiersTable,
} from "@workspace/db";

/**
 * Shipping rate engine — the SINGLE SOURCE OF TRUTH for shipping on external
 * customer online orders. There is no settings-driven / hardcoded shipping
 * anymore; everything flows from the staff-managed Shipping section.
 *
 * Matching rules STACK: a line item's shipping is the SUM of every active rule
 * that matches it (site-wide + category + manufacturer + product). On top of
 * that, the by-weight tier (Area E) that matches the TOTAL order weight is
 * added once per order.
 *
 *  - flat rate: dollars per unit, multiplied by the line quantity.
 *  - percentage rate: percent of the line total (unitPrice × quantity).
 *
 * Shipping is never taxed (see computeTax in checkoutPricing.ts).
 */

export type ShippingScope =
  | "site_wide"
  | "category"
  | "manufacturer"
  | "product";
export type ShippingRateType = "flat" | "percentage";

export interface LoadedShippingRule {
  id: number;
  scope: ShippingScope;
  rateType: ShippingRateType;
  rateValueDollars: number;
  categoryId: number | null;
  subCategory: string | null;
  manufacturerId: number | null;
  productIds: Set<number>;
}

export interface LoadedWeightTier {
  minWeight: number;
  maxWeight: number | null;
  amountDollars: number;
}

export interface ShippingConfig {
  rules: LoadedShippingRule[];
  weightTiers: LoadedWeightTier[];
}

/** Load all ACTIVE shipping rules (with their product sets) plus weight tiers. */
export async function loadShippingConfig(): Promise<ShippingConfig> {
  const [ruleRows, productRows, tierRows] = await Promise.all([
    db
      .select()
      .from(shippingRulesTable)
      .where(eq(shippingRulesTable.isActive, true)),
    db.select().from(shippingRuleProductsTable),
    db
      .select()
      .from(shippingWeightTiersTable)
      .orderBy(asc(shippingWeightTiersTable.displayOrder)),
  ]);

  const productsByRule = new Map<number, Set<number>>();
  for (const p of productRows) {
    const set = productsByRule.get(p.ruleId) ?? new Set<number>();
    set.add(p.productId);
    productsByRule.set(p.ruleId, set);
  }

  const rules: LoadedShippingRule[] = ruleRows.map((r) => ({
    id: r.id,
    scope: r.scope as ShippingScope,
    rateType: r.rateType as ShippingRateType,
    rateValueDollars: Number(r.rateValue) || 0,
    categoryId: r.categoryId,
    subCategory: r.subCategory,
    manufacturerId: r.manufacturerId,
    productIds: productsByRule.get(r.id) ?? new Set<number>(),
  }));

  const weightTiers: LoadedWeightTier[] = tierRows.map((t) => ({
    minWeight: t.minWeight,
    maxWeight: t.maxWeight,
    amountDollars: Number(t.amount) || 0,
  }));

  return { rules, weightTiers };
}

export interface ShippableRuleLine {
  /** Stable identifier (cart item id or order line index) for per-line output. */
  key: string | number;
  productId: number;
  categoryId: number | null;
  subCategory: string | null;
  manufacturerId: number | null;
  /** Per-unit price in cents (excludes add-ons). */
  unitPriceCents: number;
  quantity: number;
  /** Per-unit weight in pounds; null/invalid is treated as 0. */
  weightLbs: number | null | undefined;
}

export interface ShippingResult {
  /** Total shipping in cents = sum of per-line + weight tier. */
  totalCents: number;
  /** The order-level by-weight tier component, in cents. */
  weightCents: number;
  /** Total billable order weight used to pick the tier. */
  totalWeightLbs: number;
  /** Per-line shipping in cents, keyed by ShippableRuleLine.key. */
  perLineCents: Map<string | number, number>;
}

export interface MatchableProduct {
  productId: number;
  categoryId: number | null;
  subCategory: string | null;
  manufacturerId: number | null;
}

/** True when a rule applies to a given product (used by the engine and overlap detection). */
export function productMatchesRule(
  rule: LoadedShippingRule,
  p: MatchableProduct,
): boolean {
  switch (rule.scope) {
    case "site_wide":
      return true;
    case "category":
      return (
        p.categoryId != null &&
        rule.categoryId === p.categoryId &&
        (rule.subCategory == null || rule.subCategory === p.subCategory)
      );
    case "manufacturer":
      return (
        p.manufacturerId != null && rule.manufacturerId === p.manufacturerId
      );
    case "product":
      return rule.productIds.has(p.productId);
    default:
      return false;
  }
}

function normWeight(w: number | null | undefined): number {
  const n = Number(w);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function pickWeightTier(
  totalWeight: number,
  tiers: LoadedWeightTier[],
): LoadedWeightTier | null {
  for (const t of tiers) {
    if (totalWeight >= t.minWeight && (t.maxWeight == null || totalWeight <= t.maxWeight)) {
      return t;
    }
  }
  return null;
}

/**
 * Compute shipping for a set of lines. Stacks all matching rules per line, then
 * adds the matching by-weight tier once for the whole order.
 */
export function computeShippingForLines(
  config: ShippingConfig,
  lines: ShippableRuleLine[],
): ShippingResult {
  const perLineCents = new Map<string | number, number>();
  let lineTotalCents = 0;

  for (const line of lines) {
    const qty = Math.max(0, line.quantity);
    let cents = 0;
    for (const rule of config.rules) {
      if (!productMatchesRule(rule, line)) continue;
      if (rule.rateType === "flat") {
        cents += Math.round(rule.rateValueDollars * 100) * qty;
      } else {
        cents += Math.round(
          (rule.rateValueDollars / 100) * line.unitPriceCents * qty,
        );
      }
    }
    perLineCents.set(line.key, cents);
    lineTotalCents += cents;
  }

  let totalWeightLbs = 0;
  for (const line of lines) {
    totalWeightLbs += normWeight(line.weightLbs) * Math.max(0, line.quantity);
  }
  const tier = pickWeightTier(totalWeightLbs, config.weightTiers);
  const weightCents = tier ? Math.round(tier.amountDollars * 100) : 0;

  return {
    totalCents: lineTotalCents + weightCents,
    weightCents,
    totalWeightLbs,
    perLineCents,
  };
}
