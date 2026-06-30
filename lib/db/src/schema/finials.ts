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

// ---------------------------------------------------------------------------
// Product finial options
// ---------------------------------------------------------------------------
// A finial is the decorative cap at the top of an umbrella pole. Unlike
// finishes/fabrics it is NOT a shared cross-product library — each applicable
// umbrella product (currently a handful of Frankford series) carries its own
// short, text-only list of finial choices. The options are therefore stored
// directly on the product (denormalized), not in a shared catalog table.
//
// A finial is a default-or-required selection like a frame finish: every
// applicable product has exactly one `isDefault` option (pre-selected on the
// PDP) and zero or more alternates. Some alternates carry an upcharge that
// adds to the line price; others are free. The selection is captured on
// cart_items.finialId and snapshotted onto order_items at checkout so vendor
// PDFs and order history survive catalog edits.

export const productFinialOptionsTable = pgTable(
  "product_finial_options",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    // Vendor finial code printed on the PO, e.g. "VF", "BF", "SS-VF", "SS-BF".
    code: text("code").notNull(),
    // Customer-facing name, e.g. "Chrome Vertex", "TPU Classic Ball".
    name: text("name").notNull(),
    // Exactly one option per product should be the default; it is pre-selected
    // on the PDP. When a product has more than one option the customer may
    // switch away from the default.
    isDefault: boolean("is_default").notNull().default(false),
    // Per-(product, finial) upcharge. upchargeMsrp is the list-price surcharge
    // for picking this finial; upchargeSale is the customer-facing discounted
    // surcharge, derived as ceil(upchargeMsrp * 0.90). Both default to 0 (free).
    upchargeMsrp: numeric("upcharge_msrp", { precision: 10, scale: 2 })
      .notNull()
      .default("0"),
    upchargeSale: numeric("upcharge_sale", { precision: 10, scale: 2 })
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
    unique("product_finial_options_product_code_unique").on(
      t.productId,
      t.code,
    ),
    index("product_finial_options_product_idx").on(t.productId),
  ],
);

export const insertProductFinialOptionSchema = createInsertSchema(
  productFinialOptionsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertProductFinialOption = z.infer<
  typeof insertProductFinialOptionSchema
>;
export type ProductFinialOption =
  typeof productFinialOptionsTable.$inferSelect;
