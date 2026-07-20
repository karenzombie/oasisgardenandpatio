import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  date,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const legalDocumentsTable = pgTable(
  "legal_documents",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(),
    version: text("version").notNull(),
    content: text("content").notNull(),
    effectiveDate: date("effective_date").notNull(),
    isActive: boolean("is_active").notNull().default(false),
    pdfStorageUrl: text("pdf_storage_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("legal_documents_type_idx").on(t.type),
    index("legal_documents_active_idx").on(t.isActive),
    check(
      "legal_documents_type_check",
      sql`${t.type} in ('privacy_policy', 'terms_and_conditions', 'shipping_returns', 'warranty')`,
    ),
  ],
);

export const insertLegalDocumentSchema = createInsertSchema(
  legalDocumentsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertLegalDocument = z.infer<typeof insertLegalDocumentSchema>;
export type LegalDocument = typeof legalDocumentsTable.$inferSelect;

export const siteNotificationsTable = pgTable(
  "site_notifications",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull(),
    messageText: text("message_text").notNull(),
    type: text("type").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    style: text("style").notNull().default("standard"),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("site_notifications_active_idx").on(t.isActive),
    check(
      "site_notifications_type_check",
      sql`${t.type} in ('popup', 'banner')`,
    ),
    check(
      "site_notifications_style_check",
      sql`${t.style} in ('standard', 'alert')`,
    ),
  ],
);

export const insertSiteNotificationSchema = createInsertSchema(
  siteNotificationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSiteNotification = z.infer<
  typeof insertSiteNotificationSchema
>;
export type SiteNotification = typeof siteNotificationsTable.$inferSelect;
