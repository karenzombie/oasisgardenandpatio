process.env.DATABASE_URL = process.env.PROD_DATABASE_URL;
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import fs from "fs";

async function main() {
  const r = await db.execute(sql`SELECT sku, name, collection FROM products WHERE sku IS NOT NULL ORDER BY sku`);
  const lines = ["sku,name,collection"];
  for (const row of r.rows as any[]) {
    const name = (row.name ?? "").replace(/"/g, '""');
    lines.push(`${row.sku},"${name}",${row.collection ?? ""}`);
  }
  fs.writeFileSync("/tmp/heliumdb_skus.csv", lines.join("\n"));
  console.log("wrote helium csv, rows:", r.rows.length);
}
main().then(() => process.exit(0)).catch((e) => { console.error("ERROR:", e); process.exit(1); });
