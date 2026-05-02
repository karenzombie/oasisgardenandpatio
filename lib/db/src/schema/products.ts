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
import { manufacturersTable } from "./manufacturers";
import { categoriesTable } from "./categories";
import { materialsTable } from "./materials";

export const productsTable = pgTable(
  "products",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    sku: text("sku").notNull().unique(),
    description: text("description"),
    shortDescription: text("short_description"),
    manufacturerId: integer("manufacturer_id").references(
      () => manufacturersTable.id,
      { onDelete: "set null" },
    ),
    categoryId: integer("category_id").references(() => categoriesTable.id, {
      onDelete: "set null",
    }),
    materialId: integer("material_id").references(() => materialsTable.id, {
      onDelete: "set null",
    }),
    price: numeric("price", { precision: 10, scale: 2 }),
    cost: numeric("cost", { precision: 10, scale: 2 }),
    weight: numeric("weight", { precision: 10, scale: 2 }),
    dimensions: text("dimensions"),
    showPriceOnline: boolean("show_price_online").notNull().default(true),
    availableOnline: boolean("available_online").notNull().default(true),
    inStoreOnly: boolean("in_store_only").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    lowStockThreshold: integer("low_stock_threshold").notNull().default(0),
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
    index("products_manufacturer_id_idx").on(t.manufacturerId),
    index("products_category_id_idx").on(t.categoryId),
    index("products_material_id_idx").on(t.materialId),
    index("products_featured_idx").on(t.featured),
    index("products_active_idx").on(t.isActive),
  ],
);

export const insertProductSchema = createInsertSchema(productsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;

export const productImagesTable = pgTable(
  "product_images",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    altText: text("alt_text"),
    isPrimary: boolean("is_primary").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("product_images_product_id_idx").on(t.productId)],
);

export const insertProductImageSchema = createInsertSchema(
  productImagesTable,
).omit({ id: true, createdAt: true });
export type InsertProductImage = z.infer<typeof insertProductImageSchema>;
export type ProductImage = typeof productImagesTable.$inferSelect;

export const inventoryTable = pgTable("inventory", {
  id: serial("id").primaryKey(),
  productId: integer("product_id")
    .notNull()
    .unique()
    .references(() => productsTable.id, { onDelete: "cascade" }),
  onHand: integer("on_hand").notNull().default(0),
  onHold: integer("on_hold").notNull().default(0),
  reorderThreshold: integer("reorder_threshold").notNull().default(0),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertInventorySchema = createInsertSchema(inventoryTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type Inventory = typeof inventoryTable.$inferSelect;
