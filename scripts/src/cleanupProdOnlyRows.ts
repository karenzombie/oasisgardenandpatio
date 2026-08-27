/**
 * Deletes prod-only catalog rows that don't exist in dev, so the subsequent
 * dev→prod sync produces an exact match. The upsert-only dump (INSERT … ON
 * CONFLICT) never deletes rows, so prod accumulates orphaned rows when dev
 * has removed or replaced items (e.g., duplicate fabrics merged, old series
 * superseded by corrected ones).
 *
 * Safe because all affected FKs have ON DELETE CASCADE to their option/junction
 * tables, and those tables are re-populated from dev in the next step.
 */
export {};

import pg from "pg";

const devClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prodClient = new pg.Client({ connectionString: process.env.PROD_DATABASE_URL });

async function getIds(client: pg.Client, table: string): Promise<Set<number>> {
  const res = await client.query(`SELECT id FROM "${table}"`);
  return new Set(res.rows.map((r) => r.id as number));
}

async function deleteWhereNotIn(
  client: pg.Client,
  table: string,
  keepIds: Set<number>,
): Promise<number> {
  const all = await client.query(`SELECT id FROM "${table}"`);
  const toDelete = all.rows.filter((r) => !keepIds.has(r.id as number));
  if (toDelete.length === 0) return 0;
  const ids = toDelete.map((r) => r.id).join(",");
  console.log(`  → detected ${toDelete.length} prod-only rows in ${table} (ids: ${ids})`);
  const details = await client.query(`SELECT id, name FROM "${table}" WHERE id IN (${ids}) ORDER BY id`);
  for (const row of details.rows) {
    console.log(`    ${table} ${row.id}: ${row.name ?? "(unnamed)"}`);
  }
  if (process.env.APPROVE_PROD_CATALOG_DELETIONS !== "1") {
    throw new Error(
      `Approval required before deleting prod-only ${table} rows. ` +
        "Review the listed records and rerun with APPROVE_PROD_CATALOG_DELETIONS=1 only after explicit user approval.",
    );
  }
  console.log(`  → deleting approved prod-only rows from ${table}`);
  await client.query(`DELETE FROM "${table}" WHERE id IN (${ids})`);
  return toDelete.length;
}

async function main() {
  await devClient.connect();
  await prodClient.connect();

  console.log("\n[Cleanup] Removing prod-only catalog rows not present in dev…");

  const devFabrics = await getIds(devClient, "fabrics");
  const deletedFabrics = await deleteWhereNotIn(prodClient, "fabrics", devFabrics);

  const devFinishes = await getIds(devClient, "finishes");
  const deletedFinishes = await deleteWhereNotIn(prodClient, "finishes", devFinishes);

  // No prod-only products, materials, categories, manufacturers, or finish_collections
  // (verified by diff before publish). If any appear in the future this script will
  // catch them — just add them here.

  const devProducts = await getIds(devClient, "products");
  const deletedProducts = await deleteWhereNotIn(prodClient, "products", devProducts);

  await devClient.end();
  await prodClient.end();

  const total = deletedFabrics + deletedFinishes + deletedProducts;
  console.log(`[Cleanup] Done. ${total} rows removed (${deletedFabrics} fabrics, ${deletedFinishes} finishes, ${deletedProducts} products).\n`);

  if (total > 0) {
    console.log("  Cascading deletes cleaned up associated option/junction rows.");
    console.log("  Next step (dumpDevDataForProd + applyDataToProd) will repopulate from dev.");
  }
}

main().catch((err) => {
  console.error("Cleanup failed:", err);
  process.exit(1);
});
