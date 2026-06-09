import { inArray } from "drizzle-orm";
import { db, systemSettingsTable, SETTING_KEYS } from "@workspace/db";
import { getShippingZone, type ShippingZone } from "./shippingZones";
import { lookupCaTaxRate, type CaTaxJurisdiction } from "./caTaxRates";

export interface ShippingTier {
  /** Inclusive upper bound, in pounds. */
  maxWeightLbs: number;
  /** Base shipping cost in cents for any weight at or below maxWeightLbs. */
  baseCents: number;
}

export interface PricingSettings {
  defaultTaxRate: number;
  shippingMode: "flat" | "flat_per_item" | "percentage" | "free";
  flatShippingRate: number;
  shippingPercentage: number;
  freeShippingThreshold: number;
  shippingTiers: ShippingTier[];
}

const DEFAULT_TIERS: ShippingTier[] = [
  { maxWeightLbs: 5, baseCents: 1500 },
  { maxWeightLbs: 20, baseCents: 3500 },
  { maxWeightLbs: 70, baseCents: 7500 },
  { maxWeightLbs: 150, baseCents: 14900 },
  { maxWeightLbs: 500, baseCents: 24900 },
  { maxWeightLbs: 1500, baseCents: 49900 },
  { maxWeightLbs: Number.POSITIVE_INFINITY, baseCents: 89900 },
];

const DEFAULTS: PricingSettings = {
  defaultTaxRate: 0.0975,
  shippingMode: "flat_per_item",
  flatShippingRate: 20,
  shippingPercentage: 0.1,
  freeShippingThreshold: 0,
  shippingTiers: DEFAULT_TIERS,
};

const KEYS_TO_LOAD = [
  SETTING_KEYS.defaultTaxRate,
  SETTING_KEYS.shippingMode,
  SETTING_KEYS.flatShippingRate,
  SETTING_KEYS.shippingPercentage,
  SETTING_KEYS.freeShippingThreshold,
  SETTING_KEYS.shippingTiers,
];

function asNumber(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function parseTiers(v: unknown): ShippingTier[] {
  if (!Array.isArray(v) || v.length === 0) return DEFAULT_TIERS;
  const tiers: ShippingTier[] = [];
  for (const raw of v) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as Record<string, unknown>;
    const w = Number(r.maxWeightLbs);
    const c = Number(r.baseCents);
    if (Number.isFinite(w) && w > 0 && Number.isFinite(c) && c >= 0) {
      tiers.push({ maxWeightLbs: w, baseCents: Math.round(c) });
    }
  }
  if (tiers.length === 0) return DEFAULT_TIERS;
  tiers.sort((a, b) => a.maxWeightLbs - b.maxWeightLbs);
  return tiers;
}

