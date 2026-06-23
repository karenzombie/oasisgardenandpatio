import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  unique,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { manufacturersTable } from "./manufacturers";
import { categoriesTable } from "./categories";
import { materialsTable } from "./materials";
// Circular import: variants.ts also imports from this file. Drizzle's
// `.references(() => …)` is a lazy callback so circular module loads work.
import { productVariantsTable, fabricsTable } from "./variants";

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
    // Collection grouping (e.g. Blair, Laguna, Leeward). `collectionSlug` is
    // derived server-side from `collection` on save — staff never type it.
    collection: text("collection"),
    collectionSlug: text("collection_slug"),
    // Free-text sub-classifications below category/material level. Admin/data
    // fields only (not shown on storefront). E.g. subCategory "Dining Chair",
    // subMaterial "Teak". Optional, no enum constraint.
    subCategory: text("sub_category"),
    subMaterial: text("sub_material"),
    // Seating surface type (furniture only; NULL for tables/umbrellas/accessories).
    seatType: text("seat_type"),
    // Umbrella-specific filter fields (NULL for all non-umbrella products).
    umbrellaType: text("umbrella_type"),
    umbrellaShape: text("umbrella_shape"),
    umbrellaSize: text("umbrella_size"),
    liftMechanism: text("lift_mechanism"),
    tiltMechanism: text("tilt_mechanism"),
    poleMaterial: text("pole_material"),
    // Feature flags (nullable, default false).
    hasLedLighting: boolean("has_led_lighting").default(false),
    isCommercialGrade: boolean("is_commercial_grade").default(false),
    // Sell price actually shown to customers / used at checkout. Always set
    // (manually or by `pricing_mode` derivation; see below).
    price: numeric("price", { precision: 10, scale: 2 }),
    // Optional sale price. When set AND less than `price`, the storefront
    // displays a SALE! badge with the original `price` struck through and
    // `salePrice` shown as the active price. Checkout uses `salePrice` when
    // present, otherwise `price`.
    salePrice: numeric("sale_price", { precision: 10, scale: 2 }),
    // When set, the product can be ordered without a fabric selection at this
    // lower price (frame/structure only, no cushions). The regular `price`
    // continues to represent the "frame + fabric" price shown by default.
    // When NULL the product does not offer a frame-only option.
    frameOnlyPrice: numeric("frame_only_price", { precision: 10, scale: 2 }),
    // Our wholesale cost (what we pay the vendor). Used for cost+markup mode
    // and for margin reporting.
    cost: numeric("cost", { precision: 10, scale: 2 }),
    // Manufacturer's suggested retail price (the "list" before any dealer
    // discount). Used for msrp-minus-dealer-rate mode.
    msrp: numeric("msrp", { precision: 10, scale: 2 }),
    // Markup % over `cost` when pricingMode = 'cost_plus_markup'
    // (e.g. 80.00 means cost * 1.80). Stored as a numeric percentage.
    markupPercent: numeric("markup_percent", { precision: 5, scale: 2 }),
    // How `price` should be interpreted / derived. 'fixed' (default) means
    // `price` is authored directly. 'cost_plus_markup' and
    // 'msrp_minus_dealer_rate' indicate the price was (or should be) computed
    // from the inputs above + manufacturer's `dealer_rate`. The pricing
    // helper in `lib/db` exposes the computation; checkout always uses the
    // stored `price`.
    pricingMode: text("pricing_mode").notNull().default("fixed"),
    weight: numeric("weight", { precision: 10, scale: 2 }),
    dimensions: text("dimensions"),
    // Free-form structured spec sheet (Treasure Garden umbrellas, etc.).
    // Keys are vendor-specific (size, ribs, vent, lift, tilt, …); UI renders
    // as a labeled spec table. Use sparingly — promote to first-class columns
    // when a field becomes core to filtering/business logic.
    specs: jsonb("specs"),
    // Free-form tags surfaced in the PDP meta block and used by future
    // search ranking. Stored as a JSON array of strings (e.g. ["sunbrella",
    // "tilt", "9ft"]). Lowercase by convention; not unique-constrained.
    tags: jsonb("tags").$type<string[]>().default(sql`'[]'::jsonb`),
    showPriceOnline: boolean("show_price_online").notNull().default(true),
    availableOnline: boolean("available_online").notNull().default(true),
    inStoreOnly: boolean("in_store_only").notNull().default(false),
    // True for vendors whose lines are not sold online — the storefront
    // hides Add-to-Cart and shows a "Available through a sales agent"
    // notice. Wishlist still works so customers can flag interest.
    quoteOnly: boolean("quote_only").notNull().default(false),
    featured: boolean("featured").notNull().default(false),
    // Timestamp the product was last flagged as featured (null when not
    // featured). Drives the homepage Featured carousel's "order flagged"
    // sorting. Server-managed: set when featured flips true (preserved if
    // already featured), cleared to null when featured flips false.
    featuredAt: timestamp("featured_at", { withTimezone: true }),
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
    index("products_featured_idx").on(t.featured),
    index("products_active_idx").on(t.isActive),
    // Partial filter indexes — only index rows where the value is set.
    index("idx_products_collection")
      .on(t.collection)
      .where(sql`${t.collection} IS NOT NULL`),
    index("idx_products_umbrella_type")
      .on(t.umbrellaType)
      .where(sql`${t.umbrellaType} IS NOT NULL`),
    index("idx_products_umbrella_shape")
      .on(t.umbrellaShape)
      .where(sql`${t.umbrellaShape} IS NOT NULL`),
    index("idx_products_seat_type")
      .on(t.seatType)
      .where(sql`${t.seatType} IS NOT NULL`),
    check(
      "products_pricing_mode_check",
      sql`${t.pricingMode} IN ('fixed', 'cost_plus_markup', 'msrp_minus_dealer_rate')`,
    ),
    check(
      "products_seat_type_check",
      sql`${t.seatType} IS NULL OR ${t.seatType} IN ('Sling', 'Cushion', 'Strap', 'Wicker Weave', 'Solid', 'Padded Sling')`,
    ),
    check(
      "products_umbrella_type_check",
      sql`${t.umbrellaType} IS NULL OR ${t.umbrellaType} IN ('Cantilever', 'Market', 'Specialty', 'Beach')`,
    ),
    check(
      "products_umbrella_shape_check",
      sql`${t.umbrellaShape} IS NULL OR ${t.umbrellaShape} IN ('Octagon', 'Square', 'Rectangle', 'Round')`,
    ),
    check(
      "products_lift_mechanism_check",
      sql`${t.liftMechanism} IS NULL OR ${t.liftMechanism} IN ('Crank', 'Manual', 'Pulley', 'Quad Pulley')`,
    ),
    check(
      "products_tilt_mechanism_check",
      sql`${t.tiltMechanism} IS NULL OR ${t.tiltMechanism} IN ('Auto', 'Collar', 'Push Button', 'Glide', 'Rotational', 'None')`,
    ),
    check(
      "products_pole_material_check",
      sql`${t.poleMaterial} IS NULL OR ${t.poleMaterial} IN ('Aluminum', 'Fiberglass', 'Wood', 'Teak', 'Steel')`,
    ),
  ],
);

