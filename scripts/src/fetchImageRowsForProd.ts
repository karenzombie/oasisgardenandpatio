import { db } from "@workspace/db";
import { productsTable, productImagesTable } from "@workspace/db/schema";
import { inArray } from "drizzle-orm";

const TARGET_SKUS = ["SW5801-CT", "SW5801-7B", "SW5801-ET", "CH240-PD"];

async function main() {
  const prods = await db
    .select({ id: productsTable.id, sku: productsTable.sku })
    .from(productsTable)
    .where(inArray(productsTable.sku, TARGET_SKUS));
  const ids = prods.map((p) => p.id);
  const imgs = await db
    .select()
    .from(productImagesTable)
    .where(inArray(productImagesTable.productId, ids));
  console.log(JSON.stringify({ prods, imgs }, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
