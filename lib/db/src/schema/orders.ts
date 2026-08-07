import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  date,
  time,
  integer,
  numeric,
  jsonb,
  index,
  foreignKey,
  check,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { customersTable, addressesTable } from "./customers";
import { productsTable } from "./products";
import { manufacturersTable } from "./manufacturers";
import {
  productVariantsTable,
  fabricsTable,
  productFabricOptionsTable,
} from "./variants";
import { finishesTable } from "./finishes";
import { productFinialOptionsTable } from "./finials";

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
    // Store-delivery scheduling. scheduledDeliveryTime stores the START time
    // of a fixed 1-hour delivery window (e.g. "14:00:00" for 2-3 PM) — see
    // DELIVERY_TIME_WINDOWS in the web/api-server delivery lib for the label
    // mapping. Used by the "Out for Local Delivery" email and the Deliveries
    // manifest (Brief 6).
    scheduledDeliveryDate: date("scheduled_delivery_date"),
    scheduledDeliveryTime: time("scheduled_delivery_time"),
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
    isQuickOrder: boolean("is_quick_order").notNull().default(false),
    skipVendorOrder: boolean("skip_vendor_order").notNull().default(false),
    walkInName: text("walk_in_name"),
    walkInEmail: text("walk_in_email"),
    walkInPhone: text("walk_in_phone"),
    isInternalRestock: boolean("is_internal_restock")
      .notNull()
      .default(false),
    // True (default) means the manufacturer ships to the Oasis store; false
    // means the manufacturer drop-ships directly to the customer's
    // shippingAddressId. Drives the Ship-To block on vendor PO PDFs.
    shipToStore: boolean("ship_to_store").notNull().default(true),
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
    // Nullable to support line items belonging to a standalone vendor
    // order (no parent customer order). When NULL, vendorOrderId or
    // fabricVendorOrderId MUST be set; this is enforced at the app layer
    // by the only writer of NULL-orderId rows (the standalone vendor
    // order creation route).
    orderId: integer("order_id").references(() => ordersTable.id, {
      onDelete: "cascade",
    }),
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
    // Optional override (staff-portal only): when set, this line's fabric
    // ships from this alternate vendor on its own PO instead of being
    // bundled with the product's vendor PO. NULL (the default and the
    // only value used by customer/online orders) keeps the historical
    // behavior of "fabric ships with the product vendor".
    fabricVendorId: integer("fabric_vendor_id").references(
      () => manufacturersTable.id,
      { onDelete: "set null" },
    ),
    // Frame-finish selection for grade-priced products (e.g. Frankford). Null
    // for legacy products where the finish IS the variant. Snapshots capture
    // the finish identity at order time so vendor PDFs survive catalog renames.
    finishId: integer("finish_id").references(() => finishesTable.id, {
      onDelete: "set null",
    }),
    // Finial (umbrella pole cap) selection for applicable products. Null for
    // products without finial options. Snapshots capture the finial identity
    // at order time so vendor PDFs survive catalog renames/deletions.
    finialId: integer("finial_id").references(
      () => productFinialOptionsTable.id,
      { onDelete: "set null" },
    ),
    productSkuSnapshot: text("product_sku_snapshot"),
    variantSkuSnapshot: text("variant_sku_snapshot"),
    variantNameSnapshot: text("variant_name_snapshot"),
    finishCodeSnapshot: text("finish_code_snapshot"),
    finishNameSnapshot: text("finish_name_snapshot"),
    finialCodeSnapshot: text("finial_code_snapshot"),
    finialNameSnapshot: text("finial_name_snapshot"),
    fabricItemNumberSnapshot: text("fabric_item_number_snapshot"),
    fabricNameSnapshot: text("fabric_name_snapshot"),
    // Fabric brand (manufacturer) and grade at order time — both needed on the
    // vendor PO so the manufacturer knows exactly which fabric line to pull.
    fabricBrandSnapshot: text("fabric_brand_snapshot"),
    fabricGradeSnapshot: text("fabric_grade_snapshot"),
    // List price (MSRP) for this line at order time. unitPrice holds the
    // actual charged (sale) price; this captures the strike-through list price.
    unitMsrpSnapshot: numeric("unit_msrp_snapshot", {
      precision: 10,
      scale: 2,
    }),
    // Per-unit shipping weight (lbs) at order time. Captured from the chosen
    // variant's weight (or the product weight when the variant has none) so
    // the vendor PO can list the size-specific weight even after catalog edits.
    weightSnapshot: numeric("weight_snapshot", { precision: 10, scale: 2 }),
    vendorOrderId: integer("vendor_order_id"),
    // Companion to vendor_order_id: when fabric_vendor_id is set, the
    // line's fabric goes to a SEPARATE vendor PO (this column), while
    // vendor_order_id continues to point at the product vendor's PO.
    // FK is intentionally omitted at the schema level to avoid a
    // circular import between order_items and vendor_orders; integrity
    // is maintained by the auto-generate / re-assign code paths.
    fabricVendorOrderId: integer("fabric_vendor_order_id"),
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
    useInventory: boolean("use_inventory").notNull().default(false),
    inventoryQtyUsed: integer("inventory_qty_used").notNull().default(0),
    receivedQuantity: integer("received_quantity").notNull().default(0),
    // When set, this order line is an ACCESSORY tied 1:1 to a parent line — the
    // immutable snapshot counterpart of cart_items.parent_cart_item_id (used by
    // the galvanized-base Aluminum Top Cover). Lets order/PDF views group a
    // cover under its base. NULL = a normal, independent line (incl. stems).
    parentOrderItemId: integer("parent_order_item_id").references(
      (): AnyPgColumn => orderItemsTable.id,
      { onDelete: "cascade" },
    ),
    // ── Vendor-PO edit overlay ────────────────────────────────────────
    // When staff edit a vendor purchase order (see vendor_order_edits), the
    // customer's original order line MUST stay untouched. These po_* columns
    // hold PO-only overrides layered on top of the shared row: the vendor PO
    // views/PDF read `po_x ?? x`, while every customer-facing view keeps
    // reading the original columns. `po_edited` drives the red "changed from
    // original" flag in the staff UI (never printed). `po_removed` drops the
    // line from the PO while leaving it on the customer order. Lines ADDED
    // during a PO edit are fresh order_items rows with order_id NULL,
    // vendor_order_id set, and po_edited = true.
    poEdited: boolean("po_edited").notNull().default(false),
    poRemoved: boolean("po_removed").notNull().default(false),
    poSku: text("po_sku"),
    poDescription: text("po_description"),
    poSubDescription: text("po_sub_description"),
    poQuantity: integer("po_quantity"),
    poUnitPrice: numeric("po_unit_price", { precision: 10, scale: 2 }),
    // Per-unit cost frozen at line creation (staff-only). Resolved once from
    // the product/variant/grade at creation time and never re-read live.
    // Null for pre-existing lines (no backfill) and when cost cannot resolve.
    // Never exposed to customers or vendors.
    unitCostSnapshot: numeric("unit_cost_snapshot", {
      precision: 10,
      scale: 2,
    }),
  },
  (t) => [
    index("order_items_order_id_idx").on(t.orderId),
    index("order_items_vendor_order_id_idx").on(t.vendorOrderId),
    index("order_items_fabric_vendor_order_id_idx").on(t.fabricVendorOrderId),
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
    // Alternate fabric vendor only makes sense when there's actually a
    // fabric chosen on the line.
    check(
      "order_items_fabric_vendor_requires_fabric",
      sql`${t.fabricVendorId} IS NULL OR ${t.fabricId} IS NOT NULL`,
    ),
    // The fabric_vendor_order_id is the assignment to the alternate
    // vendor's PO; it can only exist if we've designated an alternate
    // vendor at all.
    check(
      "order_items_fabric_vo_requires_fabric_vendor",
      sql`${t.fabricVendorOrderId} IS NULL OR ${t.fabricVendorId} IS NOT NULL`,
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
    notes: text("notes"),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    recordedByUserId: integer("recorded_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
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
