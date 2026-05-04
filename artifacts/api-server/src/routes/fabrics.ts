import { Router, type IRouter, type Request, type Response } from "express";
import { asc, eq } from "drizzle-orm";
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
  async (_req: Request, res: Response): Promise<void> => {
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
      .where(eq(fabricsTable.isActive, true))
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
