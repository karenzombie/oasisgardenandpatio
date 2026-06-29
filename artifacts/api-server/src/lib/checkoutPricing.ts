import { inArray } from "drizzle-orm";
import { db, systemSettingsTable, SETTING_KEYS } from "@workspace/db";
import { lookupCaTaxRate, type CaTaxJurisdiction } from "./caTaxRates";

export interface PricingSettings {
  defaultTaxRate: number;
}

const DEFAULTS: PricingSettings = {
  defaultTaxRate: 0.0975,
};

const KEYS_TO_LOAD = [SETTING_KEYS.defaultTaxRate];

function asNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function loadPricingSettings(): Promise<PricingSettings> {
  const rows = await db
    .select({ key: systemSettingsTable.key, value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(inArray(systemSettingsTable.key, KEYS_TO_LOAD));
  const found = new Map<string, unknown>();
  for (const r of rows) found.set(r.key, r.value);

  return {
    defaultTaxRate: asNumber(
      found.get(SETTING_KEYS.defaultTaxRate),
      DEFAULTS.defaultTaxRate,
    ),
  };
}

function roundCents(cents: number): number {
  return Math.round(cents);
}

export interface TaxComputation {
  cents: number;
  rate: number;
  jurisdiction: string;
}

/**
 * Compute jurisdictional sales tax. The store has nexus only in California,
 * so any other shipping destination is exempt. For CA, we look up the
 * combined state + local rate by ZIP3 prefix; if the ZIP isn't in our table
 * we fall back to CA's 7.25% statewide base. The taxable base is merchandise
 * subtotal — shipping is not taxed (matches CA's general rule for separately
 * stated delivery charges).
 */
export function computeTax(
  subtotalCents: number,
  state: string | null,
  zip: string | null,
  settings: PricingSettings,
): TaxComputation {
  const code = state ? state.trim().toUpperCase() : "";
  if (code !== "CA") {
    return { cents: 0, rate: 0, jurisdiction: "Outside nexus" };
  }
  const j: CaTaxJurisdiction = lookupCaTaxRate(zip);
  // Use the admin-configured rate when no specific jurisdiction matches and
  // the operator has set a custom default; otherwise honor the looked-up
  // jurisdiction rate.
  const rate =
    j.label === "California (statewide base)" && settings.defaultTaxRate > 0
      ? settings.defaultTaxRate
      : j.rate;
  return {
    cents: roundCents(subtotalCents * rate),
    rate,
    jurisdiction: j.label,
  };
}
