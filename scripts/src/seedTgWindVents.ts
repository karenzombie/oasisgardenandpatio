/**
 * Idempotent loader: Single Wind Vent (SWV) vs Double Wind Vent (DWV) option
 * for the 13 Treasure Garden market umbrellas in tg_market_dwv_a_price CSV
 * (10 distinct models). Mirrors the Galtech vent-choice pattern.
 *
 * Model: each umbrella's existing "Frame Finish" variants are converted into a
 * combined Finish x Wind Vent variant set. For every finish we keep TWO variant
 * rows, each carrying its own absolute MSRP + sale price (the same absolute
 * per-variant pricing model used by rugs):
 *   - SWV: SKU `${finishSku}-SWV`, price = current catalog price (flat per model)
 *   - DWV: SKU `${finishSku}-DWV`, price = CSV DWV price (varies by finish for
 *          UM841/UM840/UM810; equal to SWV for the rest — still selectable)
 * optionLabel becomes "Finish & Wind Vent". Sale price = 25% off MSRP, matching
 * every other TG umbrella.
 *
 * The legacy finish variant row is repurposed in place into its -SWV row so its
 * id (and any inventory linkage) is preserved; the -DWV row is inserted/upserted.
 *
 * UM970 had NO catalog price (unsellable). Its product-level price is set to the
 * user-provided SWV price (580/435); DWV is 640/480.
 *
 * Idempotent: keys finishes off the existing variant SKUs (stripping any -SWV/-DWV
 * suffix), so re-runs update prices/names in place without creating duplicates.
 *
 * Usage:  pnpm --filter @workspace/scripts exec tsx src/seedTgWindVents.ts
 */
import { and, eq } from "drizzle-orm";
import {
  db,
  productsTable,
  productVariantsTable,
  finishesTable,
  manufacturersTable,
} from "@workspace/db";

type Price = { msrp: string; sale: string };

type UmbrellaConfig = {
  /** Product SKU in the catalog. */
  baseSku: string;
  /** Flat Single Wind Vent price (current catalog price) for all finishes. */
  swv: Price;
  /** Default Double Wind Vent price for finishes not listed in dwvByFinishSku. */
  dwvDefault: Price;
  /** Per-finish DWV overrides, keyed by the EXISTING finish variant SKU. */
  dwvByFinishSku?: Record<string, Price>;
  /** When true, set the product-level msrp/sale to the SWV price (UM970). */
  setProductPrice?: boolean;
};

const CONFIGS: UmbrellaConfig[] = [
  { baseSku: "UM800LX", swv: { msrp: "1310.00", sale: "982.50" }, dwvDefault: { msrp: "1310.00", sale: "982.50" } },
  { baseSku: "UM801", swv: { msrp: "1180.00", sale: "885.00" }, dwvDefault: { msrp: "1180.00", sale: "885.00" } },
  { baseSku: "UM800", swv: { msrp: "825.00", sale: "618.75" }, dwvDefault: { msrp: "825.00", sale: "618.75" } },
  {
    baseSku: "UM841",
    swv: { msrp: "1045.00", sale: "783.75" },
    dwvDefault: { msrp: "1045.00", sale: "783.75" },
    dwvByFinishSku: { "UM841-SS": { msrp: "1095.00", sale: "821.25" } },
  },
  {
    baseSku: "UM840",
    swv: { msrp: "745.00", sale: "558.75" },
    dwvDefault: { msrp: "745.00", sale: "558.75" },
    dwvByFinishSku: { "UM840-SS": { msrp: "760.00", sale: "570.00" } },
  },
  { baseSku: "UM812", swv: { msrp: "1015.00", sale: "761.25" }, dwvDefault: { msrp: "1015.00", sale: "761.25" } },
  {
    baseSku: "UM810",
    swv: { msrp: "720.00", sale: "540.00" },
    dwvDefault: { msrp: "720.00", sale: "540.00" },
    dwvByFinishSku: {
      "UM810-SS": { msrp: "775.00", sale: "581.25" },
      "UM810-WO": { msrp: "775.00", sale: "581.25" },
    },
  },
  {
    baseSku: "UM970",
    swv: { msrp: "580.00", sale: "435.00" },
    dwvDefault: { msrp: "640.00", sale: "480.00" },
    setProductPrice: true,
  },
  { baseSku: "UM920", swv: { msrp: "565.00", sale: "423.75" }, dwvDefault: { msrp: "565.00", sale: "423.75" } },
  { baseSku: "UM809-1H", swv: { msrp: "570.00", sale: "427.50" }, dwvDefault: { msrp: "570.00", sale: "427.50" } },
];

const OPTION_LABEL = "Finish & Wind Vent";
const VENT_SUFFIX_RE = /-(SWV|DWV)$/i;
const VENT_NAME_RE = /\s*[–—-]\s*(Single|Double)\s+Wind\s+Vent\s*$/i;

function stripVentFromName(name: string): string {
  return name.replace(VENT_NAME_RE, "").trim();
}

