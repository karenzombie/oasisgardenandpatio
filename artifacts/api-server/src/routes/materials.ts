import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, materialsTable } from "@workspace/db";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

router.get("/materials", async (_req, res): Promise<void> => {
  const rows = await db
    .select({
      id: materialsTable.id,
      name: materialsTable.name,
      slug: materialsTable.slug,
      description: materialsTable.description,
      imageUrl: materialsTable.imageUrl,
      displayOrder: materialsTable.displayOrder,
    })
    .from(materialsTable)
    .where(eq(materialsTable.isActive, true))
    .orderBy(
      sql`${materialsTable.displayOrder} asc`,
      sql`${materialsTable.name} asc`,
    );
  res.json(rows.map((r) => ({ ...r, imageUrl: toPublicImageUrl(r.imageUrl) })));
});

export default router;
