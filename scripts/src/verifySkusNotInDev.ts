process.env.DATABASE_URL = process.env.DATABASE_URL || "";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const skuList = "'134444F','134466F','134488F','1344110F','134444B','134466B','134488B','1344110B','134444BR','134466BR','134488BR','1344110BR','91006','006086'";
  const bySku = await db.execute(sql.raw(`
    SELECT p.id, p.sku, p.name, p.collection, m.name as manufacturer, p.category_id, p.is_active, p.available_online
    FROM products p
    LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
    WHERE p.sku IN (${skuList})
    ORDER BY p.sku
  `));
  console.log("Exact SKU matches in dev:", JSON.stringify(bySku.rows, null, 2));

  // Also check case-insensitive / whitespace variants just in case
  const looseMatch = await db.execute(sql.raw(`
    SELECT p.id, p.sku, p.name, m.name as manufacturer
    FROM products p
    LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
    WHERE UPPER(TRIM(p.sku)) IN (${skuList.toUpperCase()})
    ORDER BY p.sku
  `));
  console.log("Loose (case/trim-insensitive) SKU matches in dev:", JSON.stringify(looseMatch.rows, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
