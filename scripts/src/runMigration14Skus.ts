process.env.DATABASE_URL = process.env.DATABASE_URL || "";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import fs from "fs";

function esc(v: any): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) {
    if (v.length === 0) return "'{}'";
    return `'{${v.map((x) => `"${String(x).replace(/"/g, '\\"')}"`).join(",")}}'`;
  }
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function main() {
  const products = JSON.parse(fs.readFileSync("/tmp/migration_products.json", "utf8"));
  const pfo = JSON.parse(fs.readFileSync("/tmp/migration_pfo.json", "utf8"));
  const pfp = JSON.parse(fs.readFileSync("/tmp/migration_pfp.json", "utf8"));

  await db.transaction(async (tx) => {
    for (const p of products) {
      const cols = Object.keys(p);
      const colList = cols.map((c) => `"${c}"`).join(", ");
      const valList = cols.map((c) => esc(p[c])).join(", ");
      await tx.execute(sql.raw(`INSERT INTO products (${colList}) VALUES (${valList})`));
    }

    for (const f of pfo) {
      const cols = Object.keys(f);
      const colList = cols.map((c) => `"${c}"`).join(", ");
      const valList = cols.map((c) => esc(f[c])).join(", ");
      await tx.execute(sql.raw(`INSERT INTO product_finish_options (${colList}) VALUES (${valList})`));
    }

    for (const p of pfp) {
      const cols = Object.keys(p);
      const colList = cols.map((c) => `"${c}"`).join(", ");
      const valList = cols.map((c) => esc(p[c])).join(", ");
      await tx.execute(sql.raw(`INSERT INTO product_finish_pools (${colList}) VALUES (${valList})`));
    }

    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('products','id'), (SELECT MAX(id) FROM products))`);
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('product_finish_options','id'), (SELECT MAX(id) FROM product_finish_options))`);
    await tx.execute(sql`SELECT setval(pg_get_serial_sequence('product_finish_pools','id'), (SELECT MAX(id) FROM product_finish_pools))`);
  });

  console.log("Migration transaction committed.");
}
main().then(() => process.exit(0)).catch((e) => { console.error("MIGRATION FAILED:", e); process.exit(1); });
