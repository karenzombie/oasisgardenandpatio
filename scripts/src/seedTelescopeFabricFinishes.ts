/**
 * Seeds Telescope Casual sling/strap/fabric/accent finishes from the
 * complete finishes CSV. Uses swatch URLs from Telescope's CDN directly —
 * no Object Storage upload required.
 *
 * Covers: Sling, Strap, Ultraleather, Rustic Polymer, MGP Accent, Powdercoat, MGP.
 * Frame finishes (with "frame finish" description suffix) are handled by
 * seedTelescopeFinishes.ts and are left untouched here.
 *
 * Idempotent: upserts on (manufacturer_id, item_number).
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/seedTelescopeFabricFinishes.ts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Papa from "papaparse";
import { and, eq } from "drizzle-orm";
import { db, finishesTable, manufacturersTable } from "@workspace/db";

const WORKSPACE_ROOT = resolve(process.cwd(), "..");
const CSV_PATH = resolve(
  WORKSPACE_ROOT,
  "attached_assets/telescope_finishes_1781232213160.csv",
);
const MANUFACTURER_NAME = "Telescope Casual";

type FinishRow = {
  finish_type: string;
  finish_name: string;
  sku: string;
  grade: string;
  swatch_url: string;
};

async function main() {
  const [mfg] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, MANUFACTURER_NAME))
    .limit(1);
  if (!mfg) throw new Error(`Manufacturer "${MANUFACTURER_NAME}" not found`);

  const raw = readFileSync(CSV_PATH, "utf8");
  const { data } = Papa.parse<FinishRow>(raw, {
    header: true,
    skipEmptyLines: true,
  });

  let inserted = 0;
  let updated = 0;

  for (const row of data) {
    const name = row.finish_name?.trim();
    const description = row.finish_type?.trim();
    // Powdercoat and MGP frame finishes are owned by seedTelescopeFinishes.ts —
    // skip them here to avoid duplicating rows with mismatched item_numbers.
    if (description === "Powdercoat" || description === "MGP") continue;

    // Use name as stable item_number when SKU is absent (Rustic Polymer, etc.).
    const itemNumber = row.sku?.trim() || name;
    const imageUrl = row.swatch_url?.trim() || null;

    if (!name || !description) continue;

    const [existing] = await db
      .select({ id: finishesTable.id })
      .from(finishesTable)
      .where(
        and(
          eq(finishesTable.manufacturerId, mfg.id),
          eq(finishesTable.itemNumber, itemNumber),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(finishesTable)
        .set({ name, description, imageUrl, isActive: true })
        .where(eq(finishesTable.id, existing.id));
      updated++;
    } else {
      await db.insert(finishesTable).values({
        manufacturerId: mfg.id,
        name,
        description,
        itemNumber,
        imageUrl,
        isActive: true,
        displayOrder: 0,
      });
      inserted++;
    }
  }

  console.log(
    `Telescope fabric finishes done. inserted=${inserted} updated=${updated}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
