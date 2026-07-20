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

export const manufacturersTable = pgTable("manufacturers", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  logoUrl: text("logo_url"),
  website: text("website"),
  displayOrder: integer("display_order").notNull().default(0),
  // Default dealer discount % off MSRP (e.g. 50.00 = dealer pays 50% of
  // list). Used by the pricing helper when a product's
  // pricingMode = 'msrp_minus_dealer_rate'. Optional — products may also
  // override or use a different mode.
  dealerRate: numeric("dealer_rate", { precision: 5, scale: 2 }),
  // Customer-facing sale discount % off MSRP (e.g. 10.00 = customer pays 90%
  // of MSRP). Stored in the same percent units as dealerRate (10, not 0.10).
  // This is DISTINCT from dealerRate (a cost figure for what the dealer pays);
  // saleDiscountRate is only used to derive product_finish_options.upchargeSale
  // from upchargeMsrp. Null means no discount (sale upcharge = MSRP upcharge).
  saleDiscountRate: numeric("sale_discount_rate", { precision: 5, scale: 2 }),
  // Contact / order routing
  addressLine1: text("address_line1"),
  addressLine2: text("address_line2"),
  city: text("city"),
  state: text("state"),
  postalCode: text("postal_code"),
  country: text("country"),
  phone: text("phone"),
  fax: text("fax"),
  orderEmail: text("order_email"),
  salesEmail: text("sales_email"),
  // How vendor orders are delivered. 'email' | 'fax' | 'manual'
  orderMethod: text("order_method").notNull().default("manual"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const manufacturerContactsTable = pgTable(
  "manufacturer_contacts",
  {
    id: serial("id").primaryKey(),
    manufacturerId: integer("manufacturer_id")
      .notNull()
      .references(() => manufacturersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    phone: text("phone"),
    role: text("role"),
    isPrimary: boolean("is_primary").notNull().default(false),
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
    index("manufacturer_contacts_manufacturer_id_idx").on(t.manufacturerId),
  ],
);

export const insertManufacturerContactSchema = createInsertSchema(
  manufacturerContactsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertManufacturerContact = z.infer<
  typeof insertManufacturerContactSchema
>;
export type ManufacturerContact =
  typeof manufacturerContactsTable.$inferSelect;

export const insertManufacturerSchema = createInsertSchema(
  manufacturersTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertManufacturer = z.infer<typeof insertManufacturerSchema>;
export type Manufacturer = typeof manufacturersTable.$inferSelect;
