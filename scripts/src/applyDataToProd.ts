/**
 * Applies ./dev-data-for-prod.sql to the production database.
 * Connects via PROD_DATABASE_URL. Read-only against dev DB.
 */
export {};

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, unlinkSync } from "node:fs";
import pg from "pg";

const url = process.env.PROD_DATABASE_URL;
if (!url) {
  console.error("PROD_DATABASE_URL is not set");
  process.exit(1);
}

const rawSql = readFileSync("./dev-data-for-prod.sql", "utf8");

// Prepend a TRUNCATE CASCADE so dev IDs can be inserted cleanly.
// User confirmed prod has no real customer/inventory data to preserve.
// CASCADE wipes dependent transactional/user/inventory rows (inventory,
// cart_items, order_items, orders, wishlist_items, vendor_orders, etc.).
// Table list MUST match TABLES_IN_ORDER in dumpDevDataForProd.ts.
const truncate = `
TRUNCATE
  manufacturers,
  materials,
  categories,
  fabrics,
  finish_collections,
  finishes,
  products,
  product_materials,
  product_variants,
  product_images,
  product_attributes,
  product_fabric_pools,
  product_fabric_options,
  product_finish_pools,
  product_finish_options,
  product_finial_options,
  variant_grade_prices,
  product_sets,
  product_set_items,
  product_addon_options,
  product_addon_grade_prices
RESTART IDENTITY CASCADE;
`;

// Insert the TRUNCATE right after the BEGIN; line of the dump.
const sql = rawSql.replace("BEGIN;", `BEGIN;\n${truncate}`);
console.log(`Loaded SQL: ${sql.length.toLocaleString()} bytes (TRUNCATE CASCADE prepended)`);

// Apply via psql -f rather than a single node-pg query: the full-catalog dump
// is ~60k INSERT statements and streaming through psql is far more reliable
// than buffering one giant query string. ON_ERROR_STOP rolls back on any error
// (the dump is wrapped in BEGIN;/COMMIT;).
const tmpPath = "./.dev-data-for-prod.apply.sql";
writeFileSync(tmpPath, sql, "utf8");

const start = Date.now();
try {
  execFileSync("psql", [url, "-v", "ON_ERROR_STOP=1", "-q", "-f", tmpPath], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  console.log(`✓ Sync complete in ${((Date.now() - start) / 1000).toFixed(1)}s`);
} catch (err) {
  console.error("✗ Sync failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  try {
    unlinkSync(tmpPath);
  } catch {
    // ignore cleanup failure
  }
}

if (process.exitCode === 1) {
  process.exit(1);
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
  UNION ALL SELECT 'finishes', COUNT(*)::int, NULL FROM finishes
  UNION ALL SELECT 'finish_collections', COUNT(*)::int, NULL FROM finish_collections
  UNION ALL SELECT 'product_finish_options', COUNT(*)::int, NULL FROM product_finish_options
  UNION ALL SELECT 'product_fabric_options', COUNT(*)::int, NULL FROM product_fabric_options
  UNION ALL SELECT 'variant_grade_prices', COUNT(*)::int, NULL FROM variant_grade_prices
  UNION ALL SELECT 'product_materials', COUNT(*)::int, NULL FROM product_materials
  ORDER BY tbl;
`);
console.log("\nProduction DB counts after sync:");
for (const row of checks.rows) {
  const extra = row.with_url !== null ? `  (with image URL: ${row.with_url})` : "";
  console.log(`  ${row.tbl}: ${row.cnt}${extra}`);
}
await verifyClient.end();
