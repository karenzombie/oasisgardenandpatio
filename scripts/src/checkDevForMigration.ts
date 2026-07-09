process.env.DATABASE_URL = process.env.DATABASE_URL || "";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const idList = "6126,6120,6124,6116,6117,6121,6113,6118,6122,6114,6119,6123,6115,6125";
  const existing = await db.execute(sql.raw(`SELECT id, sku FROM products WHERE id IN (${idList})`));
  console.log("Existing conflicting ids in dev:", JSON.stringify(existing.rows));

  const skuList = "'134444F','134466F','134488F','1344110F','134444B','134466B','134488B','1344110B','134444BR','134466BR','134488BR','1344110BR','91006','006086'";
  const bySku = await db.execute(sql.raw(`SELECT id, sku FROM products WHERE sku IN (${skuList})`));
  console.log("Existing by sku in dev:", JSON.stringify(bySku.rows));

  const cats = await db.execute(sql`SELECT id, name, slug FROM categories WHERE id IN (47,52,54)`);
  console.log("Categories in dev:", JSON.stringify(cats.rows));

  const mfr = await db.execute(sql`SELECT id, name FROM manufacturers WHERE id = 16`);
  console.log("Manufacturer 16 in dev:", JSON.stringify(mfr.rows));

  const maxProdId = await db.execute(sql`SELECT MAX(id) as max_id FROM products`);
  console.log("Max product id in dev:", JSON.stringify(maxProdId.rows));

  const maxPfoId = await db.execute(sql`SELECT MAX(id) as max_id FROM product_finish_options`);
  console.log("Max product_finish_options id in dev:", JSON.stringify(maxPfoId.rows));

  const maxPfpId = await db.execute(sql`SELECT MAX(id) as max_id FROM product_finish_pools`);
  console.log("Max product_finish_pools id in dev:", JSON.stringify(maxPfpId.rows));

  const finishes = await db.execute(sql`SELECT id, name FROM finishes WHERE id IN (290,291,292,293,294,295,296,297,298,299,300)`);
  console.log("Finishes 290-300 in dev:", JSON.stringify(finishes.rows));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
