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
  overdueVendorOrderThresholdDays: "overdue_vendor_order_threshold_days",
  lowStockThreshold: "low_stock_threshold",
} as const;
