import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db, manufacturersTable, type Manufacturer } from "@workspace/db";
import {
  ListManufacturersResponse,
  AdminListManufacturersResponse,
  AdminCreateManufacturerBody,
  AdminUpdateManufacturerParams,
  AdminUpdateManufacturerBody,
  AdminSetManufacturerActiveParams,
  AdminSetManufacturerActiveBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { isUniqueViolation } from "../lib/dbErrors";

const router: IRouter = Router();

// Public list of active manufacturers (for storefront)
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

// ----- Admin endpoints -----

function toAdminPayload(row: Manufacturer) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    logoUrl: row.logoUrl,
    website: row.website,
    displayOrder: row.displayOrder,
    dealerRate: row.dealerRate,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get(
  "/admin/manufacturers",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(manufacturersTable)
      .orderBy(
        sql`${manufacturersTable.displayOrder} asc`,
        sql`${manufacturersTable.name} asc`,
      );
    res.json(AdminListManufacturersResponse.parse(rows.map(toAdminPayload)));
  },
);

router.post(
  "/admin/manufacturers",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateManufacturerBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    try {
      const [row] = await db
        .insert(manufacturersTable)
        .values({
          name: parsed.data.name,
          slug: parsed.data.slug,
          description: parsed.data.description ?? null,
          logoUrl: parsed.data.logoUrl ?? null,
          website: parsed.data.website ?? null,
          displayOrder: parsed.data.displayOrder ?? 0,
          dealerRate: parsed.data.dealerRate ?? null,
          isActive: parsed.data.isActive ?? true,
        })
        .returning();
      res.status(201).json(toAdminPayload(row));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "A manufacturer with that slug already exists" });
        return;
      }
      req.log.error({ err }, "Failed to create manufacturer");
      res.status(500).json({ error: "Failed to create manufacturer" });
    }
  },
);

router.put(
  "/admin/manufacturers/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateManufacturerParams.safeParse(req.params);
    const body = AdminUpdateManufacturerBody.safeParse(req.body);
    if (!params.success || !body.success) {
      const msg =
        params.success === false
          ? params.error.issues[0]?.message
          : body.success === false
            ? body.error.issues[0]?.message
            : "Invalid input";
      res.status(400).json({ error: msg ?? "Invalid input" });
      return;
    }
    try {
      const [row] = await db
        .update(manufacturersTable)
        .set({
          name: body.data.name,
          slug: body.data.slug,
          description: body.data.description ?? null,
          logoUrl: body.data.logoUrl ?? null,
          website: body.data.website ?? null,
          ...(body.data.displayOrder !== undefined
            ? { displayOrder: body.data.displayOrder }
            : {}),
          ...(body.data.dealerRate !== undefined
            ? { dealerRate: body.data.dealerRate }
            : {}),
          ...(body.data.isActive !== undefined
            ? { isActive: body.data.isActive }
            : {}),
        })
        .where(eq(manufacturersTable.id, params.data.id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "Manufacturer not found" });
        return;
      }
      res.json(toAdminPayload(row));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "A manufacturer with that slug already exists" });
        return;
      }
      req.log.error({ err }, "Failed to update manufacturer");
      res.status(500).json({ error: "Failed to update manufacturer" });
    }
  },
);

router.patch(
  "/admin/manufacturers/:id/active",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminSetManufacturerActiveParams.safeParse(req.params);
    const body = AdminSetManufacturerActiveBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const [row] = await db
      .update(manufacturersTable)
      .set({ isActive: body.data.isActive })
      .where(eq(manufacturersTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Manufacturer not found" });
      return;
    }
    res.json(toAdminPayload(row));
  },
);

export default router;
