import { Client } from "pg";

async function fetchSkus(connStr: string) {
  const client = new Client({ connectionString: connStr });
  await client.connect();
  const res = await client.query(`SELECT sku, name, collection FROM products WHERE sku IS NOT NULL`);
  await client.end();
  const map = new Map<string, { name: string; collection: string | null }>();
  for (const row of res.rows) {
    map.set(row.sku, { name: row.name, collection: row.collection });
  }
  return map;
}

async function main() {
  const neonUrl = process.env.PROD_DATABASE_URL_NEON || process.env.DATABASE_URL_NEON;
  const heliumUrl = process.env.PROD_DATABASE_URL;

  if (!neonUrl) {
    console.log("NEED_NEON_URL");
    return;
  }

  const [neon, helium] = await Promise.all([fetchSkus(neonUrl), fetchSkus(heliumUrl!)]);
  console.log("neon count:", neon.size, "helium count:", helium.size);

  const onlyInNeon: { sku: string; name: string; collection: string | null }[] = [];
  for (const [sku, info] of neon) {
    if (!helium.has(sku)) onlyInNeon.push({ sku, ...info });
  }
  onlyInNeon.sort((a, b) => (a.collection ?? "").localeCompare(b.collection ?? "") || a.sku.localeCompare(b.sku));
  console.log(`\n=== Products in neondb but NOT in heliumdb (${onlyInNeon.length}) ===`);
  for (const p of onlyInNeon) {
    console.log(`${p.sku}\t${p.name}\t${p.collection ?? ""}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error("ERROR:", e); process.exit(1); });
