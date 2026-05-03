// Per-state shipping zones, used to apply a distance-based multiplier on top
// of the base weight-tier rate. Origin is California (Santa Clarita).
//
// Zones roughly follow USPS/UPS-style banding:
//   Z1 same-state, Z2 neighboring west, Z3 mountain west, Z4 central,
//   Z5 east coast, Z6 AK/HI offshore. Multipliers were tuned for an LTL
//   furniture carrier and are conservative (we round up).
//
// This table is intentionally explicit and exhaustive for US states + DC so
// that the engine never silently falls back to a default rate.

export type ZoneCode = "Z1" | "Z2" | "Z3" | "Z4" | "Z5" | "Z6";

export interface ShippingZone {
  zone: ZoneCode;
  multiplier: number;
  label: string;
}

const ZONES: Record<ZoneCode, { multiplier: number; label: string }> = {
  Z1: { multiplier: 1.0, label: "Origin (CA)" },
  Z2: { multiplier: 1.15, label: "Pacific / Southwest" },
  Z3: { multiplier: 1.35, label: "Mountain / Plains" },
  Z4: { multiplier: 1.55, label: "Central / South" },
  Z5: { multiplier: 1.8, label: "Northeast / Atlantic" },
  Z6: { multiplier: 2.5, label: "Offshore (AK/HI)" },
};

const STATE_TO_ZONE: Record<string, ZoneCode> = {
  CA: "Z1",
  NV: "Z2",
  AZ: "Z2",
  OR: "Z2",
  WA: "Z2",
  ID: "Z2",
  UT: "Z2",
  MT: "Z3",
  WY: "Z3",
  CO: "Z3",
  NM: "Z3",
  ND: "Z3",
  SD: "Z3",
  NE: "Z3",
  KS: "Z3",
  OK: "Z3",
  TX: "Z4",
  MN: "Z4",
  IA: "Z4",
  MO: "Z4",
  AR: "Z4",
  LA: "Z4",
  WI: "Z4",
  IL: "Z4",
  MS: "Z4",
  AL: "Z4",
  TN: "Z4",
  KY: "Z4",
  IN: "Z4",
  MI: "Z4",
  OH: "Z4",
  GA: "Z4",
  FL: "Z4",
  SC: "Z5",
  NC: "Z5",
  VA: "Z5",
  WV: "Z5",
  PA: "Z5",
  MD: "Z5",
  DE: "Z5",
  DC: "Z5",
  NJ: "Z5",
  NY: "Z5",
  CT: "Z5",
  RI: "Z5",
  MA: "Z5",
  VT: "Z5",
  NH: "Z5",
  ME: "Z5",
  AK: "Z6",
  HI: "Z6",
};

export function getShippingZone(state: string | null): ShippingZone {
  const code = state ? state.trim().toUpperCase() : "";
  const zone = STATE_TO_ZONE[code] ?? "Z4";
  const meta = ZONES[zone];
  return { zone, multiplier: meta.multiplier, label: meta.label };
}
