import { Router, type IRouter } from "express";
import { eq, sql } from "drizzle-orm";
import { db, manufacturersTable } from "@workspace/db";
import { ListManufacturersResponse } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/manufacturers", async (_req, res): Promise<void> => {
  const manufacturers = await db
    .select({
      id: manufacturersTable.id,
      name: manufacturersTable.name,
      slug: manufacturersTable.slug,
    })
    .from(manufacturersTable)
    .where(eq(manufacturersTable.isActive, true))
    .orderBy(
      sql`${manufacturersTable.displayOrder} asc`,
      sql`${manufacturersTable.name} asc`,
    );

  res.json(ListManufacturersResponse.parse(manufacturers));
});

export default router;
