import { db, productsTable, productFinishOptionsTable, productVariantsTable, productFinishPoolsTable, finishesTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";

async function main() {
  const all = await db.select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable)
    .where(eq(productsTable.manufacturerId, 16));

  // Check for product_finish_pools across all Homecrest products
  const poolRows = await db.select({ productId: productFinishPoolsTable.productId, manufacturerId: productFinishPoolsTable.manufacturerId })
    .from(productFinishPoolsTable)
    .where(inArray(productFinishPoolsTable.productId, all.map(p => p.id)));
  console.log('Homecrest products with finish pools:', poolRows.length);

  const collections = ['Slate', 'Concrete', 'Shadow Rock', 'Stonegate'];
  for (const coll of collections) {
    const prods = all.filter(p => p.name.includes(coll));
    const ids = prods.map(p => p.id);

    const finishOpts = ids.length
      ? await db.select({
          productId: productFinishOptionsTable.productId,
          finishId: productFinishOptionsTable.finishId,
        }).from(productFinishOptionsTable).where(inArray(productFinishOptionsTable.productId, ids))
      : [];

    const finishPools = ids.length
      ? await db.select({ productId: productFinishPoolsTable.productId })
        .from(productFinishPoolsTable).where(inArray(productFinishPoolsTable.productId, ids))
      : [];

    const variants = ids.length
      ? await db.select({ productId: productVariantsTable.productId, variantName: productVariantsTable.variantName })
        .from(productVariantsTable)
        .where(and(inArray(productVariantsTable.productId, ids), eq(productVariantsTable.isActive, true)))
      : [];

    const hasOpts = new Set(finishOpts.map(r => r.productId));
    const hasPools = new Set(finishPools.map(r => r.productId));
    const hasVariants = new Set(variants.map(r => r.productId));

    const distinctFinishIds = [...new Set(finishOpts.map(o => o.finishId))];
    const finishNames = distinctFinishIds.length
      ? await db.select({ id: finishesTable.id, name: finishesTable.name, itemNumber: finishesTable.itemNumber })
        .from(finishesTable).where(inArray(finishesTable.id, distinctFinishIds))
      : [];

    console.log(`=== ${coll} (${prods.length} products) ===`);
    console.log(`  With finish options: ${hasOpts.size} (${finishOpts.length} rows)`);
    console.log(`  With finish pools: ${hasPools.size} (${finishPools.length} rows)`);
    console.log(`  With variants: ${hasVariants.size} (${variants.length} rows)`);
    console.log(`  Distinct finishes: ${distinctFinishIds.length}`);
    console.log(`  Finishes: ${finishNames.map(f => f.name).join(', ')}`);

    // Products with NO wiring at all
    const noWiring = prods.filter(p => !hasOpts.has(p.id) && !hasPools.has(p.id) && !hasVariants.has(p.id));
    console.log(`  Products with NO options/pools/variants: ${noWiring.length}`);
    noWiring.forEach(p => console.log(`    ${p.sku} - ${p.name}`));

    // Products missing finishes specifically
    const noFinishes = prods.filter(p => !hasOpts.has(p.id) && !hasPools.has(p.id));
    console.log(`  Products missing finishes: ${noFinishes.length}`);

    console.log('');
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
