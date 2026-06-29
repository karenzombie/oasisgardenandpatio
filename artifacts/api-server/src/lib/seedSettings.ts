import { db, systemSettingsTable, SETTING_KEYS } from "@workspace/db";
import { logger } from "./logger";

type DefaultEntry = { value: unknown; description: string };

const DEFAULTS: Record<string, DefaultEntry> = {
  [SETTING_KEYS.defaultTaxRate]: {
    value: 0.0975,
    description: "Default sales tax rate (Santa Clarita, CA). Decimal 0-1.",
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
}

export const SETTING_DEFAULTS = DEFAULTS;
