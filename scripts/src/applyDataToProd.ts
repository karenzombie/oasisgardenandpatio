/**
 * Applies ./dev-data-for-prod.sql to the production database.
 * Connects via PROD_DATABASE_URL. Read-only against dev DB.
 */
export {};

import { readFileSync } from "node:fs";
import pg from "pg";

const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error("PROD_DATABASE_URL is not set");
  process.exit(1);
}

const rawSql = readFileSync("./dev-data-for-prod.sql", "utf8");

// Prepend a TRUNCATE CASCADE so dev IDs can be inserted cleanly.
// User confirmed prod has no real customer/inventory data to preserve.
// CASCADE will wipe: inventory, cart_items, order_items, orders,
// wishlist_items, vendor_orders, product_attributes,
// product_fabric_options, product_fabric_pools, product_variants,
// product_images, products, fabrics, categories, manufacturers.
const truncate = `
TRUNCATE
  manufacturers,
  categories,
  fabrics,
  products,
  product_variants,
  product_images,
  product_attributes,
  product_fabric_pools,
  product_fabric_options
RESTART IDENTITY CASCADE;
`;

// Insert the TRUNCATE right after the BEGIN; line of the dump.
const sql = rawSql.replace("BEGIN;", `BEGIN;\n${truncate}`);
console.log(`Loaded SQL: ${sql.length.toLocaleString()} bytes (TRUNCATE CASCADE prepended)`);

const client = new pg.Client({ connectionString: url });
await client.connect();
console.log("Connected to production database.");

const start = Date.now();
try {
  await client.query(sql);
  console.log(`✓ Sync complete in ${((Date.now() - start) / 1000).toFixed(1)}s`);
} catch (err) {
  console.error("✗ Sync failed:", err);
  process.exitCode = 1;
} finally {
  await client.end();
}

// Verification queries
const verifyClient = new pg.Client({ connectionString: url });
await verifyClient.connect();
const checks = await verifyClient.query<{ tbl: string; cnt: number; with_url: number | null }>(`
  SELECT 'fabrics' tbl, COUNT(*)::int cnt, COUNT(swatch_image_url)::int with_url FROM fabrics
  UNION ALL SELECT 'products', COUNT(*)::int, NULL FROM products
  UNION ALL SELECT 'product_images', COUNT(*)::int, COUNT(url)::int FROM product_images
  UNION ALL SELECT 'manufacturers', COUNT(*)::int, NULL FROM manufacturers
  UNION ALL SELECT 'categories', COUNT(*)::int, NULL FROM categories
  ORDER BY tbl;
`);
console.log("\nProduction DB counts after sync:");
for (const row of checks.rows) {
  const extra = row.with_url !== null ? `  (with image URL: ${row.with_url})` : "";
  console.log(`  ${row.tbl}: ${row.cnt}${extra}`);
}
await verifyClient.end();
