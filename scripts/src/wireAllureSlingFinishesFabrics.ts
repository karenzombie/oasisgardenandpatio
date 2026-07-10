import { db } from "@workspace/db";
import {
  productFinishPoolsTable as productFinishPools,
  productFinishOptionsTable as productFinishOptions,
  productFabricPoolsTable as productFabricPools,
  productFabricOptionsTable as productFabricOptions,
} from "@workspace/db/schema";
import { inArray } from "drizzle-orm";

const MANUFACTURER_ID = 16;
const DRY_RUN = process.argv.includes("--commit") ? false : true;

const PRODUCT_IDS = [
  3926, 3925, 3915, 3917, 3919, 3924, 3922, 3923, 3920, 3921, 3916, 3918, 6238,
  6239, 6240, 6241,
];

const FINISH_IDS_IN_ORDER = [
  290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300,
];

const FABRIC_IDS_IN_ORDER = [
  2384, 2385, 2386, 2387, 2388, 2389, 2390, 2391, 2392, 2393, 2394, 2395,
  2396, 2397, 2398, 2399, 2400, 2401, 2402, 2403, 2404, 2405, 2406, 2407,
  2408, 2409, 2410, 2411, 2412, 2413, 2414, 2415, 2416, 2417, 2418, 2419,
  2420, 2421, 2422, 2423, 2424,
];

async function main() {
  console.log(`Mode: ${DRY_RUN ? "DRY RUN (no writes)" : "COMMIT"}`);

  const [existingFinishPools, existingFinishOptions, existingFabricPools, existingFabricOptions] =
    await Promise.all([
      db
        .select()
        .from(productFinishPools)
        .where(inArray(productFinishPools.productId, PRODUCT_IDS)),
      db
        .select()
        .from(productFinishOptions)
        .where(inArray(productFinishOptions.productId, PRODUCT_IDS)),
      db
        .select()
        .from(productFabricPools)
        .where(inArray(productFabricPools.productId, PRODUCT_IDS)),
      db
        .select()
        .from(productFabricOptions)
        .where(inArray(productFabricOptions.productId, PRODUCT_IDS)),
    ]);

  const blockedProductIds = new Set<number>();
  for (const row of [
    ...existingFinishPools,
    ...existingFinishOptions,
    ...existingFabricPools,
    ...existingFabricOptions,
  ]) {
    blockedProductIds.add(row.productId);
  }

  if (blockedProductIds.size > 0) {
    console.log(
      `\nSKIPPING products with existing wiring rows: ${[...blockedProductIds].sort((a, b) => a - b).join(", ")}`
    );
  }

  const productIdsToWire = PRODUCT_IDS.filter((id) => !blockedProductIds.has(id));
  console.log(`\nProducts to wire: ${productIdsToWire.length} of ${PRODUCT_IDS.length}`);
  console.log(productIdsToWire.join(", "));

  const finishPoolRows = productIdsToWire.map((productId) => ({
    productId,
    manufacturerId: MANUFACTURER_ID,
  }));

  const finishOptionRows = productIdsToWire.flatMap((productId) =>
    FINISH_IDS_IN_ORDER.map((finishId, idx) => ({
      productId,
      finishId,
      displayOrder: idx + 1,
      upchargeMsrp: "0",
      upchargeSale: "0",
    }))
  );

  const fabricPoolRows = productIdsToWire.map((productId) => ({
    productId,
    manufacturerId: MANUFACTURER_ID,
  }));

  const fabricOptionRows = productIdsToWire.flatMap((productId) =>
    FABRIC_IDS_IN_ORDER.map((fabricId, idx) => ({
      productId,
      fabricId,
      displayOrder: idx + 1,
    }))
  );

  console.log(`\nPlanned inserts:`);
  console.log(`  product_finish_pools: ${finishPoolRows.length}`);
  console.log(`  product_finish_options: ${finishOptionRows.length}`);
  console.log(`  product_fabric_pools: ${fabricPoolRows.length}`);
  console.log(`  product_fabric_options: ${fabricOptionRows.length}`);

  if (DRY_RUN) {
    console.log("\nDry run complete. Re-run with --commit to write changes.");
    process.exit(0);
  }

  if (productIdsToWire.length === 0) {
    console.log("\nNothing to insert.");
    process.exit(0);
  }

  await db.transaction(async (tx) => {
    if (finishPoolRows.length > 0) {
      await tx.insert(productFinishPools).values(finishPoolRows);
    }
    if (finishOptionRows.length > 0) {
      await tx.insert(productFinishOptions).values(finishOptionRows);
    }
    if (fabricPoolRows.length > 0) {
      await tx.insert(productFabricPools).values(fabricPoolRows);
    }
    if (fabricOptionRows.length > 0) {
      await tx.insert(productFabricOptions).values(fabricOptionRows);
    }
  });

  console.log("\nCommit complete.");

  console.log("\nVerification:");
  const verifyFinishPools = await db
    .select()
    .from(productFinishPools)
    .where(inArray(productFinishPools.productId, PRODUCT_IDS));
  const verifyFinishOptions = await db
    .select()
    .from(productFinishOptions)
    .where(inArray(productFinishOptions.productId, PRODUCT_IDS));
  const verifyFabricPools = await db
    .select()
    .from(productFabricPools)
    .where(inArray(productFabricPools.productId, PRODUCT_IDS));
  const verifyFabricOptions = await db
    .select()
    .from(productFabricOptions)
    .where(inArray(productFabricOptions.productId, PRODUCT_IDS));

  const countBy = (rows: { productId: number }[]) => {
    const map = new Map<number, number>();
    for (const r of rows) map.set(r.productId, (map.get(r.productId) ?? 0) + 1);
    return map;
  };

  const fpCounts = countBy(verifyFinishPools);
  const foCounts = countBy(verifyFinishOptions);
  const fabpCounts = countBy(verifyFabricPools);
  const faboCounts = countBy(verifyFabricOptions);

  console.log(
    "product_id | finish_pools | finish_options | fabric_pools | fabric_options | status"
  );
  for (const productId of PRODUCT_IDS) {
    const fp = fpCounts.get(productId) ?? 0;
    const fo = foCounts.get(productId) ?? 0;
    const fabp = fabpCounts.get(productId) ?? 0;
    const fabo = faboCounts.get(productId) ?? 0;
    const ok = fp === 1 && fo === 11 && fabp === 1 && fabo === 41;
    console.log(
      `${productId} | ${fp} | ${fo} | ${fabp} | ${fabo} | ${ok ? "OK" : "FLAG"}`
    );
  }

  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
