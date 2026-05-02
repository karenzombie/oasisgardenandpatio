import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  date,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const vendorsTable = pgTable("vendors", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  contactPhone: text("contact_phone"),
  contactEmail: text("contact_email"),
  address: text("address"),
  terms: text("terms"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertVendorSchema = createInsertSchema(vendorsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertVendor = z.infer<typeof insertVendorSchema>;
export type Vendor = typeof vendorsTable.$inferSelect;

export const purchaseOrdersTable = pgTable(
  "purchase_orders",
  {
    id: serial("id").primaryKey(),
    poNumber: text("po_number").notNull().unique(),
    vendorId: integer("vendor_id").references(() => vendorsTable.id, {
      onDelete: "set null",
    }),
    dateRequired: date("date_required"),
    freight: text("freight"),
    terms: text("terms"),
    specialAllowance: text("special_allowance"),
    shipToName: text("ship_to_name"),
    shipToAddress: text("ship_to_address"),
    billToName: text("bill_to_name"),
    billToAddress: text("bill_to_address"),
    orderDate: timestamp("order_date", { withTimezone: true })
      .notNull()
      .defaultNow(),
    receivedByUserId: integer("received_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    dateReceived: timestamp("date_received", { withTimezone: true }),
    authorizedByUserId: integer("authorized_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("draft"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("purchase_orders_vendor_id_idx").on(t.vendorId),
    index("purchase_orders_status_idx").on(t.status),
  ],
);

export const insertPurchaseOrderSchema = createInsertSchema(
  purchaseOrdersTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPurchaseOrder = z.infer<typeof insertPurchaseOrderSchema>;
export type PurchaseOrder = typeof purchaseOrdersTable.$inferSelect;

export const poItemsTable = pgTable(
  "po_items",
  {
    id: serial("id").primaryKey(),
    poId: integer("po_id")
      .notNull()
      .references(() => purchaseOrdersTable.id, { onDelete: "cascade" }),
    itemNumber: text("item_number"),
    description: text("description").notNull(),
    orderQty: integer("order_qty").notNull(),
    receivedQty: integer("received_qty").notNull().default(0),
    unitCost: numeric("unit_cost", { precision: 10, scale: 2 }),
    additionalNotes: text("additional_notes"),
  },
  (t) => [index("po_items_po_id_idx").on(t.poId)],
);

export const insertPoItemSchema = createInsertSchema(poItemsTable).omit({
  id: true,
});
export type InsertPoItem = z.infer<typeof insertPoItemSchema>;
export type PoItem = typeof poItemsTable.$inferSelect;
