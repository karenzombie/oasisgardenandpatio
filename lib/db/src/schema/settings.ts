import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const systemSettingsTable = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  description: text("description"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertSystemSettingSchema = createInsertSchema(
  systemSettingsTable,
).omit({ updatedAt: true });
export type InsertSystemSetting = z.infer<typeof insertSystemSettingSchema>;
export type SystemSetting = typeof systemSettingsTable.$inferSelect;

export const SETTING_KEYS = {
  defaultTaxRate: "default_tax_rate",
  shippingMode: "shipping_mode",
  flatShippingRate: "flat_shipping_rate",
  shippingPercentage: "shipping_percentage",
  freeShippingThreshold: "free_shipping_threshold",
  shippingTiers: "shipping_tiers",
  overdueVendorOrderThresholdDays: "overdue_vendor_order_threshold_days",
  lowStockThreshold: "low_stock_threshold",
  defaultAgentDiscountCap: "default_agent_discount_cap",
  currentSequenceYear: "current_sequence_year",
  currentYearOrderSequence: "current_year_order_sequence",
} as const;
