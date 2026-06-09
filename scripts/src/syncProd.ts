/**
 * Idempotent production data sync.
 *
 * Covers data changes that live outside the main seed scripts:
 *  1. Galtech finish item_number codes (needed by seedGaltech for finish linking)
 *  2. O.W. Lee material_id assignments (wrought iron + aluminum collections)
 *
 * Run against production:
 *   DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/syncProd.ts
 */
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";

// ── 1. Galtech finish item_number codes ─────────────────────────────────────
// These codes are used by seedGaltech.ts to link finish options to products.

const GALTECH_FINISH_CODES: Record<string, string> = {
  "Antique Bronze": "AB",
  "Antique Pewter": "AP",
  Black: "BK",
  Bronze: "MB",
  Charcoal: "CH",
  "Dark Wood": "DW",
  "Deluxe Champagne": "DC",
  Latte: "LT",
  "Light Wood": "LW",
  "Rib Champagne": "RC",
  Silver: "SR",
  "Standard Bronze": "BM",
  Teak: "TK",
  White: "W",
};

async function syncGaltechFinishCodes() {
  let updated = 0;
  for (const [name, code] of Object.entries(GALTECH_FINISH_CODES)) {
    const result = await db.execute(sql`
      UPDATE finishes
      SET item_number = ${code}, updated_at = NOW()
      WHERE manufacturer_id = 29
        AND name = ${name}
        AND (item_number IS NULL OR item_number != ${code})
    `);
    updated += Number((result as { rowCount?: number }).rowCount ?? 0);
  }
  console.log(`Galtech finish codes: ${updated} row(s) updated`);
}

// ── 2. O.W. Lee material_id assignments ─────────────────────────────────────
// Wrought Iron collections: classico, monterra, san cristobal (tag or name)
// Aluminum collections:     arc, aris, marin (tag or name)

async function syncOwLeeMaterials() {
  const wroughtIron = await db.execute(sql`
    UPDATE products
    SET material_id = 2, updated_at = NOW()
    WHERE manufacturer_id = 13
      AND (
        tags ?| array['classico','monterra','san-cristobal']
        OR name ILIKE '%san cristobal%'
      )
      AND material_id IS DISTINCT FROM 2
  `);

  const aluminum = await db.execute(sql`
    UPDATE products
    SET material_id = 1, updated_at = NOW()
    WHERE manufacturer_id = 13
      AND (
        tags ?| array['arc','aris','avana','horizon','marin','studio']
        OR name ILIKE '%marin%'
      )
      AND material_id IS DISTINCT FROM 1
  `);

  const wi = Number((wroughtIron as { rowCount?: number }).rowCount ?? 0);
  const al = Number((aluminum as { rowCount?: number }).rowCount ?? 0);
  console.log(
    `O.W. Lee materials: ${wi} wrought-iron, ${al} aluminum row(s) updated`,
  );
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Running production data sync…");
  await syncGaltechFinishCodes();
  await syncOwLeeMaterials();
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
