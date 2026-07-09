process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const tables = ['products','product_variants','product_finish_options','product_finish_pools','finishes','orders','customers','users','vendor_orders'];
  for (const t of tables) {
    const r = await db.execute(sql.raw(`SELECT count(*) FROM ${t}`));
    console.log(`heliumdb ${t}:`, JSON.stringify(r.rows));
  }
  const maxc = await db.execute(sql`SELECT max(created_at) as max_created, max(updated_at) as max_updated FROM products`);
  console.log("heliumdb max created/updated:", JSON.stringify(maxc.rows));
}
main().then(() => process.exit(0)).catch((e) => { console.error("ERROR:", e); process.exit(1); });