// Many-to-many product ↔ material junction. Replaces the former single
// products.material_id FK so a product can carry multiple materials
// (e.g. teak top + aluminum frame). ON DELETE RESTRICT on material_id
// prevents deleting a material still referenced by products.
export const productMaterialsTable = pgTable(
  "product_materials",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    materialId: integer("material_id")
      .notNull()
      .references(() => materialsTable.id, { onDelete: "restrict" }),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("product_materials_unique").on(t.productId, t.materialId),
    index("idx_product_materials_product_id").on(t.productId),
    index("idx_product_materials_material_id").on(t.materialId),
  ],
);

export const insertProductMaterialSchema = createInsertSchema(
  productMaterialsTable,
).omit({ id: true, createdAt: true });
export type InsertProductMaterial = z.infer<typeof insertProductMaterialSchema>;
export type ProductMaterial = typeof productMaterialsTable.$inferSelect;

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
    // When NULL, image applies to the whole model (shared across variants).
    // When set, image is finish-specific (e.g. UM810-00 bronze frame photo).
    variantId: integer("variant_id").references(
      () => productVariantsTable.id,
      { onDelete: "cascade" },
    ),
    url: text("url").notNull(),
    altText: text("alt_text"),
    isPrimary: boolean("is_primary").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    // 'gallery' = main product photos shown in the carousel.
    // 'spec'    = technical drawing / dimensions illustration shown in the
    //             specifications section, NOT in the gallery carousel.
    // Vendor data load currently produces both kinds; admin upload UI will
    // expose the kind picker in a follow-up.
    imageKind: text("image_kind").notNull().default("gallery"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("product_images_product_id_idx").on(t.productId),
    index("product_images_variant_id_idx").on(t.variantId),
    index("product_images_kind_idx").on(t.productId, t.imageKind),
    // Make image inserts idempotent for both the vendor loader (deterministic
    // /objects/vendor-imports/<file>.png paths) and future admin upload flows
    // (each upload returns a fresh /objects/uploads/<uuid> path, so this is
    // never a problem in practice but cheaply rules out double-insert races).
    uniqueIndex("product_images_product_url_uq").on(t.productId, t.url),
    check(
      "product_images_kind_check",
      sql`${t.imageKind} IN ('gallery', 'spec')`,
    ),
  ],
);

