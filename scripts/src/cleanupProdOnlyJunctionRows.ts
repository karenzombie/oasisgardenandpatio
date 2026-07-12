/**
 * Deletes prod-only junction rows (product_fabric_options / product_finish_options)
 * that don't exist in dev, so the subsequent dev→prod sync produces an exact match.
 */
export {};

import pg from "pg";

const devClient = new pg.Client({ connectionString: process.env.DATABASE_URL });
const prodClient = new pg.Client({ connectionString: process.env.PROD_DATABASE_URL });

async function deleteOrphanedJunction(
  table: string,
  keyCols: string[],
): Promise<number> {
  // Fetch all natural-key tuples from dev
  const cols = keyCols.map(c => `"${c}"`).join(", ");
  const devRes = await devClient.query(`SELECT ${cols} FROM "${table}"`);
  const devKeys = new Set(devRes.rows.map((r) => keyCols.map((c) => r[c]).join("|")));

  // Fetch prod rows
  const prodRes = await prodClient.query(`SELECT id, ${cols} FROM "${table}"`);
  const toDelete: number[] = [];
  for (const row of prodRes.rows) {
    const key = keyCols.map((c) => row[c]).join("|");
    if (!devKeys.has(key)) {
      toDelete.push(row.id as number);
    }
  }

  if (toDelete.length === 0) return 0;

  console.log(`  → deleting ${toDelete.length} prod-only rows from ${table}`);

  // Batch delete by id
  const BATCH = 1000;
  let total = 0;
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const chunk = toDelete.slice(i, i + BATCH);
    await prodClient.query(`DELETE FROM "${table}" WHERE id IN (${chunk.join(",")})`);
    total += chunk.length;
  }
  return total;
}

async function main() {
  await devClient.connect();
  await prodClient.connect();

  console.log("\n[Cleanup Junction] Removing prod-only junction rows not present in dev…");

  const deletedPfo = await deleteOrphanedJunction("product_fabric_options", ["product_id", "fabric_id"]);
  const deletedPfoFinishes = await deleteOrphanedJunction("product_finish_options", ["product_id", "finish_id"]);

  await devClient.end();
  await prodClient.end();

  console.log(`[Cleanup Junction] Done. ${deletedPfo} product_fabric_options + ${deletedPfoFinishes} product_finish_options removed.\n`);
}

main().catch((err) => {
  console.error("Junction cleanup failed:", err);
  process.exit(1);
});
