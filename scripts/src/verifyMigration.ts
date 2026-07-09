process.env.DATABASE_URL = process.env.DATABASE_URL || "";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const skuList = "'134444F','134466F','134488F','1344110F','134444B','134466B','134488B','1344110B','134444BR','134466BR','134488BR','1344110BR','91006','006086'";
  const products = await db.execute(sql.raw(`
    SELECT id, sku, name, collection, is_active, available_online FROM products WHERE sku IN (${skuList}) ORDER BY sku
  `));
  console.log(`Products found: ${products.rows.length} / 14`);
  console.table(products.rows);

  const ids = products.rows.map((r: any) => r.id).join(",");

  const pfoCount = await db.execute(sql.raw(`SELECT product_id, count(*) as cnt FROM product_finish_options WHERE product_id IN (${ids}) GROUP BY product_id ORDER BY product_id`));
  console.log("Finish options per product:", JSON.stringify(pfoCount.rows));

  const pfpCount = await db.execute(sql.raw(`SELECT product_id FROM product_finish_pools WHERE product_id IN (${ids}) ORDER BY product_id`));
  console.log("Finish pool rows for products:", JSON.stringify(pfpCount.rows));

  const totalPfo = await db.execute(sql.raw(`SELECT count(*) as c FROM product_finish_options WHERE product_id IN (${ids})`));
  const totalPfp = await db.execute(sql.raw(`SELECT count(*) as c FROM product_finish_pools WHERE product_id IN (${ids})`));
  console.log("Total pfo:", JSON.stringify(totalPfo.rows), "Total pfp:", JSON.stringify(totalPfp.rows));

  const seqCheck = await db.execute(sql`SELECT MAX(id) as max_id FROM products`);
  console.log("New max product id (sequence should exceed this):", JSON.stringify(seqCheck.rows));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
