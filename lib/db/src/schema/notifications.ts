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

export const notificationsTable = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    message: text("message").notNull(),
    linkUrl: text("link_url"),
    metadata: jsonb("metadata"),
    isRead: boolean("is_read").notNull().default(false),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("notifications_user_id_idx").on(t.userId),
    index("notifications_unread_idx").on(t.userId, t.isRead),
  ],
);

export const insertNotificationSchema = createInsertSchema(
  notificationsTable,
).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;

export const pendingApprovalsTable = pgTable(
  "pending_approvals",
  {
    id: serial("id").primaryKey(),
    type: text("type").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: integer("entity_id").notNull(),
    requestedByUserId: integer("requested_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    status: text("status").notNull().default("pending"),
    reviewedByUserId: integer("reviewed_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pending_approvals_status_idx").on(t.status),
    index("pending_approvals_entity_idx").on(t.entityType, t.entityId),
  ],
);

export const insertPendingApprovalSchema = createInsertSchema(
  pendingApprovalsTable,
).omit({ id: true, createdAt: true });
export type InsertPendingApproval = z.infer<typeof insertPendingApprovalSchema>;
export type PendingApproval = typeof pendingApprovalsTable.$inferSelect;
