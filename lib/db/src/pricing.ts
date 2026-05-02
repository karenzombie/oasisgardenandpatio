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
 */

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
