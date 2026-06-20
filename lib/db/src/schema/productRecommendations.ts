import {
  pgTable,
  serial,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Generic, data-driven map from a "source" product SKU to the SKUs of items
// that are compatible with it (Phase 1: Treasure Garden umbrellas -> bases).
// The feature is intentionally code-free to extend: adding recommendations for
// new manufacturers/product types is a pure data insert. The storefront only
// renders a compatible item when its product row is active AND availableOnline,
// so rows pointing at not-yet-online (or not-yet-created) SKUs are harmless and
// simply stay hidden until that product becomes purchasable online.
export const productRecommendationsTable = pgTable(
  "product_recommendations",
  {
    id: serial("id").primaryKey(),
    // The product whose detail page shows the recommendations.
    sourceSku: text("source_sku").notNull(),
    // A compatible product's SKU (must equal products.sku to render).
    compatibleSku: text("compatible_sku").notNull(),
    // The single "Recommended" pick for this source; sorted first and given a
    // green accent + badge in the UI.
    isRecommended: boolean("is_recommended").notNull().default(false),
    displayOrder: integer("display_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("product_recommendations_source_sku_idx").on(t.sourceSku),
    uniqueIndex("product_recommendations_source_compat_uq").on(
      t.sourceSku,
      t.compatibleSku,
    ),
    // At most one "Recommended" pick per source SKU. Enforced in the DB via a
    // partial unique index created by hand (migrations are managed manually per
    // replit.md): CREATE UNIQUE INDEX product_recommendations_one_rec_per_source_uq
    // ON product_recommendations (source_sku) WHERE is_recommended;
    // The pinned Drizzle version doesn't expose a `.where()` partial-index
    // builder, so this is documented here and applied directly in both DBs.
  ],
);

export const insertProductRecommendationSchema = createInsertSchema(
  productRecommendationsTable,
).omit({ id: true, createdAt: true });
export type InsertProductRecommendation = z.infer<
  typeof insertProductRecommendationSchema
>;
export type ProductRecommendation =
  typeof productRecommendationsTable.$inferSelect;
