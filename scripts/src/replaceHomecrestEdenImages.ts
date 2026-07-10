/**
 * Replace existing generic Homecrest Eden product images with new SKU-matched
 * images + add all 6 lifestyle images for the 12 Eden SKUs.
 *
 * Steps:
 * 1. Delete existing gallery images for these 12 products.
 * 2. Insert new rows: primary SKU-matched image + 6 shared lifestyle images.
 *
 * Run: pnpm --filter @workspace/scripts exec tsx src/replaceHomecrestEdenImages.ts
 */
import path from "path";
import { fileURLToPath } from "url";
import { and, eq, inArray } from "drizzle-orm";
import { db, productImagesTable, productsTable } from "@workspace/db";

const IMAGE_TO_SKU: Record<string, string> = {
  "2621S": "2621S",
  "2624S": "2624S",
  "261660": "261660",
  "261948": "261948",
  "262348": "262348",
  "262948": "262948",
  "263060": "263060",
  "263460": "263460",
  "264060": "264060",
  "2630110": "2630110",
  "2634110": "2634110",
  "2640110": "2640110",
};

const SHARED_PATHS = [
  "/objects/uploads/homecrest-eden-2019_AllureEden.jpg",
  "/objects/uploads/homecrest-eden-2019_AllureEden(2).jpg",
  "/objects/uploads/homecrest-eden-2025-Willow_EdenTable_640x561.jpg",
  "/objects/uploads/homecrest-eden-Allure-Eden-ClemsonSoccerStadium.jpg",
  "/objects/uploads/homecrest-eden-Allure-Eden-Lyra.jpg",
  "/objects/uploads/homecrest-eden-Allure-Eden.jpg",
];

async function main() {
  const allSkus = [...new Set(Object.values(IMAGE_TO_SKU))];

  const products = await db
    .select({ id: productsTable.id, sku: productsTable.sku, name: productsTable.name })
    .from(productsTable)
    .where(inArray(productsTable.sku, allSkus));

  const skuToProduct = new Map(products.map((p) => [p.sku, p]));
  const missing = allSkus.filter((s) => !skuToProduct.has(s));
  if (missing.length) {
    console.warn(`MISSING from DB (${missing.length}):`, missing.join(", "));
  }
  console.log(`Found ${products.length}/${allSkus.length} products`);

  // 1. Delete existing gallery images for these products
  const productIds = products.map((p) => p.id);
  if (productIds.length) {
    const deleted = await db
      .delete(productImagesTable)
      .where(
        and(
          inArray(productImagesTable.productId, productIds),
          eq(productImagesTable.imageKind, "gallery"),
        ),
      );
    console.log(`Deleted existing gallery images for ${productIds.length} products`);
  }

  // 2. Insert new images for each product
  let inserted = 0;
  let noMapping = 0;

  for (const product of products) {
    const imageKey = Object.keys(IMAGE_TO_SKU).find((k) => IMAGE_TO_SKU[k] === product.sku);
    if (!imageKey) {
      console.warn(`WARN: no image mapping for ${product.sku}`);
      noMapping++;
      continue;
    }

    const primaryPath = `/objects/uploads/homecrest-eden-${imageKey}.jpg`;

    const rows: any[] = [];
    rows.push({
      productId: product.id,
      url: primaryPath,
      altText: product.name,
      isPrimary: true,
      displayOrder: 0,
      imageKind: "gallery",
    });

    let order = 1;
    for (const sharedPath of SHARED_PATHS) {
      rows.push({
        productId: product.id,
        url: sharedPath,
        altText: product.name,
        isPrimary: false,
        displayOrder: order++,
        imageKind: "gallery",
      });
    }

    await db.insert(productImagesTable).values(rows);
    console.log(`  ✓ ${product.sku} (id ${product.id}) → primary + ${SHARED_PATHS.length} lifestyle`);
    inserted++;
  }

  console.log(`\nDone. replaced=${inserted} missing-mapping=${noMapping}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
