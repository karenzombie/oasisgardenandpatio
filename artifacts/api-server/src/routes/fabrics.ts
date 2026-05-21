import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, ilike, or } from "drizzle-orm";
import {
  db,
  fabricsTable,
  manufacturersTable,
} from "@workspace/db";
import { ListCatalogFabricsResponse } from "@workspace/api-zod";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

// Public catalog of active fabrics. We intentionally show the full active
// fabric library (not just those mapped to a product), because the page
// doubles as a brand/marketing reference for what's available in the showroom.
router.get(
  "/catalog/fabrics",
  async (req: Request, res: Response): Promise<void> => {
    const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
    const whereClause = q
      ? and(
          eq(fabricsTable.isActive, true),
          or(
            ilike(fabricsTable.name, `%${q}%`),
            ilike(fabricsTable.itemNumber, `%${q}%`),
          ),
        )
      : eq(fabricsTable.isActive, true);

    const rows = await db
      .select({
        id: fabricsTable.id,
        name: fabricsTable.name,
        itemNumber: fabricsTable.itemNumber,
        manufacturerName: manufacturersTable.name,
        swatchImageUrl: fabricsTable.swatchImageUrl,
        displayOrder: fabricsTable.displayOrder,
      })
      .from(fabricsTable)
      .innerJoin(
        manufacturersTable,
        eq(manufacturersTable.id, fabricsTable.manufacturerId),
      )
      .where(whereClause)
      .orderBy(
        asc(manufacturersTable.name),
        asc(fabricsTable.displayOrder),
        asc(fabricsTable.name),
      );

    res.json(
      ListCatalogFabricsResponse.parse({
        fabrics: rows.map((r) => ({
          ...r,
          swatchImageUrl: toPublicImageUrl(r.swatchImageUrl),
        })),
      }),
    );
  },
);

export default router;
