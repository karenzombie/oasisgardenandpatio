process.env.DATABASE_URL = process.env.DATABASE_URL || "";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import fs from "fs";

async function main() {
  const r = await db.execute(sql`SELECT sku FROM products WHERE sku IS NOT NULL`);
  const heliumSkus = new Set((r.rows as any[]).map((x) => x.sku));
  fs.writeFileSync("/tmp/helium_sku_set.json", JSON.stringify([...heliumSkus]));
  console.log("helium sku count:", heliumSkus.size);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
