import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  index,
  unique,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { manufacturersTable } from "./manufacturers";
import { productsTable } from "./products";

// ---------------------------------------------------------------------------
// Fabrics
// ---------------------------------------------------------------------------
// A shared library of fabric swatches that products (umbrellas, cushions, etc.)
// can offer as an option at order time. The fabric is **not** itself a sellable
// product — it's an attribute applied to a parent product/variant when ordered.

export const fabricsTable = pgTable(
  "fabrics",
  {
    id: serial("id").primaryKey(),
    // Required: a fabric without a manufacturer can't be sourced. The natural
    // key is (manufacturer_id, item_number) — vendor item numbers are only
    // unique within a vendor's catalog and can collide across vendors.
    manufacturerId: integer("manufacturer_id")
      .notNull()
      .references(() => manufacturersTable.id, { onDelete: "restrict" }),
    itemNumber: text("item_number").notNull(),
    name: text("name").notNull(),
    swatchImageUrl: text("swatch_image_url"),
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
    unique("fabrics_manufacturer_item_number_unique").on(
      t.manufacturerId,
      t.itemNumber,
    ),
    index("fabrics_manufacturer_id_idx").on(t.manufacturerId),
    index("fabrics_active_idx").on(t.isActive),
  ],
);

export const insertFabricSchema = createInsertSchema(fabricsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFabric = z.infer<typeof insertFabricSchema>;
export type Fabric = typeof fabricsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Product variants (frame finishes, sizes, colorways, etc.)
// ---------------------------------------------------------------------------
// A variant is the actual orderable SKU. The parent `products` row is the
// "model" that customers browse; variants are the per-finish/size/etc.
// rows that get tracked in inventory and printed on orders. Inventory and
// product images both reference variant_id when present.

export const productVariantsTable = pgTable(
  "product_variants",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    variantSku: text("variant_sku").notNull().unique(),
    variantName: text("variant_name").notNull(),
    optionLabel: text("option_label").notNull().default("Option"),
    priceAdjustment: numeric("price_adjustment", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    displayOrder: integer("display_order").notNull().default(0),
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
    index("product_variants_product_id_idx").on(t.productId),
    // UNIQUE constraint (not just an index) on (product_id, id) so other
    // tables can declare a *composite* foreign key that ensures variant_id
    // belongs to product_id (e.g., order_items can't pair UM810 with a
    // UM812 finish row).
    unique("product_variants_product_id_id_unique").on(t.productId, t.id),
  ],
);

export const insertProductVariantSchema = createInsertSchema(
  productVariantsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductVariant = z.infer<typeof insertProductVariantSchema>;
export type ProductVariant = typeof productVariantsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Product fabric options (M:N: which fabrics each product accepts)
// ---------------------------------------------------------------------------

export const productFabricOptionsTable = pgTable(
  "product_fabric_options",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    fabricId: integer("fabric_id")
      .notNull()
      .references(() => fabricsTable.id, { onDelete: "cascade" }),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // UNIQUE constraint so order_items / cart_items can declare a composite
    // FK on (product_id, fabric_id) — guarantees a chosen fabric is actually
    // configured as an option for the chosen product.
    unique("product_fabric_options_product_fabric_unique").on(
      t.productId,
      t.fabricId,
    ),
    index("product_fabric_options_product_idx").on(t.productId),
    index("product_fabric_options_fabric_idx").on(t.fabricId),
  ],
);

export const insertProductFabricOptionSchema = createInsertSchema(
  productFabricOptionsTable,
).omit({ id: true, createdAt: true });
export type InsertProductFabricOption = z.infer<
  typeof insertProductFabricOptionSchema
>;
export type ProductFabricOption =
  typeof productFabricOptionsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Product fabric pools (M:N: which manufacturers' full fabric catalogs are
// available on this product). A pool means "every active fabric from this
// manufacturer is automatically offered for this product, including ones
// added later." The effective set of fabric options for a product at order
// time is the UNION of pool-expanded fabrics and individually-picked
// productFabricOptions rows.
// ---------------------------------------------------------------------------

export const productFabricPoolsTable = pgTable(
  "product_fabric_pools",
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
    unique("product_fabric_pools_product_manufacturer_unique").on(
      t.productId,
      t.manufacturerId,
    ),
    index("product_fabric_pools_product_idx").on(t.productId),
    index("product_fabric_pools_manufacturer_idx").on(t.manufacturerId),
  ],
);

export const insertProductFabricPoolSchema = createInsertSchema(
  productFabricPoolsTable,
).omit({ id: true, createdAt: true });
export type InsertProductFabricPool = z.infer<
  typeof insertProductFabricPoolSchema
>;
export type ProductFabricPool = typeof productFabricPoolsTable.$inferSelect;
