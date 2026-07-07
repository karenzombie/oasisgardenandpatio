import {
  pgTable,
  serial,
  bigserial,
  text,
  timestamp,
  integer,
  bigint,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const auditLogTable = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: integer("entity_id"),
    changes: jsonb("changes"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_user_id_idx").on(t.userId),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
    index("audit_log_created_at_idx").on(t.createdAt),
  ],
);

export const insertAuditLogSchema = createInsertSchema(auditLogTable).omit({
  id: true,
  createdAt: true,
});
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLogTable.$inferSelect;

/**
 * Append-only history of every admin-driven mutation to a tracked entity.
 *
 * One row per save event. The `snapshot` jsonb captures the entity's full
 * state AFTER the change (and for `delete`, the state BEFORE the row was
 * removed). Combined with `previousSnapshot` you can reconstruct any past
 * state and restore it.
 *
 * `entityType` is a free-form string (e.g. 'product', 'product_fabrics',
 * 'manufacturer'). `entityId` is the primary id of the live row.
 */
export const entityHistoryTable = pgTable(
  "entity_history",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    changeType: text("change_type").notNull(),
    snapshot: jsonb("snapshot").notNull(),
    previousSnapshot: jsonb("previous_snapshot"),
    changedByUserId: integer("changed_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    // Denormalized so history survives user deletion.
    changedByEmail: text("changed_by_email"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("entity_history_entity_idx").on(
      t.entityType,
      t.entityId,
      t.createdAt,
    ),
    index("entity_history_user_idx").on(t.changedByUserId, t.createdAt),
    index("entity_history_created_at_idx").on(t.createdAt),
    check(
      "entity_history_change_type_chk",
      sql`change_type IN ('create','update','delete','replace')`,
    ),
  ],
);

export type EntityHistory = typeof entityHistoryTable.$inferSelect;

export const emailLogTable = pgTable(
  "email_log",
  {
    id: serial("id").primaryKey(),
    toEmail: text("to_email").notNull(),
    fromEmail: text("from_email"),
    subject: text("subject"),
    template: text("template"),
    status: text("status").notNull().default("pending"),
    providerMessageId: text("provider_message_id"),
    errorMessage: text("error_message"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("email_log_to_email_idx").on(t.toEmail),
    index("email_log_status_idx").on(t.status),
  ],
);

export const insertEmailLogSchema = createInsertSchema(emailLogTable).omit({
  id: true,
  createdAt: true,
});
export type InsertEmailLog = z.infer<typeof insertEmailLogSchema>;
export type EmailLog = typeof emailLogTable.$inferSelect;

export const backupLogTable = pgTable(
  "backup_log",
  {
    id: serial("id").primaryKey(),
    backupType: text("backup_type").notNull(),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull(),
    triggeredBy: text("triggered_by"),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    databaseDumpSizeBytes: bigint("database_dump_size_bytes", {
      mode: "number",
    }),
    imageCount: integer("image_count"),
  },
  (t) => [
    index("backup_log_type_idx").on(t.backupType),
    index("backup_log_ran_at_idx").on(t.ranAt),
    check("backup_log_type_chk", sql`backup_type IN ('products','customers')`),
    check(
      "backup_log_status_chk",
      sql`status IN ('success','failure')`,
    ),
  ],
);

export const insertBackupLogSchema = createInsertSchema(backupLogTable).omit({
  id: true,
});
export type InsertBackupLog = z.infer<typeof insertBackupLogSchema>;
export type BackupLog = typeof backupLogTable.$inferSelect;
