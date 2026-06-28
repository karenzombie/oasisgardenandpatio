import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { ordersTable } from "./orders";
import { categoriesTable } from "./categories";
import { manufacturersTable } from "./manufacturers";
import { productsTable } from "./products";

export const carriersTable = pgTable("carriers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").unique(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  trackingUrlTemplate: text("tracking_url_template"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertCarrierSchema = createInsertSchema(carriersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCarrier = z.infer<typeof insertCarrierSchema>;
export type Carrier = typeof carriersTable.$inferSelect;

export const shipmentsTable = pgTable(
  "shipments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    carrierId: integer("carrier_id").references(() => carriersTable.id, {
      onDelete: "set null",
    }),
    trackingNumber: text("tracking_number"),
    shippedAt: timestamp("shipped_at", { withTimezone: true }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("shipments_order_id_idx").on(t.orderId),
    index("shipments_tracking_number_idx").on(t.trackingNumber),
  ],
);

export const insertShipmentSchema = createInsertSchema(shipmentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertShipment = z.infer<typeof insertShipmentSchema>;
export type Shipment = typeof shipmentsTable.$inferSelect;

/**
 * Customer-facing shipping rate rules. These are the SINGLE SOURCE OF TRUTH for
 * shipping charged on external customer online orders. Multiple matching rules
 * STACK (their amounts are summed per line item).
 *
 * `scope` is one of: 'site_wide' | 'category' | 'manufacturer' | 'product'.
 *   - site_wide: matches every product.
 *   - category: matches products with categoryId === categoryId AND, when
 *     subCategory is set, products.sub_category === subCategory.
 *   - manufacturer: matches products with manufacturerId === manufacturerId.
 *   - product: matches the product set in shipping_rule_products.
 * `rateType` is 'flat' (dollars per unit, multiplied by quantity) or
 * 'percentage' (percent of the line total: unitPrice × quantity).
 * Validated in the application layer (Zod) rather than via DB CHECK constraints.
 */
export const shippingRulesTable = pgTable(
  "shipping_rules",
  {
    id: serial("id").primaryKey(),
    scope: text("scope").notNull(),
    rateType: text("rate_type").notNull(),
    rateValue: numeric("rate_value", { precision: 10, scale: 2 }).notNull(),
    categoryId: integer("category_id").references(() => categoriesTable.id, {
      onDelete: "cascade",
    }),
    subCategory: text("sub_category"),
    manufacturerId: integer("manufacturer_id").references(
      () => manufacturersTable.id,
      { onDelete: "cascade" },
    ),
    label: text("label"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("shipping_rules_scope_idx").on(t.scope),
    index("shipping_rules_category_id_idx").on(t.categoryId),
    index("shipping_rules_manufacturer_id_idx").on(t.manufacturerId),
  ],
);

export const insertShippingRuleSchema = createInsertSchema(
  shippingRulesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertShippingRule = z.infer<typeof insertShippingRuleSchema>;
export type ShippingRule = typeof shippingRulesTable.$inferSelect;

/** Junction linking a scope='product' rule to the products it covers. */
export const shippingRuleProductsTable = pgTable(
  "shipping_rule_products",
  {
    id: serial("id").primaryKey(),
    ruleId: integer("rule_id")
      .notNull()
      .references(() => shippingRulesTable.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    unique("shipping_rule_products_rule_product_uq").on(t.ruleId, t.productId),
    index("shipping_rule_products_product_id_idx").on(t.productId),
  ],
);

export const insertShippingRuleProductSchema = createInsertSchema(
  shippingRuleProductsTable,
).omit({ id: true });
export type InsertShippingRuleProduct = z.infer<
  typeof insertShippingRuleProductSchema
>;
export type ShippingRuleProduct = typeof shippingRuleProductsTable.$inferSelect;

/**
 * Area E: order-level shipping by TOTAL order weight. Fixed bounds, staff-set
 * amounts. maxWeight null means "no upper bound" (the 501+ block). The matching
 * tier's amount is added once per order, on top of the stacked per-line rules.
 */
export const shippingWeightTiersTable = pgTable("shipping_weight_tiers", {
  id: serial("id").primaryKey(),
  minWeight: integer("min_weight").notNull(),
  maxWeight: integer("max_weight"),
  amount: numeric("amount", { precision: 10, scale: 2 })
    .notNull()
    .default("0"),
  displayOrder: integer("display_order").notNull(),
});

export const insertShippingWeightTierSchema = createInsertSchema(
  shippingWeightTiersTable,
).omit({ id: true });
export type InsertShippingWeightTier = z.infer<
  typeof insertShippingWeightTierSchema
>;
export type ShippingWeightTier = typeof shippingWeightTiersTable.$inferSelect;
