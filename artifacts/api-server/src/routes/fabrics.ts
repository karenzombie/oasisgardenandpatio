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
    const colorFamily =
      typeof req.query.colorFamily === "string"
        ? req.query.colorFamily.trim()
        : "";

    const conds = [eq(fabricsTable.isActive, true)];
    if (q) {
      const orClause = or(
        ilike(fabricsTable.name, `%${q}%`),
        ilike(fabricsTable.itemNumber, `%${q}%`),
      );
      if (orClause) conds.push(orClause);
    }
    if (colorFamily) {
      conds.push(ilike(fabricsTable.colorFamily, colorFamily));
    }
    const whereClause = conds.length === 1 ? conds[0] : and(...conds);

    const rows = await db
      .select({
        id: fabricsTable.id,
        name: fabricsTable.name,
        itemNumber: fabricsTable.itemNumber,
        manufacturerName: manufacturersTable.name,
        manufacturerLogoUrl: manufacturersTable.logoUrl,
        swatchImageUrl: fabricsTable.swatchImageUrl,
        grade: fabricsTable.grade,
        colorFamily: fabricsTable.colorFamily,
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
          manufacturerLogoUrl: toPublicImageUrl(r.manufacturerLogoUrl),
          swatchImageUrl: toPublicImageUrl(r.swatchImageUrl),
        })),
      }),
    );
  },
);

export default router;
