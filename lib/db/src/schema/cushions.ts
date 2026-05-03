import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  numeric,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { productsTable } from "./products";
import { fabricsTable } from "./variants";

export const CUSHION_ORDER_KINDS = ["custom", "stock"] as const;
export type CushionOrderKind = (typeof CUSHION_ORDER_KINDS)[number];

export const CUSHION_ORDER_STATUSES = [
  "submitted",
  "in_review",
  "ordered",
  "complete",
] as const;
export type CushionOrderStatus = (typeof CUSHION_ORDER_STATUSES)[number];

export const CUSHION_TYPES = [
  "hinged_chaise",
  "club_chair",
  "trapezoid",
  "bench",
  "ottoman",
  "dining_chair",
] as const;
export type CushionType = (typeof CUSHION_TYPES)[number];

export const cushionOrdersTable = pgTable(
  "cushion_orders",
  {
    id: serial("id").primaryKey(),
    orderNumber: text("order_number").notNull().unique(),
    orderKind: text("order_kind").notNull(),
    status: text("status").notNull().default("submitted"),

    // Customer info
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email"),
    customerPhone: text("customer_phone"),

    // Order-level fabric & options (used for custom orders).
    // For stock orders these are null; per-item fabric is stored on items.
    fabricName: text("fabric_name"),
    fabricItemNumber: text("fabric_item_number"),
    contrastingFabricName: text("contrasting_fabric_name"),
    ties: text("ties"), // 'velcro' | 'tie' | null
    seatWelt: text("seat_welt"), // 'self' | 'contrasting' | 'none' | null
    backWelt: text("back_welt"), // 'self' | 'contrasting' | 'none' | null
    buttons: text("buttons"), // 'yes' | 'no' | null
    tuft: text("tuft"), // 'yes' | 'no' | null
    templateAvailable: text("template_available"), // 'yes' | 'no' | null

    customerNotes: text("customer_notes"),
    agentNotes: text("agent_notes"),

    submittedAt: timestamp("submitted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    handledByUserId: integer("handled_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
  },
  (t) => [
    check(
      "cushion_orders_kind_chk",
      sql`${t.orderKind} in ('custom','stock')`,
    ),
    check(
      "cushion_orders_status_chk",
      sql`${t.status} in ('submitted','in_review','ordered','complete')`,
    ),
    index("cushion_orders_status_idx").on(t.status),
    index("cushion_orders_submitted_at_idx").on(t.submittedAt),
  ],
);

export const cushionOrderItemsTable = pgTable(
  "cushion_order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => cushionOrdersTable.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    quantity: integer("quantity").notNull().default(1),
    notes: text("notes"),

    // Custom-order fields
    cushionType: text("cushion_type"),
    measurementA: numeric("measurement_a", { precision: 6, scale: 2 }),
    measurementB: numeric("measurement_b", { precision: 6, scale: 2 }),
    measurementC: numeric("measurement_c", { precision: 6, scale: 2 }),
    measurementD: numeric("measurement_d", { precision: 6, scale: 2 }),
    measurementE: numeric("measurement_e", { precision: 6, scale: 2 }),
    measurementF: numeric("measurement_f", { precision: 6, scale: 2 }),
    thickness: numeric("thickness", { precision: 6, scale: 2 }),

    // Stock-order fields
    productId: integer("product_id").references(() => productsTable.id, {
      onDelete: "set null",
    }),
    productNameSnapshot: text("product_name_snapshot"),
    productSkuSnapshot: text("product_sku_snapshot"),
    fabricId: integer("fabric_id").references(() => fabricsTable.id, {
      onDelete: "set null",
    }),
    fabricName: text("fabric_name"),
    fabricItemNumber: text("fabric_item_number"),
  },
  (t) => [
    check(
      "cushion_order_items_type_chk",
      sql`${t.cushionType} is null or ${t.cushionType} in ('hinged_chaise','club_chair','trapezoid','bench','ottoman','dining_chair')`,
    ),
    check("cushion_order_items_qty_chk", sql`${t.quantity} >= 1`),
    index("cushion_order_items_order_id_idx").on(t.orderId),
  ],
);

export const insertCushionOrderSchema = createInsertSchema(
  cushionOrdersTable,
).omit({
  id: true,
  orderNumber: true,
  submittedAt: true,
  updatedAt: true,
});
export type InsertCushionOrder = z.infer<typeof insertCushionOrderSchema>;
export type CushionOrder = typeof cushionOrdersTable.$inferSelect;

export const insertCushionOrderItemSchema = createInsertSchema(
  cushionOrderItemsTable,
).omit({ id: true });
export type InsertCushionOrderItem = z.infer<
  typeof insertCushionOrderItemSchema
>;
export type CushionOrderItem = typeof cushionOrderItemsTable.$inferSelect;
