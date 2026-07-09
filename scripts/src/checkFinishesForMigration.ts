process.env.DATABASE_URL = process.env.DATABASE_URL || "";
import { db as heliumDb } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const r = await heliumDb.execute(sql`
    SELECT id, manufacturer_id, name, item_number FROM finishes WHERE manufacturer_id = 16 ORDER BY name
  `);
  console.log("heliumdb (dev) Homecrest finishes:", JSON.stringify(r.rows, null, 2));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
