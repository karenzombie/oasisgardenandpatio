import { db } from "@workspace/db";
import {
  fabricsTable,
  productFabricOptionsTable,
} from "@workspace/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import * as fs from "node:fs";

const MANUFACTURER_ID = 16;
const DRY_RUN = process.argv.includes("--commit") ? false : true;

// Parse CSV helper
function parseCsv(path: string): Record<string, string>[] {
  const text = fs.readFileSync(path, "utf-8").trim();
  const lines = text.split("\n");
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const parts = line.split(",");
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = parts[i]?.trim() ?? "";
    });
    return row;
  });
}

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "COMMIT"}`);

  // 1. Parse rewire CSV
  const rewireRows = parseCsv("../attached_assets/homecrest_fabric_rewire_1783830821071.csv");
  console.log(`Products to rewire: ${rewireRows.length}`);

  // 2. Parse fabrics CSV and build code → fabric_id map
  const fabricRows = parseCsv("../attached_assets/homecrest_fabrics_final_1783830821071.csv");
  console.log(`Fabrics in reference: ${fabricRows.length}`);

  const codeColumns = ["S", "A", "PS", "C", "U", "V", "W"] as const;
  const codeToFabricIds: Record<string, number[]> = {};
  for (const code of codeColumns) {
    const ids = fabricRows
      .filter((f) => f[code] === "YES")
      .map((f) => parseInt(f.db_id, 10));
    codeToFabricIds[code] = ids;
    console.log(`  ${code}: ${ids.length} fabrics`);
  }

  // 3. Verify all fabric IDs exist in DB
  const allFabricIds = new Set<number>();
  for (const ids of Object.values(codeToFabricIds)) {
    for (const id of ids) allFabricIds.add(id);
  }
  const fabricIdArray = Array.from(allFabricIds);
  const foundFabrics = await db
    .select({ id: fabricsTable.id })
    .from(fabricsTable)
    .where(inArray(fabricsTable.id, fabricIdArray));
  const foundIds = new Set(foundFabrics.map((f) => f.id));
  const missing = fabricIdArray.filter((id) => !foundIds.has(id));
  if (missing.length > 0) {
    console.error("Missing fabric IDs in DB:", missing);
    process.exit(1);
  }
  console.log(`Verified ${foundIds.size} fabric IDs exist in DB`);

  // 4. Build product_id → target fabric_id set
  const productTargetMap = new Map<number, Set<number>>();
  for (const row of rewireRows) {
    const productId = parseInt(row.product_id, 10);
    const code = row.correct_fabric_code;
    const targetIds = codeToFabricIds[code];
    if (!targetIds) {
      console.error(`Unknown fabric code "${code}" for product ${productId}`);
      process.exit(1);
    }
    productTargetMap.set(productId, new Set(targetIds));
  }

  // 5. Get current fabric options for all target products
  const productIds = Array.from(productTargetMap.keys());
  const currentOptions = await db
    .select({
      productId: productFabricOptionsTable.productId,
      fabricId: productFabricOptionsTable.fabricId,
    })
    .from(productFabricOptionsTable)
    .where(inArray(productFabricOptionsTable.productId, productIds));

  const currentByProduct = new Map<number, Set<number>>();
  for (const opt of currentOptions) {
    const set = currentByProduct.get(opt.productId) ?? new Set<number>();
    set.add(opt.fabricId);
    currentByProduct.set(opt.productId, set);
  }

  // 6. Compute changes per product
  let totalToDelete = 0;
  let totalToInsert = 0;
  const unchangedProducts: number[] = [];
  const changes: {
    productId: number;
    toDelete: number[];
    toInsert: number[];
  }[] = [];

  for (const [productId, targetSet] of productTargetMap) {
    const currentSet = currentByProduct.get(productId) ?? new Set<number>();

    const toDelete: number[] = [];
    const toInsert: number[] = [];

    for (const fid of currentSet) {
      if (!targetSet.has(fid)) toDelete.push(fid);
    }
    for (const fid of targetSet) {
      if (!currentSet.has(fid)) toInsert.push(fid);
    }

    if (toDelete.length === 0 && toInsert.length === 0) {
      unchangedProducts.push(productId);
      continue;
    }

    totalToDelete += toDelete.length;
    totalToInsert += toInsert.length;
    changes.push({ productId, toDelete, toInsert });
  }

  console.log(
    `Products needing changes: ${changes.length} (unchanged: ${unchangedProducts.length})`,
  );
  console.log(`Total fabric options to delete: ${totalToDelete}`);
  console.log(`Total fabric options to insert: ${totalToInsert}`);

  if (DRY_RUN) {
    // Print details for first 5 changed products
    for (const ch of changes.slice(0, 5)) {
      const row = rewireRows.find((r) => r.product_id === String(ch.productId))!;
      console.log(
        `  ${ch.productId} (${row.sku}, ${row.name}): delete ${ch.toDelete.length}, insert ${ch.toInsert.length}`,
      );
    }
    if (changes.length > 5) {
      console.log(`  ... and ${changes.length - 5} more`);
    }
    console.log("\nRun with --commit to apply changes.");
    return;
  }

  // 7. Apply changes in batches
  const BATCH_SIZE = 100;
  console.log("\nApplying changes...");

  for (const ch of changes) {
    // Delete stale fabrics
    if (ch.toDelete.length > 0) {
      await db
        .delete(productFabricOptionsTable)
        .where(
          sql`${productFabricOptionsTable.productId} = ${ch.productId} AND ${inArray(productFabricOptionsTable.fabricId, ch.toDelete)}`,
        );
    }

    // Insert new fabrics in batches
    if (ch.toInsert.length > 0) {
      for (let i = 0; i < ch.toInsert.length; i += BATCH_SIZE) {
        const batch = ch.toInsert.slice(i, i + BATCH_SIZE);
        await db.insert(productFabricOptionsTable).values(
          batch.map((fabricId) => ({
            productId: ch.productId,
            fabricId,
            displayOrder: 0,
          })),
        );
      }
    }
  }

  console.log("Done. Changes applied.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
