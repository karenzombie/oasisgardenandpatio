import { Router, type IRouter } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  productsTable,
  productImagesTable,
  manufacturersTable,
  categoriesTable,
} from "@workspace/db";
import { ListFeaturedProductsResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/products/featured", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      slug: productsTable.slug,
      sku: productsTable.sku,
      manufacturerName: manufacturersTable.name,
      categoryName: categoriesTable.name,
      price: productsTable.price,
      showPriceOnline: productsTable.showPriceOnline,
      availableOnline: productsTable.availableOnline,
      primaryImageUrl: sql<string | null>`(
        select ${productImagesTable.url}
        from ${productImagesTable}
        where ${productImagesTable.productId} = ${productsTable.id}
        order by ${productImagesTable.isPrimary} desc, ${productImagesTable.displayOrder} asc, ${productImagesTable.id} asc
        limit 1
      )`,
    })
    .from(productsTable)
    .leftJoin(
      manufacturersTable,
      eq(manufacturersTable.id, productsTable.manufacturerId),
    )
    .leftJoin(
      categoriesTable,
      eq(categoriesTable.id, productsTable.categoryId),
    )
    .where(
      and(
        eq(productsTable.isActive, true),
        eq(productsTable.featured, true),
      ),
    )
    .orderBy(
      sql`${productsTable.displayOrder} asc`,
      sql`${productsTable.name} asc`,
    )
    .limit(12);

  const normalized = rows.map((r) => ({
    ...r,
    manufacturerName: r.manufacturerName ?? "",
    categoryName: r.categoryName ?? "",
  }));

  res.json(ListFeaturedProductsResponse.parse(normalized));
});

export default router;
