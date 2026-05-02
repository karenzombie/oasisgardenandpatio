import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { productsTable } from "./products";

/**
 * Free-form vendor-supplied model attributes.
 *
 * Three kinds, all on the parent product (NOT per-variant):
 *  - 'feature'         : bullet list of marketing/spec features.
 *                         partName is NULL; value is the feature text.
 *  - 'option'          : optional accessories / compatible items.
 *                         partName is NULL; value is the option text.
 *  - 'replacement_part': aftermarket / service parts.
 *                         partName is the part label (e.g. "Frame",
 *                         "Canopy (SWV)"); value is the part number.
 *
 * The CHECK constraints enforce that part_name is set iff attribute_type
 * is 'replacement_part'. This keeps the customer-facing PDP renderer simple
 * (it can group purely by attribute_type and trust part_name presence).
 *
 * Idempotency for the loader: each run deletes a product's existing
 * attributes inside a transaction and re-inserts the full vendor list, so
 * the spreadsheet remains the source of truth.
 */
export const productAttributesTable = pgTable(
  "product_attributes",
  {
    id: serial("id").primaryKey(),
    productId: integer("product_id")
      .notNull()
      .references(() => productsTable.id, { onDelete: "cascade" }),
    attributeType: text("attribute_type").notNull(),
    partName: text("part_name"),
    value: text("value").notNull(),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("product_attributes_product_id_idx").on(t.productId),
    index("product_attributes_lookup_idx").on(
      t.productId,
      t.attributeType,
      t.displayOrder,
    ),
    check(
      "product_attributes_type_check",
      sql`${t.attributeType} IN ('feature', 'option', 'replacement_part')`,
    ),
    check(
      "product_attributes_part_name_check",
      sql`(${t.attributeType} = 'replacement_part' AND ${t.partName} IS NOT NULL)
          OR (${t.attributeType} <> 'replacement_part' AND ${t.partName} IS NULL)`,
    ),
  ],
);

export const insertProductAttributeSchema = createInsertSchema(
  productAttributesTable,
).omit({ id: true, createdAt: true });
export type InsertProductAttribute = z.infer<
  typeof insertProductAttributeSchema
>;
export type ProductAttribute = typeof productAttributesTable.$inferSelect;
