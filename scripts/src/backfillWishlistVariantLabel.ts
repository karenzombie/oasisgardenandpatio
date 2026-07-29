/**
 * Backfill: for any wishlist_items row that has variant_id set but variant_label null,
 * copy the variant name from product_variants.name into variant_label.
 *
 * Run with:
 *   DATABASE_URL=$PROD_DATABASE_URL ALLOW_PROD=1 pnpm --filter @workspace/scripts exec tsx src/backfillWishlistVariantLabel.ts
 */
import { db } from "@workspace/db";
import { wishlistItemsTable } from "@workspace/db/schema";
import { sql, isNotNull, isNull } from "drizzle-orm";

async function main() {
  // Show scope first
  const affected = await db.execute(sql`
    SELECT wi.id, p.name as product_name, pv.variant_name
    FROM wishlist_items wi
    JOIN products p ON p.id = wi.product_id
    JOIN product_variants pv ON pv.id = wi.variant_id
    WHERE wi.variant_id IS NOT NULL
      AND wi.variant_label IS NULL
    ORDER BY wi.id
  `);

  const rows = affected.rows as Array<{ id: number; product_name: string; variant_name: string }>;
  console.log(`Found ${rows.length} wishlist row(s) to backfill:`);
  for (const r of rows) {
    console.log(`  id=${r.id}  "${r.product_name}" → variant_label="${r.variant_name}"`);
  }

  if (rows.length === 0) {
    console.log("Nothing to do.");
    process.exit(0);
  }

  // Update: set variant_label = product_variants.name where missing
  const result = await db.execute(sql`
    UPDATE wishlist_items wi
    SET variant_label = pv.variant_name
    FROM product_variants pv
    WHERE pv.id = wi.variant_id
      AND wi.variant_id IS NOT NULL
      AND wi.variant_label IS NULL
  `);

  console.log(`\nUpdated ${rows.length} row(s). Done.`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
