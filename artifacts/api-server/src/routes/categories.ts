import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, categoriesTable } from "@workspace/db";
import { ListCategoriesResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  const categories = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      slug: categoriesTable.slug,
      parentId: categoriesTable.parentId,
      displayOrder: categoriesTable.displayOrder,
    })
    .from(categoriesTable)
    .where(eq(categoriesTable.isActive, true))
    .orderBy(
      sql`${categoriesTable.displayOrder} asc`,
      sql`${categoriesTable.name} asc`,
    );

  res.json(ListCategoriesResponse.parse(categories));
});

export default router;
