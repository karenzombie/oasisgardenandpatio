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
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { productsTable } from "./products";
import { finishesTable } from "./finishes";
import { productFinialOptionsTable } from "./finials";
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
    // Frame-finish selection for grade-priced products (e.g. Frankford). Null
    // for legacy products where the finish is the variant. Validated against the
    // product's finish pool/options at the application layer (no composite FK).
    finishId: integer("finish_id").references(() => finishesTable.id, {
      onDelete: "set null",
    }),
    // Finial (umbrella pole cap) selection for applicable products (e.g.
    // certain Frankford umbrella series). Null for products without finial
    // options. Validated against the product's product_finial_options at the
    // application layer (no composite FK).
    finialId: integer("finial_id").references(
      () => productFinialOptionsTable.id,
      { onDelete: "set null" },
    ),
    quantity: integer("quantity").notNull(),
    // BASE per-unit price of the parent product line only (add-ons are priced
    // separately in cart_item_addons). Line total = (price + sum(addon
    // unitPrice)) * quantity.
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    // Stable signature of the attached add-on set: the selected add-on option
    // ids sorted ascending and joined with "-" ("" = no add-ons). Part of the
    // unique index so two otherwise-identical lines that differ only by their
    // add-on selection don't collapse into one row on upsert.
    addonSignature: text("addon_signature").notNull().default(""),
    // When set, this line is an ACCESSORY tied 1:1 to a parent line — used by
    // the galvanized-base "Aluminum Top Cover": the cover line points at its
    // base line. ON DELETE CASCADE removes the cover when the base line is
    // removed; the cover's quantity is kept in lockstep with the parent and is
    // NOT independently editable. NULL = a normal, independent line (this
    // includes stem accessories, which are standalone products added as their
    // own freely-editable line).
    parentCartItemId: integer("parent_cart_item_id").references(
      (): AnyPgColumn => cartItemsTable.id,
      { onDelete: "cascade" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("cart_items_cart_id_idx").on(t.cartId),
    // Enforce one row per (cart, product, variant, finish, fabric). NULLs
    // collapsed via COALESCE so duplicate "no-variant" / "no-finish" /
    // "no-fabric" rows can't race in. finish_id distinguishes grade-priced
    // lines that differ only by frame finish (e.g. Frankford).
    uniqueIndex("cart_items_cart_product_variant_fabric_unique").on(
      t.cartId,
      t.productId,
      sql`COALESCE(${t.variantId}, 0)`,
      sql`COALESCE(${t.finishId}, 0)`,
      sql`COALESCE(${t.fabricId}, 0)`,
      sql`COALESCE(${t.finialId}, 0)`,
      t.addonSignature,
    ),
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