export async function loadPricingSettings(): Promise<PricingSettings> {
  const rows = await db
    .select({ key: systemSettingsTable.key, value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(inArray(systemSettingsTable.key, KEYS_TO_LOAD));
  const found = new Map<string, unknown>();
  for (const r of rows) found.set(r.key, r.value);

  const mode = found.get(SETTING_KEYS.shippingMode);
  const shippingMode: PricingSettings["shippingMode"] =
    mode === "flat" ||
    mode === "flat_per_item" ||
    mode === "percentage" ||
    mode === "free"
      ? mode
      : DEFAULTS.shippingMode;

  return {
    defaultTaxRate: asNumber(
      found.get(SETTING_KEYS.defaultTaxRate),
      DEFAULTS.defaultTaxRate,
    ),
    shippingMode,
    flatShippingRate: asNumber(
      found.get(SETTING_KEYS.flatShippingRate),
      DEFAULTS.flatShippingRate,
    ),
    shippingPercentage: asNumber(
      found.get(SETTING_KEYS.shippingPercentage),
      DEFAULTS.shippingPercentage,
    ),
    freeShippingThreshold: asNumber(
      found.get(SETTING_KEYS.freeShippingThreshold),
      DEFAULTS.freeShippingThreshold,
    ),
    shippingTiers: parseTiers(found.get(SETTING_KEYS.shippingTiers)),
  };
}

function roundCents(cents: number): number {
  return Math.round(cents);
}

export interface ShippableLine {
  /** Per-unit weight in pounds; null/undefined treated as a 5-lb default. */
  weightLbs: number | null | undefined;
  quantity: number;
}

const DEFAULT_LINE_WEIGHT_LBS = 5;

export function totalCartWeight(lines: ShippableLine[]): number {
  let total = 0;
  for (const l of lines) {
    const w =
      l.weightLbs == null || !Number.isFinite(Number(l.weightLbs))
        ? DEFAULT_LINE_WEIGHT_LBS
        : Number(l.weightLbs);
    total += w * Math.max(0, l.quantity);
  }
  return total;
}

function pickTier(weightLbs: number, tiers: ShippingTier[]): ShippingTier {
  for (const t of tiers) if (weightLbs <= t.maxWeightLbs) return t;
  return tiers[tiers.length - 1];
}

export interface ShippingComputation {
  cents: number;
  weightLbs: number;
  zone: ShippingZone;
  tierMaxWeightLbs: number | null;
  baseCents: number;
  freeShippingApplied: boolean;
}

/**
 * Compute shipping based on:
 *  - `shipToStore`: when true (vendor ships to Oasis store, not direct to customer),
 *    no customer-facing shipping fee is charged — returns $0 immediately.
 *  - `flat_per_item` mode (default): $flatShippingRate × total item quantity.
 *    This is the standard Oasis direct-ship charge applied per unit ordered.
 *  - `flat` mode: carrier-style weight × zone rate plus optional handling surcharge.
 *  - `percentage` mode: X% of merchandise subtotal.
 *  - `free` mode: always $0.
 *  - `freeShippingThreshold`: waives shipping when subtotal meets or exceeds the
 *    threshold (does not apply to `free` mode which is already $0).
 */
export function computeShipping(
  subtotalCents: number,
  state: string | null,
  lines: ShippableLine[],
  settings: PricingSettings,
  shipToStore: boolean = false,
): ShippingComputation {
  const zone = getShippingZone(state);
  const weightLbs = totalCartWeight(lines);

  if (shipToStore) {
    return {
      cents: 0,
      weightLbs,
      zone,
      tierMaxWeightLbs: null,
      baseCents: 0,
      freeShippingApplied: false,
    };
  }

  if (settings.shippingMode === "free") {
    return {
      cents: 0,
      weightLbs,
      zone,
      tierMaxWeightLbs: null,
      baseCents: 0,
      freeShippingApplied: false,
    };
  }

  const subtotalDollars = subtotalCents / 100;
  const freeShippingApplied =
    settings.freeShippingThreshold > 0 &&
    subtotalDollars >= settings.freeShippingThreshold;
  if (freeShippingApplied) {
    return {
      cents: 0,
      weightLbs,
      zone,
      tierMaxWeightLbs: null,
      baseCents: 0,
      freeShippingApplied: true,
    };
  }

  if (settings.shippingMode === "flat_per_item") {
    const totalQty = lines.reduce((sum, l) => sum + Math.max(0, l.quantity), 0);
    return {
      cents: roundCents(totalQty * settings.flatShippingRate * 100),
      weightLbs,
      zone,
      tierMaxWeightLbs: null,
      baseCents: 0,
      freeShippingApplied: false,
    };
  }

  if (settings.shippingMode === "percentage") {
    return {
      cents: roundCents(subtotalCents * settings.shippingPercentage),
      weightLbs,
      zone,
      tierMaxWeightLbs: null,
      baseCents: 0,
      freeShippingApplied: false,
    };
  }

  // mode === "flat" — carrier-style weight × zone rate with optional handling surcharge.
  const tier = pickTier(weightLbs, settings.shippingTiers);
  const handlingCents = roundCents(settings.flatShippingRate * 100);
  const carrierCents = roundCents(tier.baseCents * zone.multiplier);
  return {
    cents: carrierCents + handlingCents,
    weightLbs,
    zone,
    tierMaxWeightLbs: Number.isFinite(tier.maxWeightLbs)
      ? tier.maxWeightLbs
      : null,
    baseCents: tier.baseCents,
    freeShippingApplied: false,
  };
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
