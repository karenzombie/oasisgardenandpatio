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
    // Optional collection name — currently only used for Couture Jardin.
    // When set, the customer-facing finishes page groups finishes by
    // collection and shows the collection's panel image from
    // finish_collections. Null for all other manufacturers.
    collection: text("collection"),
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
    // Uniqueness on (manufacturer, name, description) with NULLS NOT DISTINCT
    // so the same color name can exist in multiple finish categories for the
    // same manufacturer (e.g. Tropitone "Roca" as Frame Finish and as
    // TropiKane Weave), while Treasure Garden's null-description rows are
    // still treated as duplicates of each other.
    // NOTE: the DB constraint is NULLS NOT DISTINCT — applied via direct
    // ALTER TABLE since Drizzle 0.45 doesn't expose that modifier.
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
// Finish collections
// ---------------------------------------------------------------------------
// Groups of finishes for manufacturers that organise their palette into named
// collections (currently Couture Jardin). Each collection row stores a panel
// image that shows all the finishes in that collection together, displayed on
// the public finishes page and product detail page.
//
// Finishes belong to a collection via the `collection` TEXT column on
// finishesTable (matched by name). No FK — collection membership is purely
// a string match so rows can be pre-created before finishes are stamped.

export const finishCollectionsTable = pgTable(
  "finish_collections",
  {
    id: serial("id").primaryKey(),
    manufacturerId: integer("manufacturer_id")
      .notNull()
      .references(() => manufacturersTable.id, { onDelete: "cascade" }),
    collectionName: text("collection_name").notNull(),
    // Path to the panel image in Object Storage (same format as
    // finishes.image_url). Shows grouped swatches by component type.
    panelImageUrl: text("panel_image_url"),
    displayOrder: integer("display_order"),
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
    unique("finish_collections_manufacturer_name_unique").on(
      t.manufacturerId,
      t.collectionName,
    ),
    index("finish_collections_manufacturer_id_idx").on(t.manufacturerId),
  ],
);

export const insertFinishCollectionSchema = createInsertSchema(
  finishCollectionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertFinishCollection = z.infer<typeof insertFinishCollectionSchema>;
export type FinishCollection = typeof finishCollectionsTable.$inferSelect;

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
