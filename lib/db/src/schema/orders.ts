import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { customersTable, addressesTable } from "./customers";
import { productsTable } from "./products";
import {
  productVariantsTable,
  fabricsTable,
  productFabricOptionsTable,
} from "./variants";

export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    orderNumber: text("order_number").notNull().unique(),
    customerId: integer("customer_id").references(() => customersTable.id, {
      onDelete: "set null",
    }),
    createdByAgentId: integer("created_by_agent_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    orderType: text("order_type").notNull().default("online"),
    status: text("status").notNull().default("pending"),
    subtotal: numeric("subtotal", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    taxAmount: numeric("tax_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    deliveryAmount: numeric("delivery_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    total: numeric("total", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    depositAmount: numeric("deposit_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    balanceDue: numeric("balance_due", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    shippingAddressId: integer("shipping_address_id").references(
      () => addressesTable.id,
      { onDelete: "set null" },
    ),
    billingAddressId: integer("billing_address_id").references(
      () => addressesTable.id,
      { onDelete: "set null" },
    ),
    shippingMethod: text("shipping_method"),
    salespersonName: text("salesperson_name"),
    specialInstructions: text("special_instructions"),
    merchandiseReceived: boolean("merchandise_received")
      .notNull()
      .default(false),
    customerSignatureUrl: text("customer_signature_url"),
    customerUpdatedAfterReceiving: boolean("customer_updated_after_receiving")
      .notNull()
      .default(false),
    orderConfirmationPdfUrl: text("order_confirmation_pdf_url"),
    deliverySheetPdfUrl: text("delivery_sheet_pdf_url"),
    notes: text("notes"),
    placedAt: timestamp("placed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("orders_customer_id_idx").on(t.customerId),
    index("orders_status_idx").on(t.status),
    index("orders_placed_at_idx").on(t.placedAt),
    index("orders_agent_id_idx").on(t.createdByAgentId),
  ],
);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;

export const orderItemsTable = pgTable(
  "order_items",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    productId: integer("product_id").references(() => productsTable.id, {
      onDelete: "set null",
    }),
    // Variant + fabric refs are nullable to keep simple flat products working.
    // Snapshots are captured so renames/deletions don't rewrite history. Both
    // customer-facing and vendor-facing PDFs read from these snapshots.
    variantId: integer("variant_id").references(
      () => productVariantsTable.id,
      { onDelete: "set null" },
    ),
    fabricId: integer("fabric_id").references(() => fabricsTable.id, {
      onDelete: "set null",
    }),
    productSkuSnapshot: text("product_sku_snapshot"),
    variantSkuSnapshot: text("variant_sku_snapshot"),
    variantNameSnapshot: text("variant_name_snapshot"),
    fabricItemNumberSnapshot: text("fabric_item_number_snapshot"),
    fabricNameSnapshot: text("fabric_name_snapshot"),
    vendorOrderId: integer("vendor_order_id"),
    department: text("department"),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull(),
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    discountAmount: numeric("discount_amount", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    discountReason: text("discount_reason"),
    notes: text("notes"),
  },
  (t) => [
    index("order_items_order_id_idx").on(t.orderId),
    index("order_items_vendor_order_id_idx").on(t.vendorOrderId),
    // Composite FKs guarantee that variant_id belongs to product_id and that
    // fabric_id is a configured option for product_id. MATCH SIMPLE skips the
    // check when either column is NULL, so simple flat-product line items
    // without variants/fabrics still work.
    foreignKey({
      name: "order_items_product_variant_fk",
      columns: [t.productId, t.variantId],
      foreignColumns: [
        productVariantsTable.productId,
        productVariantsTable.id,
      ],
    }).onDelete("set null"),
    foreignKey({
      name: "order_items_product_fabric_fk",
      columns: [t.productId, t.fabricId],
      foreignColumns: [
        productFabricOptionsTable.productId,
        productFabricOptionsTable.fabricId,
      ],
    }).onDelete("set null"),
    // Snapshot completeness: whenever a FK is set, the corresponding snapshot
    // must be populated so vendor PDFs and order history never lose the
    // identifier. Snapshots remain nullable so flat-product lines (no variant,
    // no fabric) can leave them empty.
    check(
      "order_items_product_sku_snapshot_required",
      sql`${t.productId} IS NULL OR ${t.productSkuSnapshot} IS NOT NULL`,
    ),
    check(
      "order_items_variant_snapshots_required",
      sql`${t.variantId} IS NULL OR (${t.variantSkuSnapshot} IS NOT NULL AND ${t.variantNameSnapshot} IS NOT NULL)`,
    ),
    check(
      "order_items_fabric_snapshots_required",
      sql`${t.fabricId} IS NULL OR (${t.fabricItemNumberSnapshot} IS NOT NULL AND ${t.fabricNameSnapshot} IS NOT NULL)`,
    ),
    // A variant or fabric reference without a product is nonsensical.
    check(
      "order_items_variant_requires_product",
      sql`${t.variantId} IS NULL OR ${t.productId} IS NOT NULL`,
    ),
    check(
      "order_items_fabric_requires_product",
      sql`${t.fabricId} IS NULL OR ${t.productId} IS NOT NULL`,
    ),
  ],
);

export const insertOrderItemSchema = createInsertSchema(orderItemsTable).omit({
  id: true,
});
export type InsertOrderItem = z.infer<typeof insertOrderItemSchema>;
export type OrderItem = typeof orderItemsTable.$inferSelect;

export const orderStatusHistoryTable = pgTable(
  "order_status_history",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    fromStatus: text("from_status"),
    toStatus: text("to_status").notNull(),
    changedByUserId: integer("changed_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("order_status_history_order_id_idx").on(t.orderId)],
);

export const insertOrderStatusHistorySchema = createInsertSchema(
  orderStatusHistoryTable,
).omit({ id: true, createdAt: true });
export type InsertOrderStatusHistory = z.infer<
  typeof insertOrderStatusHistorySchema
>;
export type OrderStatusHistory = typeof orderStatusHistoryTable.$inferSelect;

export const paymentsTable = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    paymentMethod: text("payment_method").notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    transactionId: text("transaction_id"),
    avsResponse: text("avs_response"),
    cvvResponse: text("cvv_response"),
    cardLast4: text("card_last4"),
    cardType: text("card_type"),
    status: text("status").notNull().default("pending"),
    rawResponse: jsonb("raw_response"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("payments_order_id_idx").on(t.orderId),
    index("payments_transaction_id_idx").on(t.transactionId),
  ],
);

export const insertPaymentSchema = createInsertSchema(paymentsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof paymentsTable.$inferSelect;
