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
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { ordersTable } from "./orders";

export const discountEventsTable = pgTable(
  "discount_events",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    value: numeric("value", { precision: 10, scale: 2 }).notNull(),
    appliesTo: text("applies_to").notNull().default("global"),
    targetIds: jsonb("target_ids").$type<number[]>().default([]),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    isStackable: boolean("is_stackable").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("discount_events_active_idx").on(t.isActive)],
);

export const insertDiscountEventSchema = createInsertSchema(
  discountEventsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDiscountEvent = z.infer<typeof insertDiscountEventSchema>;
export type DiscountEvent = typeof discountEventsTable.$inferSelect;

export const couponCodesTable = pgTable(
  "coupon_codes",
  {
    id: serial("id").primaryKey(),
    code: text("code").notNull().unique(),
    discountType: text("discount_type").notNull(),
    value: numeric("value", { precision: 10, scale: 2 }).notNull(),
    minOrderAmount: numeric("min_order_amount", { precision: 10, scale: 2 }),
    maxUsesTotal: integer("max_uses_total"),
    currentUses: integer("current_uses").notNull().default(0),
    singleUsePerCustomer: boolean("single_use_per_customer")
      .notNull()
      .default(false),
    appliesTo: text("applies_to").notNull().default("global"),
    targetIds: jsonb("target_ids").$type<number[]>().default([]),
    startDate: timestamp("start_date", { withTimezone: true }),
    expirationDate: timestamp("expiration_date", { withTimezone: true }),
    isStackable: boolean("is_stackable").notNull().default(false),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    index("coupon_codes_active_idx").on(t.isActive),
    index("coupon_codes_code_idx").on(t.code),
  ],
);

export const insertCouponCodeSchema = createInsertSchema(couponCodesTable).omit(
  { id: true, currentUses: true, createdAt: true, updatedAt: true },
);
export type InsertCouponCode = z.infer<typeof insertCouponCodeSchema>;
export type CouponCode = typeof couponCodesTable.$inferSelect;

export const couponCodeUsesTable = pgTable(
  "coupon_code_uses",
  {
    id: serial("id").primaryKey(),
    couponCodeId: integer("coupon_code_id")
      .notNull()
      .references(() => couponCodesTable.id, { onDelete: "cascade" }),
    userId: integer("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    orderId: integer("order_id").references(() => ordersTable.id, {
      onDelete: "set null",
    }),
    discountApplied: numeric("discount_applied", {
      precision: 10,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("coupon_code_uses_code_idx").on(t.couponCodeId),
    index("coupon_code_uses_user_idx").on(t.userId),
  ],
);

export const insertCouponCodeUseSchema = createInsertSchema(
  couponCodeUsesTable,
).omit({ id: true, createdAt: true });
export type InsertCouponCodeUse = z.infer<typeof insertCouponCodeUseSchema>;
export type CouponCodeUse = typeof couponCodeUsesTable.$inferSelect;
