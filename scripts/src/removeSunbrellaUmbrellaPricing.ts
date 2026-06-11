/**
 * One-time-per-DB migration: Galtech (29) and Treasure Garden (12) umbrella
 * products must use ONLY their own manufacturer's fabrics (no Sunbrella), and
 * have ALL pricing removed (a new fabric-grade price list is coming). Affected
 * products become quote-only ("Call for Pricing", not purchasable online).
 *
 * Target set = each manufacturer's products that currently carry Sunbrella
 * fabric options (Galtech: umbrellas + replacement covers; TG: umbrellas).
 *
 * Idempotent: once a product's Sunbrella options are gone it is no longer a
 * target, so re-running is a safe no-op. Safe-guarded: if a manufacturer has no
 * own active fabrics loaded, it is skipped (Sunbrella left intact) so we never
 * strip fabrics with nothing to replace them.
 *
 * Run:        pnpm --filter @workspace/scripts exec tsx src/removeSunbrellaUmbrellaPricing.ts
 * Prod:  DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/removeSunbrellaUmbrellaPricing.ts
 */
import { and, eq, inArray } from "drizzle-orm";
import {
  db,
  productsTable,
  productVariantsTable,
  variantGradePricesTable,
  productFabricOptionsTable,
  productFabricPoolsTable,
  fabricsTable,
  cartItemsTable,
} from "@workspace/db";

const SUNBRELLA_MFR = 11;
const TARGETS = [
  { mfrId: 29, label: "Galtech International" },
  { mfrId: 12, label: "Treasure Garden" },
];

async function ownActiveFabricIds(mfrId: number): Promise<number[]> {
  const rows = await db
    .select({ id: fabricsTable.id })
    .from(fabricsTable)
    .where(
      and(eq(fabricsTable.manufacturerId, mfrId), eq(fabricsTable.isActive, true)),
    )
    .orderBy(fabricsTable.name);
  return rows.map((r) => r.id);
}

async function targetProductIds(mfrId: number): Promise<number[]> {
  const rows = await db
    .selectDistinct({ id: productsTable.id })
    .from(productsTable)
    .innerJoin(
      productFabricOptionsTable,
      eq(productFabricOptionsTable.productId, productsTable.id),
    )
    .innerJoin(
      fabricsTable,
      eq(fabricsTable.id, productFabricOptionsTable.fabricId),
    )
    .where(
      and(
        eq(productsTable.manufacturerId, mfrId),
        eq(fabricsTable.manufacturerId, SUNBRELLA_MFR),
      ),
    );
  return rows.map((r) => r.id);
}

async function migrate(mfrId: number, label: string) {
  const ownIds = await ownActiveFabricIds(mfrId);
  if (ownIds.length === 0) {
    console.warn(
      `! ${label}: no own active fabrics — skipping (Sunbrella left intact).`,
    );
    return;
  }
  const productIds = await targetProductIds(mfrId);
  if (productIds.length === 0) {
    console.log(`= ${label}: nothing to migrate (already done).`);
    return;
  }
  console.log(
    `> ${label}: migrating ${productIds.length} products to ${ownIds.length} own fabrics.`,
  );

  for (const productId of productIds) {
    // Remove any cart line items for this product first. These products become
    // quote-only (not purchasable), so existing cart lines are now invalid. This
    // also avoids the cart_items_product_fabric_fk ON DELETE SET NULL trying to
    // null the NOT NULL product_id column when fabric options are deleted.
    await db.delete(cartItemsTable).where(eq(cartItemsTable.productId, productId));

    // Replace all fabric options with the manufacturer's own fabrics.
    await db
      .delete(productFabricOptionsTable)
      .where(eq(productFabricOptionsTable.productId, productId));
    await db
      .delete(productFabricPoolsTable)
      .where(eq(productFabricPoolsTable.productId, productId));
    for (let i = 0; i < ownIds.length; i += 500) {
      const chunk = ownIds.slice(i, i + 500);
      await db
        .insert(productFabricOptionsTable)
        .values(
          chunk.map((fabricId, k) => ({
            productId,
            fabricId,
            displayOrder: i + k,
          })),
        )
        .onConflictDoNothing();
    }

    // Remove pricing: per-grade prices + absolute per-variant prices.
    const variants = await db
      .select({ id: productVariantsTable.id })
      .from(productVariantsTable)
      .where(eq(productVariantsTable.productId, productId));
    const variantIds = variants.map((v) => v.id);
    if (variantIds.length) {
      await db
        .delete(variantGradePricesTable)
        .where(inArray(variantGradePricesTable.variantId, variantIds));
      await db
        .update(productVariantsTable)
        .set({ msrp: null, salePrice: null })
        .where(eq(productVariantsTable.productId, productId));
    }

    // Remove product-level pricing; flag quote-only ("Call for Pricing").
    await db
      .update(productsTable)
      .set({
        price: null,
        msrp: null,
        salePrice: null,
        frameOnlyPrice: null,
        quoteOnly: true,
      })
      .where(eq(productsTable.id, productId));
  }
  console.log(`  ${label}: done.`);
}

async function main() {
  for (const t of TARGETS) await migrate(t.mfrId, t.label);
  console.log("Sunbrella removal + umbrella price reset complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
