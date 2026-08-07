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
import { productsTable } from "./products";
import { cartItemsTable } from "./cart";
import { orderItemsTable } from "./orders";

// ---------------------------------------------------------------------------
// Product add-on options (selectable extras attached to a product line item)
// ---------------------------------------------------------------------------
// A net-new, fully admin-editable subsystem for product-level add-ons — the
// first consumer is the Marella Resort Cabana wall selector (MLA-FW/SW/HC +
// the flat MLA-8ST2 replacement stem). Add-ons are NOT standalone sellable
// products: each row is an optional extra a customer can layer onto the parent
// product's cart/order line.
//
// Pricing is per-row:
//   - pricingMode = 'per_grade': the add-on's price tracks the canopy fabric
//     grade the customer picked; the matching grade row in
//     product_addon_grade_prices supplies MSRP + sale.
//   - pricingMode = 'flat': flatMsrp / flatSalePrice are used directly (no
//     grade rows), e.g. the replacement stem.
//
// Enforced pairing (data-driven, admin-editable): when any selected add-on has
// triggersPairing = true, every add-on with isPairingTarget = true is
// auto-required and added to the line. For Marella, the two walls (FW, SW)
// trigger; the Half Curtains (HC) are the pairing target.

export const productAddonOptionsTable = pgTable(
  "product_addon_options",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    // Vendor/catalog SKU for the add-on (e.g. MLA-FW). Unique per product.
    sku: text("sku").notNull(),
    // Customer-facing display name (e.g. "Full Privacy Tension Wall").
    name: text("name").notNull(),
    // Optional informational copy shown beside the selector image.
    description: text("description"),
    // Selector image (Object Storage path; served via the public proxy). These
    // are intentionally kept OUT of the product gallery.
    imageUrl: text("image_url"),
    // 'per_grade' (price tracks canopy grade) | 'flat' (uses flat* columns).
    pricingMode: text("pricing_mode").notNull().default("per_grade"),
    // Flat pricing — used only when pricingMode = 'flat'.
    flatMsrp: numeric("flat_msrp", { precision: 10, scale: 2 }),
    flatSalePrice: numeric("flat_sale_price", { precision: 10, scale: 2 }),
    // Per-unit cost for flat-priced add-ons (staff-only). Null until set by
    // staff. Never exposed to customers or vendors.
    flatCost: numeric("flat_cost", { precision: 10, scale: 2 }),
    // Pairing flags. Selecting any triggersPairing option auto-requires every
    // isPairingTarget option on the same product.
    triggersPairing: boolean("triggers_pairing").notNull().default(false),
    isPairingTarget: boolean("is_pairing_target").notNull().default(false),
    enabled: boolean("enabled").notNull().default(true),
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
    unique("product_addon_options_product_sku_unique").on(t.productId, t.sku),
    index("product_addon_options_product_idx").on(t.productId),
  ],
);

