import {
  pgTable,
  serial,
  text,
  varchar,
  numeric,
  timestamp,
  integer,
  index,
  uniqueIndex,
  unique,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { customersTable } from "./customers";
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
    // Nullable: only set for signed-in-customer rows (Brief 7). Pure guest
    // rows that never merged into a signed-in user stay null forever — the
    // brief's "not null" spec doesn't hold because this table is shared with
    // the pre-existing guest/localStorage wishlist, which must not change.
    customerId: integer("customer_id").references(() => customersTable.id, {
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
    // Human-readable snapshot of the selected finish/fabric/table-top-tile at
    // save time (e.g. "Finish: Aged Bronze / Fabric: Canvas Navy"), so it
    // still displays correctly even if the underlying option data changes
    // later. Brief 7, Step 2A.
    variantLabel: text("variant_label"),
    quantity: integer("quantity").notNull().default(1),
    // Sale price (or MSRP if no sale price) at save time, captured only when
    // the product had a visible storefront price at that moment
    // (available_online && show_price_online). Null for inquiry/call-for-
    // pricing products. Reserved for a future order-conversion feature —
    // never displayed in the staff or customer-facing UI. Brief 7, Step 2A.
    priceAtSave: numeric("price_at_save", { precision: 10, scale: 2 }),
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
    index("wishlist_items_customer_id_idx").on(t.customerId),
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

// Wishlist parent record (Brief 7, Step 1 Q8 / Step 5). One row per customer,
// created the first time they save any wishlist item. Holds the shared
// WISH-XXXXXXXX-XXXX reference number all of that customer's wishlist_items
// rows share, mirroring the orders/vendor_orders numbering pattern.
export const wishlistsTable = pgTable(
  "wishlists",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    wishlistNumber: text("wishlist_number").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("wishlists_customer_id_key").on(t.customerId),
    unique("wishlists_wishlist_number_key").on(t.wishlistNumber),
    index("wishlists_customer_id_idx").on(t.customerId),
  ],
);

export const insertWishlistSchema = createInsertSchema(wishlistsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertWishlist = z.infer<typeof insertWishlistSchema>;
export type Wishlist = typeof wishlistsTable.$inferSelect;

// Audit-only record of every staff reach-out email sent for a customer's
// wishlist (Brief 7, Step 6). Never surfaced in a log viewer — write-only
// from the admin send route.
export const wishlistOutreachLogTable = pgTable(
  "wishlist_outreach_log",
  {
    id: serial("id").primaryKey(),
    customerId: integer("customer_id")
      .notNull()
      .references(() => customersTable.id, { onDelete: "cascade" }),
    // References the single `users` table (staff share it with customers,
    // distinguished by `role`), per Step 1's identity model.
    sentByStaffId: integer("sent_by_staff_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "restrict" }),
    sentAt: timestamp("sent_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    personalNote: text("personal_note"),
  },
  (t) => [index("wishlist_outreach_log_customer_id_idx").on(t.customerId)],
);

export const insertWishlistOutreachLogSchema = createInsertSchema(
  wishlistOutreachLogTable,
).omit({
  id: true,
  sentAt: true,
});
export type InsertWishlistOutreachLog = z.infer<
  typeof insertWishlistOutreachLogSchema
>;
export type WishlistOutreachLog = typeof wishlistOutreachLogTable.$inferSelect;

// Per-item breakdown of a wishlist_outreach_log send event (Brief 07B, Step
// 2A). One row per item included in a given send, so staff can see which
// specific items have been reached out about and when. No own timestamp —
// the send time is always wishlist_outreach_log.sentAt via outreachLogId, to
// avoid two competing timestamps for the same event.
export const wishlistOutreachLogItemsTable = pgTable(
  "wishlist_outreach_log_items",
  {
    id: serial("id").primaryKey(),
    outreachLogId: integer("outreach_log_id")
      .notNull()
      .references(() => wishlistOutreachLogTable.id, { onDelete: "cascade" }),
    wishlistItemId: integer("wishlist_item_id")
      .notNull()
      .references(() => wishlistItemsTable.id, { onDelete: "cascade" }),
  },
  (t) => [
    index("wishlist_outreach_log_items_outreach_log_idx").on(t.outreachLogId),
    index("wishlist_outreach_log_items_wishlist_item_idx").on(
      t.wishlistItemId,
    ),
  ],
);

export const insertWishlistOutreachLogItemSchema = createInsertSchema(
  wishlistOutreachLogItemsTable,
).omit({ id: true });
export type InsertWishlistOutreachLogItem = z.infer<
  typeof insertWishlistOutreachLogItemSchema
>;
export type WishlistOutreachLogItem =
  typeof wishlistOutreachLogItemsTable.$inferSelect;

// Chronological, typed event log for a wishlist (Brief 07B, Step 2B). Mirrors
// the order_status_history pattern (typed events + bordered-card timeline on
// the detail page) rather than the generic entity_history snapshot log.
// staffUserId is null for customer-triggered events (item_added, opt_out,
// opt_in) and set for staff-triggered events (reach_out_sent).
export const wishlistStatusHistoryTable = pgTable(
  "wishlist_status_history",
  {
    id: serial("id").primaryKey(),
    wishlistId: integer("wishlist_id")
      .notNull()
      .references(() => wishlistsTable.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    // Set for item_added events; identifies which product was added.
    productId: integer("product_id").references(() => productsTable.id, {
      onDelete: "set null",
    }),
    // Set for reach_out_sent events; join to wishlist_outreach_log (and its
    // wishlist_outreach_log_items) to derive included items / personal-note
    // presence rather than duplicating that data here.
    outreachLogId: integer("outreach_log_id").references(
      () => wishlistOutreachLogTable.id,
      { onDelete: "set null" },
    ),
    staffUserId: integer("staff_user_id").references(() => usersTable.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("wishlist_status_history_wishlist_id_idx").on(t.wishlistId)],
);

export const insertWishlistStatusHistorySchema = createInsertSchema(
  wishlistStatusHistoryTable,
).omit({ id: true, createdAt: true });
export type InsertWishlistStatusHistory = z.infer<
  typeof insertWishlistStatusHistorySchema
>;
export type WishlistStatusHistory =
  typeof wishlistStatusHistoryTable.$inferSelect;
