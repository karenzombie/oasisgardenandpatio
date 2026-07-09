process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const byId = await db.execute(sql`SELECT id, slug, sku, is_active FROM products WHERE id = 6113`);
  console.log("by id:", JSON.stringify(byId.rows));
  const bySku = await db.execute(sql`SELECT id, slug, sku, is_active FROM products WHERE sku = '134444F'`);
  console.log("by sku:", JSON.stringify(bySku.rows));
  const countAll = await db.execute(sql`SELECT count(*) FROM products`);
  console.log("total products:", JSON.stringify(countAll.rows));
  const dbName = await db.execute(sql`SELECT current_database(), inet_server_addr()`);
  console.log("db info:", JSON.stringify(dbName.rows));
}
main().then(() => process.exit(0)).catch((e) => { console.error("ERROR:", e); process.exit(1); });
