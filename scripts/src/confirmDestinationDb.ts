process.env.DATABASE_URL = process.env.DATABASE_URL || "";
import { db } from "@workspace/db";
import { sql } from "drizzle-orm";

async function main() {
  const dbInfo = await db.execute(sql`SELECT current_database(), inet_server_addr()::text as host`);
  console.log("Connected to:", JSON.stringify(dbInfo.rows));
  console.log("DATABASE_URL used:", process.env.DATABASE_URL?.replace(/:[^:@]*@/, ":****@"));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
