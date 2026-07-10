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
    // Optional sub-grouping within a manufacturer (e.g. NorthCape splits its
    // fabric library into "Sunbrella", "Belenos", "Wicker"). Used to render
    // collection subsections on the public Fabrics page. Null = ungrouped.
    collection: text("collection"),
    swatchImageUrl: text("swatch_image_url"),
    grade: text("grade"),
    // Free-text vendor note for this fabric (e.g. "Non-stock. Allow additional
    // lead time."). Shown to customers as an inline callout when the fabric is
    // selected, and editable by staff.
    notes: text("notes"),
    // Color family (e.g. "Blue", "Beige", "Multicolor") used for storefront
    // search/filter. Plain text — values normalized at import time.
    colorFamily: text("color_family"),
    // Pipe-delimited seating/product-type compatibility codes set by the
    // manufacturer (e.g. "PS|C|V" = Padded Sling, Cushion, Vintage Wire).
    // Codes: A=Air, S=Sling, PS=Padded Sling, C=Cushion, U=Umbrella,
    // V=Vintage Wire, W=Welt. Null for manufacturers that don't classify
    // fabrics this way. Admin-only, read-only display for now — not exposed
    // on the public catalog response and not used to filter product wiring
    // yet (that's a separate future step).
    availabilityCodes: text("availability_codes"),
    // Stripe fabrics will eventually trigger a paired-umbrella ordering rule
    // (any umbrella ordered with a stripe fabric must ship in pairs). Surfaced
    // in staff/admin only — not exposed on the public catalog response.
    isStripe: boolean("is_stripe").notNull().default(false),
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
    // Absolute per-variant pricing. When BOTH are set they OVERRIDE the
    // product base-price + priceAdjustment model for this variant. Used by
    // size-priced products (e.g. rugs) where each size carries its own MSRP
    // and sale price that aren't derivable from a single base + adjustment.
    // Null on legacy variants, which keep the base + adjustment model.
    msrp: numeric("msrp", { precision: 10, scale: 2 }),
    salePrice: numeric("sale_price", { precision: 10, scale: 2 }),
    // Flat per-unit shipping surcharge in dollars for this SKU (e.g. an
    // oversize "truck only" freight fee). Added on top of computed shipping
    // for each unit of this variant ordered. Defaults to 0 (no surcharge).
    shippingSurcharge: numeric("shipping_surcharge", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    // Per-variant shipping weight in lbs. Used by size-priced products (e.g.
    // rugs) where each size weighs a different amount. Null falls back to the
    // parent product weight. Surfaced on the PDP spec sheet (per selected
    // size) and snapshotted onto order lines for the vendor PO.
    weight: numeric("weight", { precision: 10, scale: 2 }),
    // Per-variant dimensions/spec string (e.g. per-size umbrella clearances and
    // mast measurements). Free-text, formatted to match the product-level
    // style. Null falls back to the parent product's dimensions on the PDP.
    dimensions: text("dimensions"),
    // Free-text vendor note for this specific SKU (e.g. lead-time warnings).
    // Surfaced as an inline callout on the product page.
    notes: text("notes"),
    // Hard minimum order quantity for this SKU. When set, the quantity selector
    // defaults to and cannot go below this value.
    minOrderQty: integer("min_order_qty"),
    // When true, stripe-classified fabrics are filtered out of the fabric
    // selector for this SKU (some configurations can't be made with stripes).
    excludeStripeFabrics: boolean("exclude_stripe_fabrics")
      .notNull()
      .default(false),
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
// Variant grade prices (per-grade MSRP + sale price for a variant)
// ---------------------------------------------------------------------------
// Some manufacturers (e.g. Frankford) publish an explicit price matrix where
// every configuration SKU has a distinct MSRP and sale price for each fabric
// grade (A, A+, B, C, D, E, F, ...). These prices are NOT derivable from a
// base price + upcharge formula, so they're stored per (variant, grade). When
// a customer selects a fabric, its grade selects the row that drives the
// displayed price. Products WITHOUT rows here keep using the legacy
// base-price + fabricUpcharge model (e.g. Treasure Garden).

export const variantGradePricesTable = pgTable(
  "variant_grade_prices",
  {
    id: serial("id").primaryKey(),
    variantId: integer("variant_id")
      .notNull()
      .references(() => productVariantsTable.id, { onDelete: "cascade" }),
    // Fabric grade label exactly as classified on fabrics.grade (e.g. "A",
    // "A+", "B", "C", "D", "E", "F"). Case-sensitive match at lookup time.
    grade: text("grade").notNull(),
    msrp: numeric("msrp", { precision: 10, scale: 2 }).notNull(),
    salePrice: numeric("sale_price", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("variant_grade_prices_variant_grade_unique").on(
      t.variantId,
      t.grade,
    ),
    index("variant_grade_prices_variant_idx").on(t.variantId),
  ],
);

export const insertVariantGradePriceSchema = createInsertSchema(
  variantGradePricesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertVariantGradePrice = z.infer<
  typeof insertVariantGradePriceSchema
>;
export type VariantGradePrice = typeof variantGradePricesTable.$inferSelect;

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
