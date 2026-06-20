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
  // Material is now stored in the product_materials junction. For each matched
  // O.W. Lee product, replace its material links with the single target
  // material so re-runs are idempotent (mirrors the old single-FK behaviour).
  // Precedence is intentional and order-dependent: wrought-iron runs first,
  // aluminum second, so any product matching both predicates ends up aluminum
  // — exactly as the previous single material_id UPDATEs behaved.
  const wroughtIron = await db.execute(sql`
    WITH matched AS (
      SELECT id FROM products
      WHERE manufacturer_id = 13
        AND (
          tags ?| array['classico','monterra','san-cristobal']
          OR name ILIKE '%san cristobal%'
        )
    ),
    del AS (
      DELETE FROM product_materials
      WHERE product_id IN (SELECT id FROM matched)
        AND material_id IS DISTINCT FROM 2
    )
    INSERT INTO product_materials (product_id, material_id, display_order)
    SELECT id, 2, 0 FROM matched
    ON CONFLICT (product_id, material_id) DO NOTHING
  `);

  const aluminum = await db.execute(sql`
    WITH matched AS (
      SELECT id FROM products
      WHERE manufacturer_id = 13
        AND (
          tags ?| array['arc','aris','avana','horizon','marin','studio']
          OR name ILIKE '%marin%'
        )
    ),
    del AS (
      DELETE FROM product_materials
      WHERE product_id IN (SELECT id FROM matched)
        AND material_id IS DISTINCT FROM 1
    )
    INSERT INTO product_materials (product_id, material_id, display_order)
    SELECT id, 1, 0 FROM matched
    ON CONFLICT (product_id, material_id) DO NOTHING
  `);

  const wi = Number((wroughtIron as { rowCount?: number }).rowCount ?? 0);
  const al = Number((aluminum as { rowCount?: number }).rowCount ?? 0);
  console.log(
    `O.W. Lee materials: ${wi} wrought-iron, ${al} aluminum link(s) added`,
  );
}

// ── 3. Category images ───────────────────────────────────────────────────────

async function syncCategoryImages() {
  const result = await db.execute(sql`
    UPDATE categories
    SET image_url = '/objects/categories/umbrellas.jpg', updated_at = NOW()
    WHERE id = 38 AND image_url IS DISTINCT FROM '/objects/categories/umbrellas.jpg'
  `);
  const n = Number((result as { rowCount?: number }).rowCount ?? 0);
  console.log(`Category images: ${n} row(s) updated`);
}

// ── 4. Treasure Garden SKU corrections ──────────────────────────────────────
// Prod drifted from dev (source of truth): the "Steel" base shipped with SKU
// BS709-2.0 in prod but BS70-2.0 in dev (and in the TG price CSV). The wrong SKU
// meant importTreasureGardenPrices.ts (matches by SKU) could never price it.
// Correcting the SKU lets the price import populate it like every other product.

async function syncTreasureGardenSkus() {
  const result = await db.execute(sql`
    UPDATE products
    SET sku = 'BS70-2.0', updated_at = NOW()
    WHERE manufacturer_id = 12 AND sku = 'BS709-2.0'
  `);
  const n = Number((result as { rowCount?: number }).rowCount ?? 0);
  console.log(`Treasure Garden SKU corrections: ${n} row(s) updated`);
}

// ── main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log("Running production data sync…");
  await syncGaltechFinishCodes();
  await syncOwLeeMaterials();
  await syncCategoryImages();
  await syncTreasureGardenSkus();
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
