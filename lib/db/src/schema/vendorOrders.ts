import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  index,
  jsonb,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { ordersTable } from "./orders";
import { manufacturersTable } from "./manufacturers";

export const vendorOrdersTable = pgTable(
  "vendor_orders",
  {
    id: serial("id").primaryKey(),
    vendorOrderNumber: text("vendor_order_number").notNull().unique(),
    // Nullable to support standalone vendor orders created by staff
    // without a parent customer order.
    customerOrderId: integer("customer_order_id").references(
      () => ordersTable.id,
      { onDelete: "cascade" },
    ),
    manufacturerId: integer("manufacturer_id").references(
      () => manufacturersTable.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("pending"),
    notes: text("notes"),
    // Staff-authored note addressed to the vendor. Distinct from `notes`
    // (internal/PO-wide). Rendered in bold, ALL CAPS at the top of the
    // vendor PO PDF so the manufacturer sees it first. Editable on any
    // pending PO (incl. auto-generated) before it is printed/emailed.
    noteToVendor: text("note_to_vendor"),
    // Ship-to override for standalone POs (and as an explicit override even
    // when a customer order is present). When customerOrderId IS NOT NULL,
    // null values here mean "inherit from the customer order". When it IS
    // NULL, these fields drive the PO ship-to block and the receive
    // inventory-bump decision.
    shipToStoreOverride: boolean("ship_to_store_override"),
    shipToName: text("ship_to_name"),
    shipToLine1: text("ship_to_line1"),
    shipToLine2: text("ship_to_line2"),
    shipToCity: text("ship_to_city"),
    shipToState: text("ship_to_state"),
    shipToPostalCode: text("ship_to_postal_code"),
    shipToPhone: text("ship_to_phone"),
    vendorEstimatedDeliveryDate: timestamp("vendor_estimated_delivery_date", {
      withTimezone: true,
    }),
    calculatedExpectedDeliveryDate: timestamp(
      "calculated_expected_delivery_date",
      { withTimezone: true },
    ),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    fulfilledAt: timestamp("fulfilled_at", { withTimezone: true }),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    receivedByUserId: integer("received_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    itemsReceived: boolean("items_received").notNull().default(false),
    customerUpdatedAfterReceiving: boolean("customer_updated_after_receiving")
      .notNull()
      .default(false),
    createdByUserId: integer("created_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("vendor_orders_customer_order_idx").on(t.customerOrderId),
    index("vendor_orders_manufacturer_idx").on(t.manufacturerId),
    index("vendor_orders_status_idx").on(t.status),
  ],
);

export const insertVendorOrderSchema = createInsertSchema(
  vendorOrdersTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVendorOrder = z.infer<typeof insertVendorOrderSchema>;
export type VendorOrder = typeof vendorOrdersTable.$inferSelect;

export const vendorOrderSendsTable = pgTable(
  "vendor_order_sends",
  {
    id: serial("id").primaryKey(),
    vendorOrderId: integer("vendor_order_id")
      .notNull()
      .references(() => vendorOrdersTable.id, { onDelete: "cascade" }),
    sentByUserId: integer("sent_by_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    pdfStorageUrl: text("pdf_storage_url"),
    sentToEmail: text("sent_to_email"),
    isResend: boolean("is_resend").notNull().default(false),
    resendNote: text("resend_note"),
  },
  (t) => [index("vendor_order_sends_vendor_order_idx").on(t.vendorOrderId)],
);

export const insertVendorOrderSendSchema = createInsertSchema(
  vendorOrderSendsTable,
).omit({ id: true, sentAt: true });

// Audit trail for staff edits to a vendor order. Every save in the vendor
// order edit flow inserts one row with the mandatory change note ("why are
// you making this change?"), the acting staff user, and the timestamp. These
// entries render in the same detail-screen timeline as vendor_order_sends so
// edits and sends read as one chronological history.
export const vendorOrderEditsTable = pgTable(
  "vendor_order_edits",
  {
    id: serial("id").primaryKey(),
    vendorOrderId: integer("vendor_order_id")
      .notNull()
      .references(() => vendorOrdersTable.id, { onDelete: "cascade" }),
    editedByUserId: integer("edited_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    editedAt: timestamp("edited_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    note: text("note").notNull(),
  },
  (t) => [index("vendor_order_edits_vendor_order_idx").on(t.vendorOrderId)],
);

export const insertVendorOrderEditSchema = createInsertSchema(
  vendorOrderEditsTable,
).omit({ id: true, editedAt: true });
export type InsertVendorOrderEdit = z.infer<typeof insertVendorOrderEditSchema>;
export type VendorOrderEdit = typeof vendorOrderEditsTable.$inferSelect;
export type InsertVendorOrderSend = z.infer<typeof insertVendorOrderSendSchema>;
export type VendorOrderSend = typeof vendorOrderSendsTable.$inferSelect;

export const vendorOrderCancellationsTable = pgTable(
  "vendor_order_cancellations",
  {
    id: serial("id").primaryKey(),
    vendorOrderId: integer("vendor_order_id")
      .notNull()
      .references(() => vendorOrdersTable.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(), // 'full' | 'partial'
    reason: text("reason"),
    cancelledByUserId: integer("cancelled_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    pdfStorageUrl: text("pdf_storage_url"),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    emailedTo: text("emailed_to"),
    // Snapshot of the items that were cancelled. Each entry is the same
    // shape as PdfVendorOrderItem so the cancellation row remains valid even
    // if the underlying order_items rows are deleted or reassigned.
    items: jsonb("items").notNull(),
  },
  (t) => [
    index("vendor_order_cancellations_vendor_order_idx").on(t.vendorOrderId),
  ],
);

export type VendorOrderCancellation =
  typeof vendorOrderCancellationsTable.$inferSelect;

export const cancellationRequestsTable = pgTable(
  "cancellation_requests",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    requestedByUserId: integer("requested_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    reason: text("reason"),
    status: text("status").notNull().default("pending"),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    refundAmount: numeric("refund_amount", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("cancellation_requests_order_id_idx").on(t.orderId),
    index("cancellation_requests_status_idx").on(t.status),
  ],
);

export const insertCancellationRequestSchema = createInsertSchema(
  cancellationRequestsTable,
).omit({ id: true, createdAt: true });
export type InsertCancellationRequest = z.infer<
  typeof insertCancellationRequestSchema
>;
export type CancellationRequest = typeof cancellationRequestsTable.$inferSelect;
