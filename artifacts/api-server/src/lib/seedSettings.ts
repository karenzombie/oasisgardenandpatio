import { eq } from "drizzle-orm";
import { db, systemSettingsTable, SETTING_KEYS } from "@workspace/db";
import { logger } from "./logger";

type DefaultEntry = { value: unknown; description: string };

const DEFAULTS: Record<string, DefaultEntry> = {
  [SETTING_KEYS.defaultTaxRate]: {
    value: 0.0975,
    description: "Default sales tax rate (Santa Clarita, CA). Decimal 0-1.",
  },
  [SETTING_KEYS.shippingMode]: {
    value: "flat",
    description: "How shipping is calculated: flat | percentage | free",
  },
  [SETTING_KEYS.flatShippingRate]: {
    value: 0,
    description:
      "Flat handling surcharge in USD added on top of carrier rate when shipping_mode=flat",
  },
  [SETTING_KEYS.shippingPercentage]: {
    value: 0.1,
    description: "Shipping as a fraction of merchandise total (0-1)",
  },
  [SETTING_KEYS.freeShippingThreshold]: {
    value: 1000,
    description: "Order subtotal at or above which shipping is free",
  },
  [SETTING_KEYS.shippingTiers]: {
    value: [
      { maxWeightLbs: 5, baseCents: 1500 },
      { maxWeightLbs: 20, baseCents: 3500 },
      { maxWeightLbs: 70, baseCents: 7500 },
      { maxWeightLbs: 150, baseCents: 14900 },
      { maxWeightLbs: 500, baseCents: 24900 },
      { maxWeightLbs: 1500, baseCents: 49900 },
      { maxWeightLbs: 100000, baseCents: 89900 },
    ],
    description:
      "Carrier rate table for shipping_mode=flat: weight tier → base cents (origin-zone, multiplied by destination zone factor)",
  },
  [SETTING_KEYS.overdueVendorOrderThresholdDays]: {
    value: 14,
    description:
      "Days after sending before a vendor order is flagged as overdue",
  },
  [SETTING_KEYS.lowStockThreshold]: {
    value: 5,
    description:
      "Default low-stock threshold used for products without their own value",
  },
  [SETTING_KEYS.defaultAgentDiscountCap]: {
    value: 0.1,
    description: "Default maximum discount (0-1) a sales agent may apply",
  },
  [SETTING_KEYS.currentSequenceYear]: {
    value: new Date().getUTCFullYear(),
    description: "Calendar year used in the human-readable order number prefix",
  },
  [SETTING_KEYS.currentYearOrderSequence]: {
    value: 0,
    description: "Per-year monotonically increasing order counter",
  },
};

export async function seedDefaultSettings(): Promise<void> {
  const rows = Object.entries(DEFAULTS).map(([key, { value, description }]) => ({
    key,
    value: value as unknown,
    description,
  }));
  await db
    .insert(systemSettingsTable)
    .values(rows)
    .onConflictDoNothing({ target: systemSettingsTable.key });
  logger.info({ count: rows.length }, "Ensured default system settings");

  // One-time normalization: prior versions seeded `flat_shipping_rate=99` as
  // the entire shipping fee. The engine now treats that key as a *handling
  // surcharge* added on top of the carrier weight×zone rate, so a $99 legacy
  // value would silently inflate every order. If the stored value still
  // matches the old default, reset it to the new default ($0).
  const [legacyFlat] = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, SETTING_KEYS.flatShippingRate))
    .limit(1);
  if (legacyFlat && Number(legacyFlat.value) === 99) {
    await db
      .update(systemSettingsTable)
      .set({
        value: 0 as unknown as object,
        description: DEFAULTS[SETTING_KEYS.flatShippingRate].description,
      })
      .where(eq(systemSettingsTable.key, SETTING_KEYS.flatShippingRate));
    logger.info(
      "Reset legacy flat_shipping_rate=99 to 0 (new semantics: handling surcharge)",
    );
  }

  // Same idea for shipping_tiers: older installs persisted `[]` (placeholder).
  // The engine falls back to defaults at runtime, but persisting the real
  // table means the admin Settings UI can edit it later without surprise.
  const [legacyTiers] = await db
    .select({ value: systemSettingsTable.value })
    .from(systemSettingsTable)
    .where(eq(systemSettingsTable.key, SETTING_KEYS.shippingTiers))
    .limit(1);
  if (
    legacyTiers &&
    Array.isArray(legacyTiers.value) &&
    legacyTiers.value.length === 0
  ) {
    await db
      .update(systemSettingsTable)
      .set({
        value: DEFAULTS[SETTING_KEYS.shippingTiers].value as object,
        description: DEFAULTS[SETTING_KEYS.shippingTiers].description,
      })
      .where(eq(systemSettingsTable.key, SETTING_KEYS.shippingTiers));
    logger.info("Populated empty shipping_tiers with default carrier table");
  }
}

export const SETTING_DEFAULTS = DEFAULTS;
