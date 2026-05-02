import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  index,
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
    customerOrderId: integer("customer_order_id")
      .notNull()
      .references(() => ordersTable.id, { onDelete: "cascade" }),
    manufacturerId: integer("manufacturer_id").references(
      () => manufacturersTable.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("pending"),
    notes: text("notes"),
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
export type InsertVendorOrderSend = z.infer<typeof insertVendorOrderSendSchema>;
export type VendorOrderSend = typeof vendorOrderSendsTable.$inferSelect;

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
