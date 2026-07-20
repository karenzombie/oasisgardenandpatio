import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  index,
  unique,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { legalDocumentsTable } from "./cms";

export const customersTable = pgTable(
  "customers",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    email: text("email").notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    phone: text("phone"),
    companyName: text("company_name"),
    customerType: text("customer_type").notNull().default("residential"),
    createdByAgentId: integer("created_by_agent_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    // Marketing contact preference (Brief 7). Controls the automated
    // wishlist disclosure email, staff wishlist reach-out emails, and future
    // marketing blasts only — never order/shipping/delivery transactional
    // emails. Defaults to opted IN (false = contact permitted).
    marketingOptOut: boolean("marketing_opt_out").notNull().default(false),
    marketingOptOutAt: timestamp("marketing_opt_out_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("customers_email_idx").on(t.email),
    // Plain UNIQUE constraint (not a partial unique index) so Postgres can
    // match it for `INSERT … ON CONFLICT (user_id) DO NOTHING` in the
    // Clerk-sync handler. Postgres treats multiple NULLs as distinct under
    // a regular UNIQUE constraint, so walk-in customers (user_id NULL)
    // still coexist freely.
    unique("customers_user_id_unique").on(t.userId),
  ],
);

export const insertCustomerSchema = createInsertSchema(customersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCustomer = z.infer<typeof insertCustomerSchema>;
export type Customer = typeof customersTable.$inferSelect;

export const addressesTable = pgTable(
  "addresses",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull().default("shipping"),
    recipientName: text("recipient_name"),
    street1: text("street1").notNull(),
    street2: text("street2"),
    city: text("city").notNull(),
    state: text("state").notNull(),
    zip: text("zip").notNull(),
    country: text("country").notNull().default("US"),
    phone: text("phone"),
    isDefault: boolean("is_default").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("addresses_customer_id_idx").on(t.customerId)],
);

export const insertAddressSchema = createInsertSchema(addressesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAddress = z.infer<typeof insertAddressSchema>;
export type Address = typeof addressesTable.$inferSelect;

// Append-only acceptance log. One row per acceptance event; never updated or
// deleted. The latest row per document_type for a customer is their current
// acceptance. document_version is copied from the legal_documents row at
// acceptance time so the record survives future document edits.
export const customerLegalAcceptancesTable = pgTable(
  "customer_legal_acceptances",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    documentType: text("document_type").notNull(),
    documentId: integer("document_id")
      .notNull()
      .references(() => legalDocumentsTable.id),
    documentVersion: text("document_version").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("customer_legal_acceptances_customer_id_idx").on(t.customerId),
    check(
      "customer_legal_acceptances_document_type_check",
      sql`${t.documentType} in ('privacy_policy', 'terms_and_conditions')`,
    ),
  ],
);

export type CustomerLegalAcceptance =
  typeof customerLegalAcceptancesTable.$inferSelect;
