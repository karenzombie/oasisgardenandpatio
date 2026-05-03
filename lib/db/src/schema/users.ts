import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  varchar,
  json,
  integer,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const USER_ROLES = ["customer", "agent", "admin"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    firstName: text("first_name"),
    lastName: text("last_name"),
    role: text("role").notNull().default("customer"),
    isActive: boolean("is_active").notNull().default(true),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    mustChangePassword: boolean("must_change_password")
      .notNull()
      .default(false),
    twoFactorEnabled: boolean("two_factor_enabled").notNull().default(false),
    twoFactorSecret: text("two_factor_secret"),
    twoFactorEnrolledAt: timestamp("two_factor_enrolled_at", {
      withTimezone: true,
    }),
    twoFactorRecoveryCodes: json("two_factor_recovery_codes")
      .$type<string[]>()
      .default(sql`'[]'::json`),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("users_role_idx").on(t.role),
    check(
      "users_role_check",
      sql`${t.role} in ('customer', 'agent', 'admin')`,
    ),
  ],
);

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { withTimezone: false }).notNull(),
  },
  (t) => [index("IDX_session_expire").on(t.expire)],
);

export const emailVerificationTokensTable = pgTable(
  "email_verification_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("email_verification_tokens_user_id_idx").on(t.userId)],
);

export const passwordResetTokensTable = pgTable(
  "password_reset_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("password_reset_tokens_user_id_idx").on(t.userId)],
);

export const adminRecoveryTokensTable = pgTable(
  "admin_recovery_tokens",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    requestedAt: timestamp("requested_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelledByUserId: integer("cancelled_by_user_id").references(
      () => usersTable.id,
      { onDelete: "set null" },
    ),
    requestIp: text("request_ip"),
    requestUserAgent: text("request_user_agent"),
  },
  (t) => [
    index("admin_recovery_tokens_user_id_idx").on(t.userId),
    index("admin_recovery_tokens_expires_at_idx").on(t.expiresAt),
  ],
);

export type AdminRecoveryToken = typeof adminRecoveryTokensTable.$inferSelect;
