/**
 * Syncs product_images rows for specific product IDs from dev → prod.
 * Deletes existing prod rows for those products, then copies dev rows.
 *
 * Run: ALLOW_PROD=1 DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/syncProductImagesToProd.ts
 */
import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import { db as devDb, productsTable, productImagesTable } from "@workspace/db";

const PROD_URL = process.env.DATABASE_URL;
const ALLOW_PROD = process.env.ALLOW_PROD === "1";

if (!PROD_URL || !PROD_URL.includes("neon")) {
  console.error("Set DATABASE_URL to prod (neon) and ALLOW_PROD=1");
  process.exit(1);
}
if (!ALLOW_PROD) {
  console.error("Set ALLOW_PROD=1 to confirm prod write");
  process.exit(1);
}

const TARGET_SKUS = ["SW5801-CT", "SW5801-7B", "SW5801-ET", "CH240-PD"];

async function main() {
  // Fetch dev rows
  const devProducts = await devDb
    .select({ id: productsTable.id, sku: productsTable.sku })
    .from(productsTable)
    .where(inArray(productsTable.sku, TARGET_SKUS));

  const devProductIds = devProducts.map((p) => p.id);
  console.log("Dev product IDs:", devProductIds);

  const devImages = await devDb
    .select()
    .from(productImagesTable)
    .where(inArray(productImagesTable.productId, devProductIds));

  console.log(`Found ${devImages.length} image row(s) in dev`);

  // Connect to prod
  const prodClient = postgres(PROD_URL);
  const prodDb = drizzle(prodClient);

  // Delete existing prod image rows for these products
  const deleted = await prodDb
    .delete(productImagesTable)
    .where(inArray(productImagesTable.productId, devProductIds))
    .returning({ id: productImagesTable.id });

  console.log(`Deleted ${deleted.length} existing prod image row(s)`);

  // Insert dev rows into prod
  if (devImages.length > 0) {
    await prodDb.insert(productImagesTable).values(devImages);
    console.log(`Inserted ${devImages.length} image row(s) into prod`);
  }

  for (const img of devImages) {
    const sku = devProducts.find((p) => p.id === img.productId)?.sku ?? "?";
    console.log(`  [${sku}] ${img.url} (primary=${img.isPrimary})`);
  }

  await prodClient.end();
  console.log("\nDone.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