export const insertProductAddonOptionSchema = createInsertSchema(
  productAddonOptionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductAddonOption = z.infer<
  typeof insertProductAddonOptionSchema
>;
export type ProductAddonOption = typeof productAddonOptionsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Product add-on grade prices (per-grade MSRP + sale for a per_grade add-on)
// ---------------------------------------------------------------------------
// Mirrors variant_grade_prices: one row per (add-on option, fabric grade). The
// customer's canopy fabric grade selects the row that drives the add-on's
// upcharge. Only used for pricingMode = 'per_grade' options.

export const productAddonGradePricesTable = pgTable(
  "product_addon_grade_prices",
  {
    id: serial("id").primaryKey(),
    addonOptionId: integer("addon_option_id")
      .notNull()
      .references(() => productAddonOptionsTable.id, { onDelete: "cascade" }),
    grade: text("grade").notNull(),
    msrp: numeric("msrp", { precision: 10, scale: 2 }).notNull(),
    salePrice: numeric("sale_price", { precision: 10, scale: 2 }).notNull(),
    // Per-grade cost for per_grade add-ons (staff-only). Null until set by
    // staff. Never exposed to customers or vendors.
    cost: numeric("cost", { precision: 10, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("product_addon_grade_prices_option_grade_unique").on(
      t.addonOptionId,
      t.grade,
    ),
    index("product_addon_grade_prices_option_idx").on(t.addonOptionId),
  ],
);

export const insertProductAddonGradePriceSchema = createInsertSchema(
  productAddonGradePricesTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductAddonGradePrice = z.infer<
  typeof insertProductAddonGradePriceSchema
>;
export type ProductAddonGradePrice =
  typeof productAddonGradePricesTable.$inferSelect;

// ---------------------------------------------------------------------------
// Cart item add-ons (which add-ons are attached to a cart line)
// ---------------------------------------------------------------------------
// Carts aren't a historical record, but we snapshot unitPrice so the cart
// display stays stable and exactly matches what gets charged at checkout. The
// per-unit price is resolved at add time from the canopy grade (per_grade) or
// the flat price. cart_items.addon_signature dedups lines that differ only by
// their add-on set.

export const cartItemAddonsTable = pgTable(
  "cart_item_addons",
  {
    id: serial("id").primaryKey(),
    cartItemId: integer("cart_item_id")
      .notNull()
      .references(() => cartItemsTable.id, { onDelete: "cascade" }),
    addonOptionId: integer("addon_option_id")
      .notNull()
      .references(() => productAddonOptionsTable.id, { onDelete: "restrict" }),
    // Per-unit (per parent-line-unit) charged price for this add-on.
    unitPrice: numeric("unit_price", { precision: 10, scale: 2 }).notNull(),
    // How many of this add-on are attached per parent-line unit. Usually 1, but
    // a pairing target (Marella half curtains) requires one pair PER triggering
    // wall, so two walls (FW + SW) yield quantity = 2 for the HC row.
    quantity: integer("quantity").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("cart_item_addons_item_option_unique").on(
      t.cartItemId,
      t.addonOptionId,
    ),
    index("cart_item_addons_cart_item_idx").on(t.cartItemId),
  ],
);

export const insertCartItemAddonSchema = createInsertSchema(
  cartItemAddonsTable,
).omit({ id: true, createdAt: true });
export type InsertCartItemAddon = z.infer<typeof insertCartItemAddonSchema>;
export type CartItemAddon = typeof cartItemAddonsTable.$inferSelect;

// ---------------------------------------------------------------------------
// Order item add-ons (immutable snapshot of add-ons on a placed order line)
// ---------------------------------------------------------------------------
// Like order_items snapshots: once written, these survive later catalog/price
// edits. addonOptionId is nullable + ON DELETE SET NULL so the snapshot
// outlives a deleted option. The money fields are the source of truth for the
// order's add-on amounts.

export const orderItemAddonsTable = pgTable(
  "order_item_addons",
  {
    id: serial("id").primaryKey(),
    orderItemId: integer("order_item_id")
      .notNull()
      .references(() => orderItemsTable.id, { onDelete: "cascade" }),
    addonOptionId: integer("addon_option_id").references(
      () => productAddonOptionsTable.id,
      { onDelete: "set null" },
    ),
    addonSkuSnapshot: text("addon_sku_snapshot").notNull(),
    addonNameSnapshot: text("addon_name_snapshot").notNull(),
    // Canopy grade used to price a per_grade add-on at order time; null for
    // flat-priced add-ons.
    gradeSnapshot: text("grade_snapshot"),
    unitMsrpSnapshot: numeric("unit_msrp_snapshot", {
      precision: 10,
      scale: 2,
    }),
    unitPriceSnapshot: numeric("unit_price_snapshot", {
      precision: 10,
      scale: 2,
    }).notNull(),
    // Quantity mirrors the parent order line's quantity (one wall per cabana).
    quantity: integer("quantity").notNull(),
    // Line amount for this add-on = unitPriceSnapshot * quantity.
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    // Per-unit cost frozen at add-on line creation (staff-only). Resolved once
    // from the add-on option's flat_cost or per-grade cost at checkout time.
    // Null for pre-existing lines (no backfill) and when cost cannot resolve.
    // Never exposed to customers or vendors.
    unitCostSnapshot: numeric("unit_cost_snapshot", {
      precision: 10,
      scale: 2,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("order_item_addons_order_item_idx").on(t.orderItemId)],
);

export const insertOrderItemAddonSchema = createInsertSchema(
  orderItemAddonsTable,
).omit({ id: true, createdAt: true });
export type InsertOrderItemAddon = z.infer<typeof insertOrderItemAddonSchema>;
export type OrderItemAddon = typeof orderItemAddonsTable.$inferSelect;
