import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, exists, ne, sql } from "drizzle-orm";
import { db, manufacturersTable, productsTable, type Manufacturer } from "@workspace/db";
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
import { recordHistory } from "../lib/history";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

// Public list of active manufacturers (for storefront)
router.get("/manufacturers", async (req, res): Promise<void> => {
  const onlineOnly = req.query.onlineOnly === "true";

  const productConditions = [
    eq(productsTable.manufacturerId, manufacturersTable.id),
    eq(productsTable.isActive, true),
    eq(productsTable.availableOnline, true),
  ];
  if (onlineOnly) {
    productConditions.push(eq(productsTable.quoteOnly, false));
    productConditions.push(eq(productsTable.inStoreOnly, false));
  }

  const manufacturers = await db
    .select({
      id: manufacturersTable.id,
      name: manufacturersTable.name,
      slug: manufacturersTable.slug,
      logoUrl: manufacturersTable.logoUrl,
    })
    .from(manufacturersTable)
    .where(
      and(
        eq(manufacturersTable.isActive, true),
        ne(manufacturersTable.slug, "andrew-sewing"),
        exists(
          db
            .select({ v: sql`1` })
            .from(productsTable)
            .where(and(...productConditions)),
        ),
      ),
    )
    .orderBy(
      sql`${manufacturersTable.displayOrder} asc`,
      sql`${manufacturersTable.name} asc`,
    );

  res.json(
    ListManufacturersResponse.parse(
      manufacturers.map((m) => ({ ...m, logoUrl: toPublicImageUrl(m.logoUrl) })),
    ),
  );
});

// ----- Admin endpoints -----

function toAdminPayload(row: Manufacturer) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    logoUrl: toPublicImageUrl(row.logoUrl),
    website: row.website,
    displayOrder: row.displayOrder,
    dealerRate: row.dealerRate,
    saleDiscountRate: row.saleDiscountRate,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    state: row.state,
    postalCode: row.postalCode,
    country: row.country,
    phone: row.phone,
    fax: row.fax,
    orderEmail: row.orderEmail,
    salesEmail: row.salesEmail,
    orderMethod: row.orderMethod as "email" | "fax" | "manual",
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
    const om = parsed.data.orderMethod ?? "manual";
    if (om === "email" && !parsed.data.orderEmail?.trim()) {
      res
        .status(400)
        .json({ error: "Order email is required when orders are sent by email." });
      return;
    }
    if (om === "fax" && !parsed.data.fax?.trim()) {
      res
        .status(400)
        .json({ error: "Fax number is required when orders are sent by fax." });
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
          saleDiscountRate: parsed.data.saleDiscountRate ?? null,
          addressLine1: parsed.data.addressLine1 ?? null,
          addressLine2: parsed.data.addressLine2 ?? null,
          city: parsed.data.city ?? null,
          state: parsed.data.state ?? null,
          postalCode: parsed.data.postalCode ?? null,
          country: parsed.data.country ?? null,
          phone: parsed.data.phone ?? null,
          fax: parsed.data.fax ?? null,
          orderEmail: parsed.data.orderEmail ?? null,
          salesEmail: parsed.data.salesEmail ?? null,
          orderMethod: parsed.data.orderMethod ?? "manual",
          isActive: parsed.data.isActive ?? true,
        })
        .returning();
      await recordHistory(req, {
        entityType: "manufacturer",
        entityId: row.id,
        changeType: "create",
        snapshot: row,
      });
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
    if (
      body.data.orderMethod === "email" &&
      body.data.orderEmail !== undefined &&
      !body.data.orderEmail?.trim()
    ) {
      res
        .status(400)
        .json({ error: "Order email is required when orders are sent by email." });
      return;
    }
    if (
      body.data.orderMethod === "fax" &&
      body.data.fax !== undefined &&
      !body.data.fax?.trim()
    ) {
      res
        .status(400)
        .json({ error: "Fax number is required when orders are sent by fax." });
      return;
    }
    const [previous] = await db
      .select()
      .from(manufacturersTable)
      .where(eq(manufacturersTable.id, params.data.id));
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
          ...(body.data.saleDiscountRate !== undefined
            ? { saleDiscountRate: body.data.saleDiscountRate }
            : {}),
          ...(body.data.addressLine1 !== undefined
            ? { addressLine1: body.data.addressLine1 }
            : {}),
          ...(body.data.addressLine2 !== undefined
            ? { addressLine2: body.data.addressLine2 }
            : {}),
          ...(body.data.city !== undefined ? { city: body.data.city } : {}),
          ...(body.data.state !== undefined ? { state: body.data.state } : {}),
          ...(body.data.postalCode !== undefined
            ? { postalCode: body.data.postalCode }
            : {}),
          ...(body.data.country !== undefined
            ? { country: body.data.country }
            : {}),
          ...(body.data.phone !== undefined ? { phone: body.data.phone } : {}),
          ...(body.data.fax !== undefined ? { fax: body.data.fax } : {}),
          ...(body.data.orderEmail !== undefined
            ? { orderEmail: body.data.orderEmail }
            : {}),
          ...(body.data.salesEmail !== undefined
            ? { salesEmail: body.data.salesEmail }
            : {}),
          ...(body.data.orderMethod !== undefined
            ? { orderMethod: body.data.orderMethod }
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
      await recordHistory(req, {
        entityType: "manufacturer",
        entityId: row.id,
        changeType: "update",
        snapshot: row,
        previousSnapshot: previous ?? null,
      });
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
    const [previous] = await db
      .select()
      .from(manufacturersTable)
      .where(eq(manufacturersTable.id, params.data.id));
    const [row] = await db
      .update(manufacturersTable)
      .set({ isActive: body.data.isActive })
      .where(eq(manufacturersTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Manufacturer not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "manufacturer",
      entityId: row.id,
      changeType: "update",
      snapshot: row,
      previousSnapshot: previous ?? null,
      notes: `set isActive=${body.data.isActive}`,
    });
    res.json(toAdminPayload(row));
  },
);

export default router;