async function run() {
  let updated = 0;
  let inserted = 0;

  // Align the Treasure Garden silver frame-finish swatch name with the variant
  // name ("Silver Shadow") so the PDP swatch lookup (which matches finishes by
  // name) resolves it. The catalog entry shipped as "Silver Shadow, Anodized".
  const [tgMfr] = await db
    .select({ id: manufacturersTable.id })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.name, "Treasure Garden"));
  if (tgMfr) {
    const renamed = await db
      .update(finishesTable)
      .set({ name: "Silver Shadow" })
      .where(
        and(
          eq(finishesTable.manufacturerId, tgMfr.id),
          eq(finishesTable.name, "Silver Shadow, Anodized"),
        ),
      )
      .returning({ id: finishesTable.id });
    if (renamed.length) {
      console.log(`  renamed finish "Silver Shadow, Anodized" -> "Silver Shadow"`);
    }
  }

  for (const cfg of CONFIGS) {
    const [product] = await db
      .select()
      .from(productsTable)
      .where(eq(productsTable.sku, cfg.baseSku));

    if (!product) {
      console.warn(`[skip] product not found: ${cfg.baseSku}`);
      continue;
    }

    if (cfg.setProductPrice) {
      await db
        .update(productsTable)
        .set({ msrp: cfg.swv.msrp, salePrice: cfg.swv.sale })
        .where(eq(productsTable.id, product.id));
      console.log(`  ${cfg.baseSku}: set product price ${cfg.swv.msrp}/${cfg.swv.sale}`);
    }

    const variants = await db
      .select()
      .from(productVariantsTable)
      .where(eq(productVariantsTable.productId, product.id));

    // Unique finish keys = existing variant SKUs with any vent suffix stripped.
    const finishKeys: string[] = [];
    const seen = new Set<string>();
    for (const v of variants) {
      const key = v.variantSku.replace(VENT_SUFFIX_RE, "");
      if (!seen.has(key)) {
        seen.add(key);
        finishKeys.push(key);
      }
    }

    for (const finishKey of finishKeys) {
      const legacy = variants.find((v) => v.variantSku === finishKey);
      const swvExisting = variants.find((v) => v.variantSku === `${finishKey}-SWV`);
      const dwvExisting = variants.find((v) => v.variantSku === `${finishKey}-DWV`);
      const template = legacy ?? swvExisting ?? dwvExisting;
      if (!template) continue;

      const baseLabel = stripVentFromName(template.variantName);
      const dwv = cfg.dwvByFinishSku?.[finishKey] ?? cfg.dwvDefault;
      const swvSku = `${finishKey}-SWV`;
      const dwvSku = `${finishKey}-DWV`;

      // ---- SWV row (repurpose legacy in place, else update, else insert) ----
      if (legacy) {
        await db
          .update(productVariantsTable)
          .set({
            variantSku: swvSku,
            variantName: `${baseLabel} – Single Wind Vent`,
            optionLabel: OPTION_LABEL,
            priceAdjustment: "0",
            msrp: cfg.swv.msrp,
            salePrice: cfg.swv.sale,
          })
          .where(eq(productVariantsTable.id, legacy.id));
        updated++;
      } else if (swvExisting) {
        await db
          .update(productVariantsTable)
          .set({
            variantName: `${baseLabel} – Single Wind Vent`,
            optionLabel: OPTION_LABEL,
            priceAdjustment: "0",
            msrp: cfg.swv.msrp,
            salePrice: cfg.swv.sale,
          })
          .where(eq(productVariantsTable.id, swvExisting.id));
        updated++;
      } else {
        await db.insert(productVariantsTable).values({
          productId: product.id,
          variantSku: swvSku,
          variantName: `${baseLabel} – Single Wind Vent`,
          optionLabel: OPTION_LABEL,
          priceAdjustment: "0",
          msrp: cfg.swv.msrp,
          salePrice: cfg.swv.sale,
          shippingSurcharge: template.shippingSurcharge,
          weight: template.weight,
          displayOrder: template.displayOrder,
        });
        inserted++;
      }

      // ---- DWV row (update existing, else insert) ----
      if (dwvExisting) {
        await db
          .update(productVariantsTable)
          .set({
            variantName: `${baseLabel} – Double Wind Vent`,
            optionLabel: OPTION_LABEL,
            priceAdjustment: "0",
            msrp: dwv.msrp,
            salePrice: dwv.sale,
          })
          .where(eq(productVariantsTable.id, dwvExisting.id));
        updated++;
      } else {
        await db.insert(productVariantsTable).values({
          productId: product.id,
          variantSku: dwvSku,
          variantName: `${baseLabel} – Double Wind Vent`,
          optionLabel: OPTION_LABEL,
          priceAdjustment: "0",
          msrp: dwv.msrp,
          salePrice: dwv.sale,
          shippingSurcharge: template.shippingSurcharge,
          weight: template.weight,
          displayOrder: template.displayOrder + 1000,
        });
        inserted++;
      }
    }

    console.log(`  ${cfg.baseSku}: ${finishKeys.length} finish(es) -> SWV + DWV variants`);
  }

  console.log(`\nDone. variants updated=${updated}, inserted=${inserted}.`);
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
