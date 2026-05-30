/**
 * Seed Couture Jardin finishes from the product CSV.
 *
 * For each unique finish string in the "finishes" column:
 *   → upsert a row in `finishes` (manufacturer_id=14, no image, no item_number)
 *
 * For each product × its finish list:
 *   → insert rows into `product_finish_options` (idempotent via ON CONFLICT DO NOTHING)
 *
 * No swatch images are available for Couture Jardin; image_url is left null.
 * Re-running is safe — all inserts use ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run seed-couture-jardin-finishes
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { eq, and } from "drizzle-orm";
import {
  db,
  finishesTable,
  productFinishOptionsTable,
  productsTable,
} from "@workspace/db";

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const CSV_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/couture_jardin_products_1780107087804.csv",
);
const MANUFACTURER_ID = 14; // Couture Jardin

type CsvRow = {
  sku: string;
  finishes: string;
};

async function main() {
  const raw = readFileSync(CSV_PATH, "utf8");
  const { data, errors } = Papa.parse<CsvRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length > 0) throw new Error(`CSV parse error: ${JSON.stringify(errors[0])}`);

  const rows = data.filter((r) => r.sku?.trim());
  console.log(`CSV rows: ${rows.length}`);

  // ── 1. Collect all unique finish names ────────────────────────────────────

  const allFinishNames = new Set<string>();
  for (const row of rows) {
    if (!row.finishes?.trim()) continue;
    row.finishes.split(",").map((f) => f.trim()).filter(Boolean).forEach((f) => allFinishNames.add(f));
  }

  console.log(`Unique finish names: ${allFinishNames.size}`);

  // ── 2. Upsert finish records ──────────────────────────────────────────────

  // Build a name → id map (fetch existing first, then insert missing ones)
  const finishIdByName = new Map<string, number>();

  const existing = await db
    .select({ id: finishesTable.id, name: finishesTable.name })
    .from(finishesTable)
    .where(eq(finishesTable.manufacturerId, MANUFACTURER_ID));

  for (const row of existing) {
    finishIdByName.set(row.name, row.id);
  }

  let finishesInserted = 0;

  for (const [idx, name] of [...allFinishNames].sort().entries()) {
    if (finishIdByName.has(name)) continue;

    const [ins] = await db
      .insert(finishesTable)
      .values({
        manufacturerId: MANUFACTURER_ID,
        name,
        displayOrder: idx,
        isActive: true,
      })
      .onConflictDoNothing()
      .returning({ id: finishesTable.id });

    if (ins) {
      finishIdByName.set(name, ins.id);
      finishesInserted++;
    } else {
      // Conflict — fetch existing (NULLS NOT DISTINCT unique constraint)
      const [found] = await db
        .select({ id: finishesTable.id })
        .from(finishesTable)
        .where(
          and(
            eq(finishesTable.manufacturerId, MANUFACTURER_ID),
            eq(finishesTable.name, name),
          ),
        )
        .limit(1);
      if (found) finishIdByName.set(name, found.id);
    }
  }

  console.log(`  Finishes inserted: ${finishesInserted}, already existed: ${existing.length}`);

  // ── 3. Link finishes to products ──────────────────────────────────────────

  let optionsInserted = 0;
  let productsMissing = 0;

  for (const row of rows) {
    const sku = row.sku.trim();
    const finishNames = row.finishes
      ? row.finishes.split(",").map((f) => f.trim()).filter(Boolean)
      : [];

    if (finishNames.length === 0) continue;

    // Look up product by SKU
    const [product] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.sku, sku))
      .limit(1);

    if (!product) {
      console.warn(`  ⚠ product not found for SKU: ${sku}`);
      productsMissing++;
      continue;
    }

    for (const [order, name] of finishNames.entries()) {
      const finishId = finishIdByName.get(name);
      if (!finishId) {
        console.warn(`  ⚠ finish not found in map: "${name}"`);
        continue;
      }

      const result = await db
        .insert(productFinishOptionsTable)
        .values({
          productId: product.id,
          finishId,
          displayOrder: order,
        })
        .onConflictDoNothing()
        .returning({ id: productFinishOptionsTable.id });

      if (result.length > 0) optionsInserted++;
    }
  }

  console.log(
    `\nDone.\n` +
      `  Finishes upserted   : ${finishesInserted + existing.length}\n` +
      `  Product links added : ${optionsInserted}\n` +
      `  Products missing    : ${productsMissing}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
