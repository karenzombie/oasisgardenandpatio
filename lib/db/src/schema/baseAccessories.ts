import {
  pgTable,
  serial,
  integer,
  numeric,
  timestamp,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { finishesTable } from "./finishes";

// ---------------------------------------------------------------------------
// Base accessory pickers (galvanized plate bases: Stem + Aluminum Top Cover)
// ---------------------------------------------------------------------------
// The 7 Frankford galvanized plate bases offer two OPTIONAL customer-selectable
// accessories on their PDP, each of which adds a SEPARATE cart/order line (the
// base price never changes):
//
//   1. Stem  — selectable from a per-base list of EXISTING standalone stem
//      products (8ST / 18ST / 18ST2). Added as a normal, independent line that
//      the customer can re-quantity or remove on its own. Availability differs
//      per base, so the allowed set lives in product_stem_options.
//
//   2. Aluminum Top Cover — a hidden, non-browsable product per base (e.g.
//      24G-TC) whose price depends on the chosen finish color (6 Frankford
//      finishes). It is NOT a standalone product: the cover line is tied 1:1 to
//      its base line via cart_items.parent_cart_item_id (locked quantity,
//      removed with the base). product_cover_options maps base -> cover product;
//      product_cover_finish_prices holds the per-finish MSRP + sale price.

// base -> allowed stem products (M:N; the stem is a real, standalone product).
export const productStemOptionsTable = pgTable(
  "product_stem_options",
  {
    id: serial("id").primaryKey(),
    baseProductId: integer("base_product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    stemProductId: integer("stem_product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("product_stem_options_base_stem_unique").on(
      t.baseProductId,
      t.stemProductId,
    ),
    index("product_stem_options_base_idx").on(t.baseProductId),
  ],
);

export const insertProductStemOptionSchema = createInsertSchema(
  productStemOptionsTable,
).omit({ id: true, createdAt: true });
export type InsertProductStemOption = z.infer<
  typeof insertProductStemOptionSchema
>;
export type ProductStemOption = typeof productStemOptionsTable.$inferSelect;

// base -> its single hidden Aluminum Top Cover product (1:1).
export const productCoverOptionsTable = pgTable(
  "product_cover_options",
  {
    id: serial("id").primaryKey(),
    baseProductId: integer("base_product_id")
      .notNull()
      .unique()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    coverProductId: integer("cover_product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("product_cover_options_cover_idx").on(t.coverProductId)],
);

export const insertProductCoverOptionSchema = createInsertSchema(
  productCoverOptionsTable,
).omit({ id: true, createdAt: true });
export type InsertProductCoverOption = z.infer<
  typeof insertProductCoverOptionSchema
>;
export type ProductCoverOption = typeof productCoverOptionsTable.$inferSelect;

// per-finish MSRP + sale price for a cover product. The customer's chosen
// finish selects the row that drives the cover line's price.
export const productCoverFinishPricesTable = pgTable(
  "product_cover_finish_prices",
  {
    id: serial("id").primaryKey(),
    coverProductId: integer("cover_product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    finishId: integer("finish_id")
      .notNull()
      .references(() => finishesTable.id, { onDelete: "cascade" }),
    msrp: numeric("msrp", { precision: 10, scale: 2 }).notNull(),
    salePrice: numeric("sale_price", { precision: 10, scale: 2 }).notNull(),
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
    unique("product_cover_finish_prices_cover_finish_unique").on(
      t.coverProductId,
      t.finishId,
    ),
    index("product_cover_finish_prices_cover_idx").on(t.coverProductId),
  ],
);

export const insertProductCoverFinishPriceSchema = createInsertSchema(
  productCoverFinishPricesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductCoverFinishPrice = z.infer<
  typeof insertProductCoverFinishPriceSchema
>;
export type ProductCoverFinishPrice =
  typeof productCoverFinishPricesTable.$inferSelect;