export const insertProductImageSchema = createInsertSchema(
  productImagesTable,
).omit({ id: true, createdAt: true });
export type InsertProductImage = z.infer<typeof insertProductImageSchema>;
export type ProductImage = typeof productImagesTable.$inferSelect;

// Inventory is tracked at the (product, variant, fabric) granularity — the
// same physical SKU. A flat product with no variants and no per-fabric
// stocking has a single row with both nullable refs NULL. The unique index
// uses NULLS NOT DISTINCT so each variant+fabric combination (including the
// all-null case) gets exactly one row. Composite FKs guarantee that a chosen
// variant_id belongs to product_id and that a chosen fabric_id is one of the
// product's configured fabric options.
export const inventoryTable = pgTable(
  "inventory",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    variantId: integer("variant_id").references(
      () => productVariantsTable.id,
      { onDelete: "cascade" },
    ),
    fabricId: integer("fabric_id").references(() => fabricsTable.id, {
      onDelete: "cascade",
    }),
    onHand: integer("on_hand").notNull().default(0),
    onHold: integer("on_hold").notNull().default(0),
    reorderThreshold: integer("reorder_threshold").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // One row per (product, variant, fabric) tuple. The actual DB index is
    // declared NULLS NOT DISTINCT (PG 15+) via psql so (1, NULL, NULL)
    // collides with itself and flat-product rows stay unique. The Drizzle
    // version pinned in this workspace doesn't expose `.nullsNotDistinct()`
    // on uniqueIndex; we only use this declaration for runtime query
    // hints — migrations are managed by hand per replit.md — so the SQL
    // option is set in the DB itself, not here.
    uniqueIndex("inventory_pvf_unique").on(
      t.productId,
      t.variantId,
      t.fabricId,
    ),
    // Composite FK: when variant_id is set, (product_id, variant_id) must
    // reference an actual row in product_variants. MATCH SIMPLE (default)
    // skips the check when variant_id is NULL, which is exactly what we want
    // for product-scoped rows.
    foreignKey({
      name: "inventory_product_variant_fk",
      columns: [t.productId, t.variantId],
      foreignColumns: [
        productVariantsTable.productId,
        productVariantsTable.id,
      ],
    }).onDelete("cascade"),
  ],
);

export const insertInventorySchema = createInsertSchema(inventoryTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertInventory = z.infer<typeof insertInventorySchema>;
export type Inventory = typeof inventoryTable.$inferSelect;
