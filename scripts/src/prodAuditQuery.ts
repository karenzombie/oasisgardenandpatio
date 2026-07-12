import pg from "pg";

async function auditProd() {
  const client = new pg.Client({ connectionString: process.env.PROD_DATABASE_URL });
  await client.connect();

  const customers = await client.query("SELECT id, first_name, last_name, email, created_at FROM customers ORDER BY id");
  console.log("\n=== PROD CUSTOMERS ===");
  for (const r of customers.rows) {
    console.log(`cust ${r.id}: ${r.first_name} ${r.last_name} | ${r.email} | ${r.created_at}`);
  }

  const users = await client.query("SELECT id, name, email, role FROM users ORDER BY id");
  console.log("\n=== PROD USERS ===");
  for (const r of users.rows) {
    console.log(`user ${r.id}: ${r.name} | ${r.email} | role=${r.role}`);
  }

  const orders = await client.query("SELECT id, order_number, status, customer_id, created_at FROM orders ORDER BY id");
  console.log("\n=== PROD ORDERS ===");
  for (const r of orders.rows) {
    console.log(`order ${r.id}: ${r.order_number} | ${r.status} | cust=${r.customer_id} | ${r.created_at}`);
  }

  const fabrics = await client.query("SELECT COUNT(*) as cnt FROM fabrics");
  const prodFabrics = fabrics.rows[0].cnt;
  console.log(`\nProd fabrics: ${prodFabrics}`);

  const fabricsWithCodes = await client.query("SELECT COUNT(*) as cnt FROM fabrics WHERE availability_codes IS NOT NULL AND availability_codes != ''");
  console.log(`Prod fabrics with availability_codes: ${fabricsWithCodes.rows[0].cnt}`);

  const pfo = await client.query("SELECT COUNT(*) as cnt FROM product_fabric_options");
  console.log(`Prod product_fabric_options: ${pfo.rows[0].cnt}`);

  const pools = await client.query("SELECT COUNT(*) as cnt FROM product_fabric_pools");
  console.log(`Prod product_fabric_pools: ${pools.rows[0].cnt}`);

  await client.end();
}

async function auditDev() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const fabrics = await client.query("SELECT COUNT(*) as cnt FROM fabrics");
  console.log(`Dev fabrics: ${fabrics.rows[0].cnt}`);

  const fabricsWithCodes = await client.query("SELECT COUNT(*) as cnt FROM fabrics WHERE availability_codes IS NOT NULL AND availability_codes != ''");
  console.log(`Dev fabrics with availability_codes: ${fabricsWithCodes.rows[0].cnt}`);

  const pfo = await client.query("SELECT COUNT(*) as cnt FROM product_fabric_options");
  console.log(`Dev product_fabric_options: ${pfo.rows[0].cnt}`);

  const pools = await client.query("SELECT COUNT(*) as cnt FROM product_fabric_pools");
  console.log(`Dev product_fabric_pools: ${pools.rows[0].cnt}`);

  const products = await client.query("SELECT COUNT(*) as cnt FROM products");
  console.log(`Dev products: ${products.rows[0].cnt}`);

  await client.end();
}

auditProd().then(() => auditDev()).catch(console.error);
