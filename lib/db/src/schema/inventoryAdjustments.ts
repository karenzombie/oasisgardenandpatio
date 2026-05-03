import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { productsTable, inventoryTable } from "./products";
import { productVariantsTable, fabricsTable } from "./variants";
import { ordersTable } from "./orders";
import { vendorOrdersTable } from "./vendorOrders";

export const inventoryLocationsTable = pgTable(
  "inventory_locations",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    code: text("code").unique(),
    address: text("address"),
    isActive: boolean("is_active").notNull().default(true),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("inventory_locations_active_idx").on(t.isActive)],
);

export const insertInventoryLocationSchema = createInsertSchema(
  inventoryLocationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertInventoryLocation = z.infer<
  typeof insertInventoryLocationSchema
>;
export type InventoryLocation = typeof inventoryLocationsTable.$inferSelect;

export const inventoryAdjustmentsTable = pgTable(
  "inventory_adjustments",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    // Variant + fabric are nullable so flat-product adjustments still work,
    // but when set they pin the audit row to the exact (product, variant,
    // fabric) SKU that was changed — same granularity as inventory rows.
    variantId: integer("variant_id").references(
      () => productVariantsTable.id,
      { onDelete: "set null" },
    ),
    fabricId: integer("fabric_id").references(() => fabricsTable.id, {
      onDelete: "set null",
    }),
    inventoryId: integer("inventory_id").references(() => inventoryTable.id, {
      onDelete: "set null",
    }),
    locationId: integer("location_id").references(
      () => inventoryLocationsTable.id,
      { onDelete: "set null" },
    ),
    adjustmentType: text("adjustment_type").notNull(),
    quantityChange: integer("quantity_change").notNull(),
    quantityAfter: integer("quantity_after"),
    reason: text("reason"),
    vendorOrderId: integer("vendor_order_id").references(
      () => vendorOrdersTable.id,
      { onDelete: "set null" },
    ),
    orderId: integer("order_id").references(() => ordersTable.id, {
      onDelete: "set null",
    }),
    optionSelections: jsonb("option_selections"),
    performedByUserId: integer("performed_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("inventory_adjustments_product_idx").on(t.productId),
    index("inventory_adjustments_created_at_idx").on(t.createdAt),
    index("inventory_adjustments_type_idx").on(t.adjustmentType),
  ],
);

export const insertInventoryAdjustmentSchema = createInsertSchema(
  inventoryAdjustmentsTable,
).omit({ id: true, createdAt: true });
export type InsertInventoryAdjustment = z.infer<
  typeof insertInventoryAdjustmentSchema
>;
export type InventoryAdjustment = typeof inventoryAdjustmentsTable.$inferSelect;

export const inventoryReceiptsTable = pgTable(
  "inventory_receipts",
  {
    id: serial("id").primaryKey(),
    vendorOrderId: integer("vendor_order_id").references(
      () => vendorOrdersTable.id,
      { onDelete: "set null" },
    ),
    receivedByUserId: integer("received_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    linkedOrderId: integer("linked_order_id").references(() => ordersTable.id, {
      onDelete: "set null",
    }),
    locationId: integer("location_id").references(
      () => inventoryLocationsTable.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    receivedAt: timestamp("received_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("inventory_receipts_vendor_order_idx").on(t.vendorOrderId),
    index("inventory_receipts_received_at_idx").on(t.receivedAt),
  ],
);

export const insertInventoryReceiptSchema = createInsertSchema(
  inventoryReceiptsTable,
).omit({ id: true, receivedAt: true });
export type InsertInventoryReceipt = z.infer<
  typeof insertInventoryReceiptSchema
>;
export type InventoryReceipt = typeof inventoryReceiptsTable.$inferSelect;
