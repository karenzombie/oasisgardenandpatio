import {
  pgTable,
  serial,
  text,
  boolean,
  timestamp,
  integer,
  numeric,
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
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertManufacturerSchema = createInsertSchema(
  manufacturersTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertManufacturer = z.infer<typeof insertManufacturerSchema>;
export type Manufacturer = typeof manufacturersTable.$inferSelect;
