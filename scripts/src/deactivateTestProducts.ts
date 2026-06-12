/**
 * Deactivates known test/placeholder products that should not be
 * customer-visible. Idempotent — safe to re-run.
 *
 * Usage: DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/deactivateTestProducts.ts
 */
import { inArray } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";

const TEST_SKUS = ["Test-CUSH-CLAS"];

async function main() {
  const result = await db
    .update(productsTable)
    .set({ isActive: false })
    .where(inArray(productsTable.sku, TEST_SKUS))
    .returning({ sku: productsTable.sku, name: productsTable.name });

  if (result.length === 0) {
    console.log("No test products found — nothing to deactivate.");
  } else {
    for (const p of result) {
      console.log(`  Deactivated: ${p.sku} — ${p.name}`);
    }
    console.log(`Done. deactivated=${result.length}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
