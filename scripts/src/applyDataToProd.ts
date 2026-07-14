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

// Upsert-only sync: INSERT ... ON CONFLICT (id) DO UPDATE.
// No TRUNCATE — this preserves all production transactional data
// (orders, order_items, carts, cart_items, customers, users, inventory, etc.).
// The dump already wraps statements in BEGIN;/COMMIT; with ON CONFLICT.
const sql = rawSql;
console.log(`Loaded SQL: ${sql.length.toLocaleString()} bytes (upsert-only, no TRUNCATE)`);

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
  UNION ALL SELECT 'product_umbrella_sizes', COUNT(*)::int, NULL FROM product_umbrella_sizes
  ORDER BY tbl;
`);
console.log("\nProduction DB counts after sync:");
for (const row of checks.rows) {
  const extra = row.with_url !== null ? `  (with image URL: ${row.with_url})` : "";
  console.log(`  ${row.tbl}: ${row.cnt}${extra}`);
}
await verifyClient.end();
