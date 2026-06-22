import {
  pgTable,
  serial,
  varchar,
  timestamp,
  integer,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { productsTable } from "./products";
import { finishesTable } from "./finishes";
import { fabricsTable } from "./variants";

export const wishlistItemsTable = pgTable(
  "wishlist_items",
  {
    id: serial("id").primaryKey(),
    // Nullable: guest wishlist rows are keyed by deviceToken and have no
    // user_id until the guest signs in and their rows are merged.
    userId: integer("user_id").references(() => usersTable.id, {
      onDelete: "cascade",
    }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    // UUID identifying a guest's device, stored in localStorage under
    // `oasis_device_token`. Null once the row belongs to a signed-in user.
    deviceToken: varchar("device_token"),
    // Optional configuration the customer selected before saving. Frame
    // finish and table-top tile both reference finishes (distinguished by
    // finishes.description); fabric references fabrics.
    selectedFinishId: integer("selected_finish_id").references(
      () => finishesTable.id,
      { onDelete: "set null" },
    ),
    selectedFabricId: integer("selected_fabric_id").references(
      () => fabricsTable.id,
      { onDelete: "set null" },
    ),
    selectedTableTopTileId: integer("selected_table_top_tile_id").references(
      () => finishesTable.id,
      { onDelete: "set null" },
    ),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // One saved configuration per product for guests. Signed-in users have
    // no uniqueness constraint — multiple configs per product are allowed
    // (identical configs are de-duplicated at the app layer on merge).
    uniqueIndex("wishlist_items_device_product_uq")
      .on(t.deviceToken, t.productId)
      .where(sql`${t.userId} is null`),
    index("wishlist_items_user_id_idx").on(t.userId),
    index("wishlist_items_device_token_idx").on(t.deviceToken),
  ],
);

export const insertWishlistItemSchema = createInsertSchema(
  wishlistItemsTable,
).omit({
  id: true,
  createdAt: true,
});
export type InsertWishlistItem = z.infer<typeof insertWishlistItemSchema>;
export type WishlistItem = typeof wishlistItemsTable.$inferSelect;
