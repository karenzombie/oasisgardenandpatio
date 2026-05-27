import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { manufacturersTable } from "./manufacturers";
import { productsTable } from "./products";

// ---------------------------------------------------------------------------
// Finishes
// ---------------------------------------------------------------------------
// A shared library of frame/material finishes (powder coat colors, wood
// stains, metal patinas, etc.) that products can offer as an option at
// order time. Like fabrics, a finish is **not** itself a sellable product —
// it's an attribute applied to a parent product when ordered.
//
// Mirrors the fabric tables (fabricsTable / productFabricOptionsTable /
// productFabricPoolsTable) so customer and staff can pick a finish + a
// fabric side-by-side for each line item.

export const finishesTable = pgTable(
  "finishes",
  {
    id: serial("id").primaryKey(),
    // Required: a finish without a manufacturer can't be sourced.
    manufacturerId: integer("manufacturer_id")
      .notNull()
      .references(() => manufacturersTable.id, { onDelete: "restrict" }),
    // Optional vendor code — some manufacturers print a code on the finish
    // sample (e.g. Tropitone "OBS"), some only use a color name.
    itemNumber: text("item_number"),
    name: text("name").notNull(),
    // Optional swatch image (uploaded via Object Storage, served through
    // the public /api/storage proxy).
    imageUrl: text("image_url"),
    // Optional short description ("textured powder coat", "smooth matte",
    // etc.) shown beneath the swatch on the finishes page.
    description: text("description"),
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
  (t) => [
    // Uniqueness is on (manufacturer, name, description) so the same color
    // name can exist in multiple finish categories for the same manufacturer
    // (e.g. Tropitone "Roca" exists as both a Frame Finish and a TropiKane
    // Weave). item_number is not enforced because it's nullable.
    unique("finishes_manufacturer_name_description_unique").on(
      t.manufacturerId,
      t.name,
      t.description,
    ),
    index("finishes_manufacturer_id_idx").on(t.manufacturerId),
    index("finishes_active_idx").on(t.isActive),
  ],
);

export const insertFinishSchema = createInsertSchema(finishesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFinish = z.infer<typeof insertFinishSchema>;
export type Finish = typeof finishesTable.$inferSelect;

// ---------------------------------------------------------------------------
// Product finish options (M:N: which finishes each product accepts)
// ---------------------------------------------------------------------------

export const productFinishOptionsTable = pgTable(
  "product_finish_options",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    finishId: integer("finish_id")
      .notNull()
      .references(() => finishesTable.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("product_finish_options_product_finish_unique").on(
      t.productId,
      t.finishId,
    ),
    index("product_finish_options_product_idx").on(t.productId),
    index("product_finish_options_finish_idx").on(t.finishId),
  ],
);

export const insertProductFinishOptionSchema = createInsertSchema(
  productFinishOptionsTable,
).omit({ id: true, createdAt: true });
export type InsertProductFinishOption = z.infer<
  typeof insertProductFinishOptionSchema
>;
export type ProductFinishOption =
  typeof productFinishOptionsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Product finish pools (M:N: which manufacturers' full finish catalogs
// are available on this product). A pool means "every active finish from
// this manufacturer is automatically offered for this product, including
// ones added later." The effective set of finishes for a product at order
// time is the UNION of pool-expanded finishes and individually-picked
// productFinishOptions rows.
// ---------------------------------------------------------------------------

export const productFinishPoolsTable = pgTable(
  "product_finish_pools",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    manufacturerId: integer("manufacturer_id")
      .notNull()
      .references(() => manufacturersTable.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("product_finish_pools_product_manufacturer_unique").on(
      t.productId,
      t.manufacturerId,
    ),
    index("product_finish_pools_product_idx").on(t.productId),
    index("product_finish_pools_manufacturer_idx").on(t.manufacturerId),
  ],
);

export const insertProductFinishPoolSchema = createInsertSchema(
  productFinishPoolsTable,
).omit({ id: true, createdAt: true });
export type InsertProductFinishPool = z.infer<
  typeof insertProductFinishPoolSchema
>;
export type ProductFinishPool = typeof productFinishPoolsTable.$inferSelect;
