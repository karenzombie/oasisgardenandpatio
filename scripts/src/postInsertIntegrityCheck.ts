process.env.DATABASE_URL = process.env.DATABASE_URL || "";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const dbInfo = await db.execute(sql`SELECT current_database()`);
  console.log("Current DB:", JSON.stringify(dbInfo.rows));

  const idList = "6113,6114,6115,6116,6117,6118,6119,6120,6121,6122,6123,6124,6125,6126";
  const dupCheck = await db.execute(sql.raw(`
    SELECT id, COUNT(*) as cnt FROM products WHERE id IN (${idList}) GROUP BY id HAVING COUNT(*) > 1
  `));
  console.log("Duplicate ID rows (should be empty):", JSON.stringify(dupCheck.rows));

  const rowCount = await db.execute(sql.raw(`SELECT COUNT(*) as c FROM products WHERE id IN (${idList})`));
  console.log("Row count for these 14 ids (should be 14, not more):", JSON.stringify(rowCount.rows));

  const seq = await db.execute(sql`SELECT last_value FROM products_id_seq`);
  console.log("products_id_seq last_value:", JSON.stringify(seq.rows));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
