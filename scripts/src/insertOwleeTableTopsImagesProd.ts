/**
 * One-shot: insert product_images rows for the OW Lee table tops into prod.
 * Images are already in object storage. This only writes DB rows.
 * Run with: DATABASE_URL=$PROD_DATABASE_URL ALLOW_PROD=1 pnpm --filter @workspace/scripts exec tsx src/insertOwleeTableTopsImagesProd.ts
 */
import { db } from "@workspace/db";
import { productImagesTable } from "@workspace/db/schema";

const rows = [
  { productId: 5491, url: "/objects/products/owlee/E-TopsCitySeries.png" },
  { productId: 5492, url: "/objects/products/owlee/D-TopsDakota.jpg" },
  { productId: 5493, url: "/objects/products/owlee/V-Tops_Valencia.jpg" },
  { productId: 5494, url: "/objects/products/owlee/K-TopsDekton.jpg" },
  { productId: 5495, url: "/objects/products/owlee/MM-TopsMicroMesh.jpg" },
  { productId: 5490, url: "/objects/products/owlee/P-TopsFresco.jpg" },
  { productId: 6336, url: "/objects/products/owlee/W-TopsReclaimed.png" },
] as const;

async function main() {
  const inserted = await db
    .insert(productImagesTable)
    .values(
      rows.map((r) => ({
        productId: r.productId,
        url: r.url,
        isPrimary: true,
        displayOrder: 0,
        imageKind: "gallery",
        altText: null,
      })),
    )
    .returning({ productId: productImagesTable.productId, url: productImagesTable.url });

  console.log(`Inserted ${inserted.length} rows:`);
  for (const r of inserted) console.log(`  ${r.productId} → ${r.url}`);
  console.log("Done.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
