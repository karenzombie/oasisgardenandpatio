import {
  pgTable,
  serial,
  boolean,
  timestamp,
  integer,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const agentPrivilegesTable = pgTable(
  "agent_privileges",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .unique()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    canViewAllOrders: boolean("can_view_all_orders").notNull().default(false),
    canViewAllCustomers: boolean("can_view_all_customers")
      .notNull()
      .default(false),
    canViewCost: boolean("can_view_cost").notNull().default(false),
    canAdjustInventory: boolean("can_adjust_inventory")
      .notNull()
      .default(false),
    canApproveCancellations: boolean("can_approve_cancellations")
      .notNull()
      .default(false),
    canSendVendorOrders: boolean("can_send_vendor_orders")
      .notNull()
      .default(true),
    maxDiscountPercentage: numeric("max_discount_percentage", {
      precision: 5,
      scale: 2,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("agent_privileges_user_id_idx").on(t.userId)],
);

export const insertAgentPrivilegesSchema = createInsertSchema(
  agentPrivilegesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAgentPrivileges = z.infer<typeof insertAgentPrivilegesSchema>;
export type AgentPrivileges = typeof agentPrivilegesTable.$inferSelect;
