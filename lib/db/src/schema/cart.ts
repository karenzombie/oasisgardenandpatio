import {
  pgTable,
  serial,
  text,
  timestamp,
  integer,
  numeric,
  index,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { productsTable } from "./products";
import {
  productVariantsTable,
  fabricsTable,
  productFabricOptionsTable,
} from "./variants";

export const cartsTable = pgTable(
  "carts",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id"),
    userId: integer("user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
  },
  (t) => [
    index("carts_session_id_idx").on(t.sessionId),
    index("carts_user_id_idx").on(t.userId),
    // Enforce a single open cart per signed-in user. Anonymous carts (NULL
    // user_id) are not constrained.
    uniqueIndex("carts_user_id_unique")
      .on(t.userId)
      .where(sql`${t.userId} is not null`),
  ],
);

export const insertCartSchema = createInsertSchema(cartsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCart = z.infer<typeof insertCartSchema>;
export type Cart = typeof cartsTable.$inferSelect;

export const cartItemsTable = pgTable(
  "cart_items",
  {
    id: serial("id").primaryKey(),
    cartId: integer("cart_id")
      .notNull()
      .references(() => cartsTable.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),
    // Variant + fabric selections; both nullable for products without options.
    // Carts aren't a historical record so no name snapshots — renames are fine
    // to reflect live until checkout, where order_items snapshots capture them.
    variantId: integer("variant_id").references(
      () => productVariantsTable.id,
      { onDelete: "cascade" },
    ),
    fabricId: integer("fabric_id").references(() => fabricsTable.id, {
      onDelete: "set null",
    }),
    quantity: integer("quantity").notNull(),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("cart_items_cart_id_idx").on(t.cartId),
    // Composite FKs mirror order_items: a cart can't hold a (product, variant)
    // pair where variant doesn't belong to product, or a fabric that isn't a
    // configured option for the product.
    foreignKey({
      name: "cart_items_product_variant_fk",
      columns: [t.productId, t.variantId],
      foreignColumns: [
        productVariantsTable.productId,
        productVariantsTable.id,
      ],
    }).onDelete("cascade"),
    foreignKey({
      name: "cart_items_product_fabric_fk",
      columns: [t.productId, t.fabricId],
      foreignColumns: [
        productFabricOptionsTable.productId,
        productFabricOptionsTable.fabricId,
      ],
    }).onDelete("set null"),
  ],
);

export const insertCartItemSchema = createInsertSchema(cartItemsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertCartItem = z.infer<typeof insertCartItemSchema>;
export type CartItem = typeof cartItemsTable.$inferSelect;
