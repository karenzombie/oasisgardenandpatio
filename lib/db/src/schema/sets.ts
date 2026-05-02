import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";
import { manufacturersTable } from "./manufacturers";

export const productSetsTable = pgTable(
  "product_sets",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    sku: text("sku").unique(),
    description: text("description"),
    manufacturerId: integer("manufacturer_id").references(
      () => manufacturersTable.id,
      { onDelete: "set null" },
    ),
    setPrice: numeric("set_price", { precision: 10, scale: 2 }),
    isActive: boolean("is_active").notNull().default(true),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("product_sets_active_idx").on(t.isActive)],
);

export const insertProductSetSchema = createInsertSchema(productSetsTable).omit(
  { id: true, createdAt: true, updatedAt: true },
);
export type InsertProductSet = z.infer<typeof insertProductSetSchema>;
export type ProductSet = typeof productSetsTable.$inferSelect;

export const productSetItemsTable = pgTable(
  "product_set_items",
  {
    id: serial("id").primaryKey(),
    setId: integer("set_id")
      .notNull()
      .references(() => productSetsTable.id, { onDelete: "cascade" }),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "restrict" }),
    quantity: integer("quantity").notNull().default(1),
    displayOrder: integer("display_order").notNull().default(0),
  },
  (t) => [
    index("product_set_items_set_idx").on(t.setId),
    index("product_set_items_product_idx").on(t.productId),
  ],
);

export const insertProductSetItemSchema = createInsertSchema(
  productSetItemsTable,
).omit({ id: true });
export type InsertProductSetItem = z.infer<typeof insertProductSetItemSchema>;
export type ProductSetItem = typeof productSetItemsTable.$inferSelect;
