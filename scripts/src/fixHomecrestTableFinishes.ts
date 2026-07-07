/**
 * Fix Homecrest Table Finishes:
 * 1. Delete the "Table Finishes" finish_collections row (it triggers
 *    panel-image mode on the customer page instead of swatch-grid mode).
 * 2. Update itemNumber on all 11 new finishes to the numeric code from
 *    the original file name (21, 75, 23, etc.).
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/fixHomecrestTableFinishes.ts
 */
import { eq, and } from "drizzle-orm";
import {
  db,
  manufacturersTable,
  finishesTable,
  finishCollectionsTable,
} from "@workspace/db";

const MANUFACTURER_NAME = "Homecrest";
const COLLECTION_NAME = "Table Finishes";

const CODE_UPDATES: Record<string, string> = {
  drift: "21",
  frost: "75",
  "coastal-gray": "23",
  sequoia: "20",
  "weathered-wood": "25",
  dune: "73",
  boulder: "74",
  char: "70",
  midnight: "72",
  "light-gray": "32",
  "brazilian-walnut": "24",
};

async function main() {
  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);
  if (!mfg) throw new Error(`Manufacturer "${MANUFACTURER_NAME}" not found`);
  console.log(`Found manufacturer "${MANUFACTURER_NAME}" id=${mfg.id}`);

  // 1. Delete the finish_collections row
  const deleted = await db
    .delete(finishCollectionsTable)
    .where(
      and(
        eq(finishCollectionsTable.manufacturerId, mfg.id),
        eq(finishCollectionsTable.collectionName, COLLECTION_NAME),
      ),
    );
  console.log(`Deleted ${deleted.length} finish_collections row(s) for "${COLLECTION_NAME}"`);

  // 2. Update itemNumber for each new finish
  let updated = 0;
  for (const [oldItemNumber, newItemNumber] of Object.entries(CODE_UPDATES)) {
    const rows = await db
      .select({ id: finishesTable.id })
      .from(finishesTable)
      .where(
        and(
          eq(finishesTable.manufacturerId, mfg.id),
          eq(finishesTable.itemNumber, oldItemNumber),
        ),
      )
      .limit(1);

    if (rows.length === 0) {
      console.warn(`  WARN: finish with itemNumber="${oldItemNumber}" not found`);
      continue;
    }

    await db
      .update(finishesTable)
      .set({ itemNumber: newItemNumber })
      .where(eq(finishesTable.id, rows[0].id));
    updated++;
    console.log(`  Updated itemNumber: ${oldItemNumber} → ${newItemNumber}`);
  }

  console.log(`\nDone. deleted=${deleted.length} updated=${updated}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
