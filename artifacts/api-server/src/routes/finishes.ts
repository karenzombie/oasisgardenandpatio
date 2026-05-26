import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import {
  db,
  finishesTable,
  manufacturersTable,
} from "@workspace/db";
import { ListCatalogManufacturerFinishesResponse } from "@workspace/api-zod";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

// Public catalog of active manufacturer finishes — mirrors /catalog/fabrics.
// Shows the full active finish library (not just product-mapped ones) so
// the page doubles as a brand/showroom reference.
router.get(
  "/catalog/manufacturer-finishes",
  async (req: Request, res: Response): Promise<void> => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const whereClause = q
      ? and(
          eq(finishesTable.isActive, true),
          or(
            ilike(finishesTable.name, `%${q}%`),
            ilike(finishesTable.itemNumber, `%${q}%`),
          ),
        )
      : eq(finishesTable.isActive, true);

    const rows = await db
      .select({
        id: finishesTable.id,
        name: finishesTable.name,
        itemNumber: finishesTable.itemNumber,
        manufacturerName: manufacturersTable.name,
        imageUrl: finishesTable.imageUrl,
        description: finishesTable.description,
        displayOrder: finishesTable.displayOrder,
      })
      .from(finishesTable)
      .innerJoin(
        manufacturersTable,
        eq(manufacturersTable.id, finishesTable.manufacturerId),
      )
      .where(whereClause)
      .orderBy(
        asc(manufacturersTable.name),
        asc(finishesTable.displayOrder),
        asc(finishesTable.name),
      );

    res.json(
      ListCatalogManufacturerFinishesResponse.parse({
        finishes: rows.map((r) => ({
          ...r,
          imageUrl: toPublicImageUrl(r.imageUrl),
        })),
      }),
    );
  },
);

export default router;
