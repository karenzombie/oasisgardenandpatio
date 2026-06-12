import { Router, type IRouter, type Request, type Response } from "express";
import { asc, eq, inArray, sql, count } from "drizzle-orm";
import {
  db,
  fabricsTable,
  finishCollectionsTable,
  finishesTable,
  manufacturersTable,
  productsTable,
  productFabricOptionsTable,
  productFabricPoolsTable,
  productFinishOptionsTable,
  productFinishPoolsTable,
  productAttributesTable,
  productVariantsTable,
  variantGradePricesTable,
} from "@workspace/db";
import {
  AdminCreateFabricBody,
  AdminUpdateFabricParams,
  AdminUpdateFabricBody,
  AdminGetProductFabricsParams,
  AdminUpdateProductFabricsParams,
  AdminUpdateProductFabricsBody,
  AdminCreateFinishBody,
  AdminUpdateFinishParams,
  AdminUpdateFinishBody,
  AdminDeleteFinishParams,
  AdminCreateFinishCollectionBody,
  AdminUpdateFinishCollectionParams,
  AdminUpdateFinishCollectionBody,
  AdminGetProductFinishesParams,
  AdminUpdateProductFinishesParams,
  AdminUpdateProductFinishesBody,
  AdminListFinishProductsParams,
  AdminUpdateFinishProductsParams,
  AdminUpdateFinishProductsBody,
  AdminGetProductAttributesParams,
  AdminUpdateProductAttributesParams,
  AdminUpdateProductAttributesBody,
  AdminGetProductVariantsParams,
  AdminUpdateProductVariantsParams,
  AdminUpdateProductVariantsBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordHistory } from "../lib/history";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

// ---------------------------------------------------------------------------
// Admin: list every fabric (across manufacturers) — used by the product
// editor to pick individual fabrics.
// ---------------------------------------------------------------------------
router.get(
  "/admin/fabrics",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select({
        id: fabricsTable.id,
        manufacturerId: fabricsTable.manufacturerId,
        manufacturerName: manufacturersTable.name,
        itemNumber: fabricsTable.itemNumber,
        name: fabricsTable.name,
        swatchImageUrl: fabricsTable.swatchImageUrl,
        grade: fabricsTable.grade,
        colorFamily: fabricsTable.colorFamily,
        notes: fabricsTable.notes,
        isStripe: fabricsTable.isStripe,
        isActive: fabricsTable.isActive,
        displayOrder: fabricsTable.displayOrder,
      })
      .from(fabricsTable)
      .innerJoin(
        manufacturersTable,
        eq(manufacturersTable.id, fabricsTable.manufacturerId),
      )
      .orderBy(
        asc(manufacturersTable.name),
        asc(fabricsTable.displayOrder),
        asc(fabricsTable.name),
      );
    res.json(
      rows.map((r) => ({
        ...r,
        swatchImageUrl: toPublicImageUrl(r.swatchImageUrl),
      })),
    );
  },
);

// ---------------------------------------------------------------------------
// Admin: create fabric
// ---------------------------------------------------------------------------
router.post(
  "/admin/fabrics",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const body = AdminCreateFabricBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { manufacturerId, itemNumber, name, swatchImageUrl, grade, colorFamily, notes, isStripe, isActive, displayOrder } = body.data;

    const mfg = await db
      .select({ id: manufacturersTable.id })
      .from(manufacturersTable)
      .where(eq(manufacturersTable.id, manufacturerId))
      .limit(1);
    if (mfg.length === 0) {
      res.status(400).json({ error: "Manufacturer not found" });
      return;
    }

    try {
      const [row] = await db
        .insert(fabricsTable)
        .values({
          manufacturerId,
          itemNumber: itemNumber.trim(),
          name: name.trim(),
          swatchImageUrl: swatchImageUrl ?? null,
          grade: grade ?? null,
          colorFamily: colorFamily ?? null,
          notes: notes ?? null,
          isStripe: isStripe ?? false,
          isActive: isActive ?? true,
          displayOrder: displayOrder ?? 0,
        })
        .returning();

      const [full] = await db
        .select({
          id: fabricsTable.id,
          manufacturerId: fabricsTable.manufacturerId,
          manufacturerName: manufacturersTable.name,
          itemNumber: fabricsTable.itemNumber,
          name: fabricsTable.name,
          swatchImageUrl: fabricsTable.swatchImageUrl,
          grade: fabricsTable.grade,
          colorFamily: fabricsTable.colorFamily,
          notes: fabricsTable.notes,
          isStripe: fabricsTable.isStripe,
          isActive: fabricsTable.isActive,
          displayOrder: fabricsTable.displayOrder,
        })
        .from(fabricsTable)
        .innerJoin(manufacturersTable, eq(manufacturersTable.id, fabricsTable.manufacturerId))
        .where(eq(fabricsTable.id, row.id));

      res.status(201).json({
        ...full,
        swatchImageUrl: toPublicImageUrl(full.swatchImageUrl),
      });
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({ error: "Item number already exists for this manufacturer" });
        return;
      }
      req.log.error({ err }, "Failed to create fabric");
      res.status(500).json({ error: "Failed to create fabric" });
    }
  },
);

// ---------------------------------------------------------------------------
// Admin: update fabric
// ---------------------------------------------------------------------------
router.put(
  "/admin/fabrics/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateFabricParams.safeParse(req.params);
    const body = AdminUpdateFabricBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { id } = params.data;
    const { manufacturerId, itemNumber, name, swatchImageUrl, grade, colorFamily, notes, isStripe, isActive, displayOrder } = body.data;

    const existing = await db
      .select({ id: fabricsTable.id })
      .from(fabricsTable)
      .where(eq(fabricsTable.id, id))
      .limit(1);
    if (existing.length === 0) {
      res.status(404).json({ error: "Fabric not found" });
      return;
    }

    if (manufacturerId !== undefined) {
      const mfg = await db
        .select({ id: manufacturersTable.id })
        .from(manufacturersTable)
        .where(eq(manufacturersTable.id, manufacturerId))
        .limit(1);
      if (mfg.length === 0) {
        res.status(400).json({ error: "Manufacturer not found" });
        return;
      }
    }

    const updates: Partial<typeof fabricsTable.$inferInsert> = {};
    if (manufacturerId !== undefined) updates.manufacturerId = manufacturerId;
    if (itemNumber !== undefined) updates.itemNumber = itemNumber.trim();
    if (name !== undefined) updates.name = name.trim();
    if ("swatchImageUrl" in body.data) updates.swatchImageUrl = swatchImageUrl ?? null;
    if ("grade" in body.data) updates.grade = grade ?? null;
    if ("colorFamily" in body.data) updates.colorFamily = colorFamily ?? null;
    if ("notes" in body.data) updates.notes = notes ?? null;
    if (isStripe !== undefined) updates.isStripe = isStripe;
    if (isActive !== undefined) updates.isActive = isActive;
    if (displayOrder !== undefined) updates.displayOrder = displayOrder;

    try {
      await db.update(fabricsTable).set(updates).where(eq(fabricsTable.id, id));
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({ error: "Item number already exists for this manufacturer" });
        return;
      }
      req.log.error({ err }, "Failed to update fabric");
      res.status(500).json({ error: "Failed to update fabric" });
      return;
    }

    const [full] = await db
      .select({
        id: fabricsTable.id,
        manufacturerId: fabricsTable.manufacturerId,
        manufacturerName: manufacturersTable.name,
        itemNumber: fabricsTable.itemNumber,
        name: fabricsTable.name,
        swatchImageUrl: fabricsTable.swatchImageUrl,
        grade: fabricsTable.grade,
        colorFamily: fabricsTable.colorFamily,
        notes: fabricsTable.notes,
        isStripe: fabricsTable.isStripe,
        isActive: fabricsTable.isActive,
        displayOrder: fabricsTable.displayOrder,
      })
      .from(fabricsTable)
      .innerJoin(manufacturersTable, eq(manufacturersTable.id, fabricsTable.manufacturerId))
      .where(eq(fabricsTable.id, id));

    res.json({
      ...full,
      swatchImageUrl: toPublicImageUrl(full.swatchImageUrl),
    });
  },
);

// ---------------------------------------------------------------------------
// Admin: delete fabric
// ---------------------------------------------------------------------------
router.delete(
  "/admin/fabrics/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateFabricParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid fabric id" });
      return;
    }
    const { id } = params.data;

    const existing = await db
      .select({ id: fabricsTable.id })
      .from(fabricsTable)
      .where(eq(fabricsTable.id, id))
      .limit(1);
    if (existing.length === 0) {
      res.status(404).json({ error: "Fabric not found" });
      return;
    }

    // Check if any product has this fabric as an individual pick
    const [usage] = await db
      .select({ n: count() })
      .from(productFabricOptionsTable)
      .where(eq(productFabricOptionsTable.fabricId, id));
    if ((usage?.n ?? 0) > 0) {
      res.status(409).json({
        error: `This fabric is assigned to ${usage.n} product(s) and cannot be deleted. Remove it from those products first.`,
      });
      return;
    }

    try {
      await db.delete(fabricsTable).where(eq(fabricsTable.id, id));
      res.status(204).send();
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23503") {
        res.status(409).json({ error: "This fabric is in use and cannot be deleted." });
        return;
      }
      req.log.error({ err }, "Failed to delete fabric");
      res.status(500).json({ error: "Failed to delete fabric" });
    }
  },
);

// ---------------------------------------------------------------------------
// Admin: per-product fabric configuration (pools + individual picks)
// ---------------------------------------------------------------------------
async function loadFabricsConfig(productId: number) {
  const pools = await db
    .select({
      manufacturerId: productFabricPoolsTable.manufacturerId,
      manufacturerName: manufacturersTable.name,
      fabricCount: sql<number>`(
        SELECT COUNT(*)::int FROM fabrics f
        WHERE f.manufacturer_id = ${productFabricPoolsTable.manufacturerId}
          AND f.is_active = true
      )`,
    })
    .from(productFabricPoolsTable)
    .innerJoin(
      manufacturersTable,
      eq(manufacturersTable.id, productFabricPoolsTable.manufacturerId),
    )
    .where(eq(productFabricPoolsTable.productId, productId))
    .orderBy(asc(manufacturersTable.name));

  const opts = await db
    .select({ fabricId: productFabricOptionsTable.fabricId })
    .from(productFabricOptionsTable)
    .where(eq(productFabricOptionsTable.productId, productId))
    .orderBy(asc(productFabricOptionsTable.displayOrder));

  return {
    pools,
    fabricIds: opts.map((o) => o.fabricId),
  };
}

router.get(
  "/admin/products/:id/fabrics",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetProductFabricsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }
    const product = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id))
      .limit(1);
    if (product.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(await loadFabricsConfig(params.data.id));
  },
);

router.put(
  "/admin/products/:id/fabrics",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateProductFabricsParams.safeParse(req.params);
    const body = AdminUpdateProductFabricsBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const productId = params.data.id;
    const { manufacturerIds, fabricIds } = body.data;

    const product = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);
    if (product.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    // Validate references
    if (manufacturerIds.length > 0) {
      const found = await db
        .select({ id: manufacturersTable.id })
        .from(manufacturersTable)
        .where(inArray(manufacturersTable.id, manufacturerIds));
      if (found.length !== new Set(manufacturerIds).size) {
        res.status(400).json({ error: "Unknown manufacturer in pool list" });
        return;
      }
    }
    if (fabricIds.length > 0) {
      const found = await db
        .select({ id: fabricsTable.id })
        .from(fabricsTable)
        .where(inArray(fabricsTable.id, fabricIds));
      if (found.length !== new Set(fabricIds).size) {
        res.status(400).json({ error: "Unknown fabric id in picks" });
        return;
      }
    }

    const previousConfig = await loadFabricsConfig(productId);
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(productFabricPoolsTable)
          .where(eq(productFabricPoolsTable.productId, productId));
        if (manufacturerIds.length > 0) {
          const dedup = Array.from(new Set(manufacturerIds));
          await tx.insert(productFabricPoolsTable).values(
            dedup.map((mid) => ({
              productId,
              manufacturerId: mid,
            })),
          );
        }

        await tx
          .delete(productFabricOptionsTable)
          .where(eq(productFabricOptionsTable.productId, productId));
        if (fabricIds.length > 0) {
          const dedup = Array.from(new Set(fabricIds));
          await tx.insert(productFabricOptionsTable).values(
            dedup.map((fid, i) => ({
              productId,
              fabricId: fid,
              displayOrder: i,
            })),
          );
        }
      });
    } catch (err) {
      req.log.error({ err }, "Failed to save product fabrics");
      res.status(500).json({ error: "Failed to save product fabrics" });
      return;
    }

    const newConfig = await loadFabricsConfig(productId);
    await recordHistory(req, {
      entityType: "product_fabrics",
      entityId: productId,
      changeType: "replace",
      snapshot: newConfig,
      previousSnapshot: previousConfig,
    });
    res.json(newConfig);
  },
);

// ---------------------------------------------------------------------------
// Admin: list every finish (across manufacturers)
// ---------------------------------------------------------------------------
router.get(
  "/admin/finishes",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select({
        id: finishesTable.id,
        manufacturerId: finishesTable.manufacturerId,
        manufacturerName: manufacturersTable.name,
        itemNumber: finishesTable.itemNumber,
        name: finishesTable.name,
        imageUrl: finishesTable.imageUrl,
        description: finishesTable.description,
        collection: finishesTable.collection,
        isActive: finishesTable.isActive,
        displayOrder: finishesTable.displayOrder,
      })
      .from(finishesTable)
      .innerJoin(
        manufacturersTable,
        eq(manufacturersTable.id, finishesTable.manufacturerId),
      )
      .orderBy(
        asc(manufacturersTable.name),
        asc(finishesTable.displayOrder),
        asc(finishesTable.name),
      );
    res.json(
      rows.map((r) => ({
        ...r,
        imageUrl: toPublicImageUrl(r.imageUrl),
      })),
    );
  },
);

// ---------------------------------------------------------------------------
// Admin: create finish
// ---------------------------------------------------------------------------
router.post(
  "/admin/finishes",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const body = AdminCreateFinishBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { manufacturerId, itemNumber, name, imageUrl, description, collection, isActive, displayOrder } = body.data;

    const mfg = await db
      .select({ id: manufacturersTable.id })
      .from(manufacturersTable)
      .where(eq(manufacturersTable.id, manufacturerId))
      .limit(1);
    if (mfg.length === 0) {
      res.status(400).json({ error: "Manufacturer not found" });
      return;
    }

    try {
      const [row] = await db
        .insert(finishesTable)
        .values({
          manufacturerId,
          itemNumber: itemNumber?.trim() || null,
          name: name.trim(),
          imageUrl: imageUrl ?? null,
          description: description?.trim() || null,
          collection: collection?.trim() || null,
          isActive: isActive ?? true,
          displayOrder: displayOrder ?? 0,
        })
        .returning();

      const [full] = await db
        .select({
          id: finishesTable.id,
          manufacturerId: finishesTable.manufacturerId,
          manufacturerName: manufacturersTable.name,
          itemNumber: finishesTable.itemNumber,
          name: finishesTable.name,
          imageUrl: finishesTable.imageUrl,
          description: finishesTable.description,
          collection: finishesTable.collection,
          isActive: finishesTable.isActive,
          displayOrder: finishesTable.displayOrder,
        })
        .from(finishesTable)
        .innerJoin(manufacturersTable, eq(manufacturersTable.id, finishesTable.manufacturerId))
        .where(eq(finishesTable.id, row.id));

      res.status(201).json({
        ...full,
        imageUrl: toPublicImageUrl(full.imageUrl),
      });
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({ error: "Name already exists for this manufacturer" });
        return;
      }
      req.log.error({ err }, "Failed to create finish");
      res.status(500).json({ error: "Failed to create finish" });
    }
  },
);

// ---------------------------------------------------------------------------
// Admin: update finish
// ---------------------------------------------------------------------------
router.put(
  "/admin/finishes/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateFinishParams.safeParse(req.params);
    const body = AdminUpdateFinishBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { id } = params.data;
    const { manufacturerId, itemNumber, name, imageUrl, description, collection, isActive, displayOrder } = body.data;

    const existing = await db
      .select({ id: finishesTable.id })
      .from(finishesTable)
      .where(eq(finishesTable.id, id))
      .limit(1);
    if (existing.length === 0) {
      res.status(404).json({ error: "Finish not found" });
      return;
    }

    if (manufacturerId !== undefined) {
      const mfg = await db
        .select({ id: manufacturersTable.id })
        .from(manufacturersTable)
        .where(eq(manufacturersTable.id, manufacturerId))
        .limit(1);
      if (mfg.length === 0) {
        res.status(400).json({ error: "Manufacturer not found" });
        return;
      }
    }

    const updates: Partial<typeof finishesTable.$inferInsert> = {};
    if (manufacturerId !== undefined) updates.manufacturerId = manufacturerId;
    if ("itemNumber" in body.data) updates.itemNumber = itemNumber?.trim() || null;
    if (name !== undefined) updates.name = name.trim();
    if ("imageUrl" in body.data) updates.imageUrl = imageUrl ?? null;
    if ("description" in body.data) updates.description = description?.trim() || null;
    if ("collection" in body.data) updates.collection = collection?.trim() || null;
    if (isActive !== undefined) updates.isActive = isActive;
    if (displayOrder !== undefined) updates.displayOrder = displayOrder;

    try {
      await db.update(finishesTable).set(updates).where(eq(finishesTable.id, id));
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({ error: "Name already exists for this manufacturer" });
        return;
      }
      req.log.error({ err }, "Failed to update finish");
      res.status(500).json({ error: "Failed to update finish" });
      return;
    }

    const [full] = await db
      .select({
        id: finishesTable.id,
        manufacturerId: finishesTable.manufacturerId,
        manufacturerName: manufacturersTable.name,
        itemNumber: finishesTable.itemNumber,
        name: finishesTable.name,
        imageUrl: finishesTable.imageUrl,
        description: finishesTable.description,
        collection: finishesTable.collection,
        isActive: finishesTable.isActive,
        displayOrder: finishesTable.displayOrder,
      })
      .from(finishesTable)
      .innerJoin(manufacturersTable, eq(manufacturersTable.id, finishesTable.manufacturerId))
      .where(eq(finishesTable.id, id));

    res.json({
      ...full,
      imageUrl: toPublicImageUrl(full.imageUrl),
    });
  },
);

// ---------------------------------------------------------------------------
// Admin: delete finish
// ---------------------------------------------------------------------------
router.delete(
  "/admin/finishes/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminDeleteFinishParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid finish id" });
      return;
    }
    const { id } = params.data;

    const existing = await db
      .select({ id: finishesTable.id })
      .from(finishesTable)
      .where(eq(finishesTable.id, id))
      .limit(1);
    if (existing.length === 0) {
      res.status(404).json({ error: "Finish not found" });
      return;
    }

    const [usage] = await db
      .select({ n: count() })
      .from(productFinishOptionsTable)
      .where(eq(productFinishOptionsTable.finishId, id));
    if ((usage?.n ?? 0) > 0) {
      res.status(409).json({
        error: `This finish is assigned to ${usage.n} product(s) and cannot be deleted. Remove it from those products first.`,
      });
      return;
    }

    try {
      await db.delete(finishesTable).where(eq(finishesTable.id, id));
      res.status(204).send();
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23503") {
        res.status(409).json({ error: "This finish is in use and cannot be deleted." });
        return;
      }
      req.log.error({ err }, "Failed to delete finish");
      res.status(500).json({ error: "Failed to delete finish" });
    }
  },
);

// ---------------------------------------------------------------------------
// Admin: per-product finish configuration (pools + individual picks)
// ---------------------------------------------------------------------------
async function loadFinishesConfig(productId: number) {
  const pools = await db
    .select({
      manufacturerId: productFinishPoolsTable.manufacturerId,
      manufacturerName: manufacturersTable.name,
      finishCount: sql<number>`(
        SELECT COUNT(*)::int FROM finishes f
        WHERE f.manufacturer_id = ${productFinishPoolsTable.manufacturerId}
          AND f.is_active = true
      )`,
    })
    .from(productFinishPoolsTable)
    .innerJoin(
      manufacturersTable,
      eq(manufacturersTable.id, productFinishPoolsTable.manufacturerId),
    )
    .where(eq(productFinishPoolsTable.productId, productId))
    .orderBy(asc(manufacturersTable.name));

  const opts = await db
    .select({ finishId: productFinishOptionsTable.finishId })
    .from(productFinishOptionsTable)
    .where(eq(productFinishOptionsTable.productId, productId))
    .orderBy(asc(productFinishOptionsTable.displayOrder));

  return {
    pools,
    finishIds: opts.map((o) => o.finishId),
  };
}

router.get(
  "/admin/products/:id/finishes",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetProductFinishesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }
    const product = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id))
      .limit(1);
    if (product.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(await loadFinishesConfig(params.data.id));
  },
);

router.put(
  "/admin/products/:id/finishes",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateProductFinishesParams.safeParse(req.params);
    const body = AdminUpdateProductFinishesBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const productId = params.data.id;
    const { manufacturerIds, finishIds } = body.data;

    const product = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);
    if (product.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    if (manufacturerIds.length > 0) {
      const found = await db
        .select({ id: manufacturersTable.id })
        .from(manufacturersTable)
        .where(inArray(manufacturersTable.id, manufacturerIds));
      if (found.length !== new Set(manufacturerIds).size) {
        res.status(400).json({ error: "Unknown manufacturer in pool list" });
        return;
      }
    }
    if (finishIds.length > 0) {
      const found = await db
        .select({ id: finishesTable.id })
        .from(finishesTable)
        .where(inArray(finishesTable.id, finishIds));
      if (found.length !== new Set(finishIds).size) {
        res.status(400).json({ error: "Unknown finish id in picks" });
        return;
      }
    }

    const previousConfig = await loadFinishesConfig(productId);
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(productFinishPoolsTable)
          .where(eq(productFinishPoolsTable.productId, productId));
        if (manufacturerIds.length > 0) {
          const dedup = Array.from(new Set(manufacturerIds));
          await tx.insert(productFinishPoolsTable).values(
            dedup.map((mid) => ({
              productId,
              manufacturerId: mid,
            })),
          );
        }

        await tx
          .delete(productFinishOptionsTable)
          .where(eq(productFinishOptionsTable.productId, productId));
        if (finishIds.length > 0) {
          const dedup = Array.from(new Set(finishIds));
          await tx.insert(productFinishOptionsTable).values(
            dedup.map((fid, i) => ({
              productId,
              finishId: fid,
              displayOrder: i,
            })),
          );
        }
      });
    } catch (err) {
      req.log.error({ err }, "Failed to save product finishes");
      res.status(500).json({ error: "Failed to save product finishes" });
      return;
    }

    const newConfig = await loadFinishesConfig(productId);
    await recordHistory(req, {
      entityType: "product_finishes",
      entityId: productId,
      changeType: "replace",
      snapshot: newConfig,
      previousSnapshot: previousConfig,
    });
    res.json(newConfig);
  },
);

// ---------------------------------------------------------------------------
// Admin: per-finish product list — lets staff manage which products use a
// finish from the finish-side (the inverse of /admin/products/:id/finishes).
// Only operates on direct product_finish_options links; manufacturer-wide
// finish pools remain managed per-product.
// ---------------------------------------------------------------------------
async function loadFinishProducts(finishId: number) {
  const rows = await db
    .select({
      id: productsTable.id,
      name: productsTable.name,
      slug: productsTable.slug,
      sku: productsTable.sku,
      manufacturerName: manufacturersTable.name,
      isActive: productsTable.isActive,
      availableOnline: productsTable.availableOnline,
      primaryImageUrl: sql<string | null>`(
        select pi.url
        from product_images pi
        where pi.product_id = ${productsTable.id}
          and pi.image_kind = 'gallery'
        order by pi.is_primary desc, pi.display_order asc, pi.id asc
        limit 1
      )`,
    })
    .from(productFinishOptionsTable)
    .innerJoin(
      productsTable,
      eq(productsTable.id, productFinishOptionsTable.productId),
    )
    .leftJoin(
      manufacturersTable,
      eq(manufacturersTable.id, productsTable.manufacturerId),
    )
    .where(eq(productFinishOptionsTable.finishId, finishId))
    .orderBy(asc(productsTable.name));

  return {
    products: rows.map((r) => ({
      ...r,
      primaryImageUrl: toPublicImageUrl(r.primaryImageUrl),
    })),
  };
}

router.get(
  "/admin/finishes/:id/products",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminListFinishProductsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid finish id" });
      return;
    }
    const finish = await db
      .select({ id: finishesTable.id })
      .from(finishesTable)
      .where(eq(finishesTable.id, params.data.id))
      .limit(1);
    if (finish.length === 0) {
      res.status(404).json({ error: "Finish not found" });
      return;
    }
    res.json(await loadFinishProducts(params.data.id));
  },
);

router.put(
  "/admin/finishes/:id/products",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateFinishProductsParams.safeParse(req.params);
    const body = AdminUpdateFinishProductsBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const finishId = params.data.id;
    const { productIds } = body.data;

    const finish = await db
      .select({ id: finishesTable.id })
      .from(finishesTable)
      .where(eq(finishesTable.id, finishId))
      .limit(1);
    if (finish.length === 0) {
      res.status(404).json({ error: "Finish not found" });
      return;
    }

    if (productIds.length > 0) {
      const found = await db
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(inArray(productsTable.id, productIds));
      if (found.length !== new Set(productIds).size) {
        res.status(400).json({ error: "Unknown product id" });
        return;
      }
    }

    const previous = await loadFinishProducts(finishId);
    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(productFinishOptionsTable)
          .where(eq(productFinishOptionsTable.finishId, finishId));
        if (productIds.length > 0) {
          const dedup = Array.from(new Set(productIds));
          await tx.insert(productFinishOptionsTable).values(
            dedup.map((pid, i) => ({
              productId: pid,
              finishId,
              displayOrder: i,
            })),
          );
        }
      });
    } catch (err) {
      req.log.error({ err }, "Failed to save finish products");
      res.status(500).json({ error: "Failed to save finish products" });
      return;
    }

    const next = await loadFinishProducts(finishId);
    await recordHistory(req, {
      entityType: "finish_products",
      entityId: finishId,
      changeType: "replace",
      snapshot: next,
      previousSnapshot: previous,
    });
    res.json(next);
  },
);

// ---------------------------------------------------------------------------
// Admin: per-product attributes (features / options / replacement parts)
// ---------------------------------------------------------------------------
router.get(
  "/admin/products/:id/attributes",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetProductAttributesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }
    const product = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id))
      .limit(1);
    if (product.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const rows = await db
      .select({
        id: productAttributesTable.id,
        attributeType: productAttributesTable.attributeType,
        partName: productAttributesTable.partName,
        value: productAttributesTable.value,
        displayOrder: productAttributesTable.displayOrder,
      })
      .from(productAttributesTable)
      .where(eq(productAttributesTable.productId, params.data.id))
      .orderBy(
        asc(productAttributesTable.attributeType),
        asc(productAttributesTable.displayOrder),
      );
    res.json(rows);
  },
);

router.put(
  "/admin/products/:id/attributes",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateProductAttributesParams.safeParse(req.params);
    const body = AdminUpdateProductAttributesBody.safeParse(req.body);
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
    const productId = params.data.id;

    // Per-row business rule: replacement_part REQUIRES partName,
    // others MUST NOT have partName. Mirror the DB CHECK. Also enforce
    // that `value` is non-empty after trimming (the zod schema only
    // checks pre-trim length, so " " would otherwise sneak through).
    for (const a of body.data.attributes) {
      if (a.value.trim() === "") {
        res.status(400).json({ error: "Attribute value cannot be blank." });
        return;
      }
      const isPart = a.attributeType === "replacement_part";
      const hasPart = a.partName != null && a.partName.trim() !== "";
      if (isPart && !hasPart) {
        res
          .status(400)
          .json({ error: "Replacement parts must have a part name." });
        return;
      }
      if (!isPart && hasPart) {
        res.status(400).json({
          error: "Only replacement parts may have a part name.",
        });
        return;
      }
    }

    const product = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);
    if (product.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const previousAttrs = await db
      .select({
        id: productAttributesTable.id,
        attributeType: productAttributesTable.attributeType,
        partName: productAttributesTable.partName,
        value: productAttributesTable.value,
        displayOrder: productAttributesTable.displayOrder,
      })
      .from(productAttributesTable)
      .where(eq(productAttributesTable.productId, productId))
      .orderBy(
        asc(productAttributesTable.attributeType),
        asc(productAttributesTable.displayOrder),
      );

    try {
      await db.transaction(async (tx) => {
        await tx
          .delete(productAttributesTable)
          .where(eq(productAttributesTable.productId, productId));
        if (body.data.attributes.length > 0) {
          await tx.insert(productAttributesTable).values(
            body.data.attributes.map((a) => ({
              productId,
              attributeType: a.attributeType,
              partName:
                a.attributeType === "replacement_part"
                  ? (a.partName?.trim() ?? null)
                  : null,
              value: a.value.trim(),
              displayOrder: a.displayOrder,
            })),
          );
        }
      });
    } catch (err) {
      req.log.error({ err }, "Failed to save product attributes");
      res.status(500).json({ error: "Failed to save product attributes" });
      return;
    }

    const rows = await db
      .select({
        id: productAttributesTable.id,
        attributeType: productAttributesTable.attributeType,
        partName: productAttributesTable.partName,
        value: productAttributesTable.value,
        displayOrder: productAttributesTable.displayOrder,
      })
      .from(productAttributesTable)
      .where(eq(productAttributesTable.productId, productId))
      .orderBy(
        asc(productAttributesTable.attributeType),
        asc(productAttributesTable.displayOrder),
      );
    await recordHistory(req, {
      entityType: "product_attributes",
      entityId: productId,
      changeType: "replace",
      snapshot: { attributes: rows },
      previousSnapshot: { attributes: previousAttrs },
    });
    res.json(rows);
  },
);

// ---------------------------------------------------------------------------
// Admin: list finish collections
// ---------------------------------------------------------------------------
router.get(
  "/admin/finish-collections",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const mfgId = req.query.manufacturerId ? Number(req.query.manufacturerId) : null;
    const rows = await db
      .select({
        id: finishCollectionsTable.id,
        manufacturerId: finishCollectionsTable.manufacturerId,
        manufacturerName: manufacturersTable.name,
        collectionName: finishCollectionsTable.collectionName,
        panelImageUrl: finishCollectionsTable.panelImageUrl,
        displayOrder: finishCollectionsTable.displayOrder,
        isActive: finishCollectionsTable.isActive,
      })
      .from(finishCollectionsTable)
      .innerJoin(manufacturersTable, eq(manufacturersTable.id, finishCollectionsTable.manufacturerId))
      .where(mfgId ? eq(finishCollectionsTable.manufacturerId, mfgId) : undefined)
      .orderBy(asc(manufacturersTable.name), asc(finishCollectionsTable.displayOrder), asc(finishCollectionsTable.collectionName));
    res.json(rows.map((r) => ({ ...r, panelImageUrl: toPublicImageUrl(r.panelImageUrl) })));
  },
);

// ---------------------------------------------------------------------------
// Admin: create finish collection
// ---------------------------------------------------------------------------
router.post(
  "/admin/finish-collections",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const body = AdminCreateFinishCollectionBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: body.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { manufacturerId, collectionName, panelImageUrl, displayOrder, isActive } = body.data;

    const mfg = await db
      .select({ id: manufacturersTable.id })
      .from(manufacturersTable)
      .where(eq(manufacturersTable.id, manufacturerId))
      .limit(1);
    if (mfg.length === 0) {
      res.status(400).json({ error: "Manufacturer not found" });
      return;
    }

    try {
      const [row] = await db
        .insert(finishCollectionsTable)
        .values({
          manufacturerId,
          collectionName: collectionName.trim(),
          panelImageUrl: panelImageUrl ?? null,
          displayOrder: displayOrder ?? 0,
          isActive: isActive ?? true,
        })
        .returning();

      const [full] = await db
        .select({
          id: finishCollectionsTable.id,
          manufacturerId: finishCollectionsTable.manufacturerId,
          manufacturerName: manufacturersTable.name,
          collectionName: finishCollectionsTable.collectionName,
          panelImageUrl: finishCollectionsTable.panelImageUrl,
          displayOrder: finishCollectionsTable.displayOrder,
          isActive: finishCollectionsTable.isActive,
        })
        .from(finishCollectionsTable)
        .innerJoin(manufacturersTable, eq(manufacturersTable.id, finishCollectionsTable.manufacturerId))
        .where(eq(finishCollectionsTable.id, row.id));

      res.status(201).json({ ...full, panelImageUrl: toPublicImageUrl(full.panelImageUrl) });
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({ error: "A collection with that name already exists for this manufacturer" });
        return;
      }
      req.log.error({ err }, "Failed to create finish collection");
      res.status(500).json({ error: "Failed to create finish collection" });
    }
  },
);

// ---------------------------------------------------------------------------
// Admin: update finish collection
// ---------------------------------------------------------------------------
router.put(
  "/admin/finish-collections/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateFinishCollectionParams.safeParse(req.params);
    const body = AdminUpdateFinishCollectionBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const { id } = params.data;
    const { collectionName, panelImageUrl, displayOrder, isActive } = body.data;

    const existing = await db
      .select({ id: finishCollectionsTable.id })
      .from(finishCollectionsTable)
      .where(eq(finishCollectionsTable.id, id))
      .limit(1);
    if (existing.length === 0) {
      res.status(404).json({ error: "Finish collection not found" });
      return;
    }

    const updates: Partial<typeof finishCollectionsTable.$inferInsert> = {};
    if (collectionName !== undefined) updates.collectionName = collectionName.trim();
    if ("panelImageUrl" in body.data) updates.panelImageUrl = panelImageUrl ?? null;
    if (displayOrder !== undefined) updates.displayOrder = displayOrder;
    if (isActive !== undefined) updates.isActive = isActive;

    try {
      await db.update(finishCollectionsTable).set(updates).where(eq(finishCollectionsTable.id, id));
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res.status(409).json({ error: "A collection with that name already exists for this manufacturer" });
        return;
      }
      req.log.error({ err }, "Failed to update finish collection");
      res.status(500).json({ error: "Failed to update finish collection" });
      return;
    }

    const [full] = await db
      .select({
        id: finishCollectionsTable.id,
        manufacturerId: finishCollectionsTable.manufacturerId,
        manufacturerName: manufacturersTable.name,
        collectionName: finishCollectionsTable.collectionName,
        panelImageUrl: finishCollectionsTable.panelImageUrl,
        displayOrder: finishCollectionsTable.displayOrder,
        isActive: finishCollectionsTable.isActive,
      })
      .from(finishCollectionsTable)
      .innerJoin(manufacturersTable, eq(manufacturersTable.id, finishCollectionsTable.manufacturerId))
      .where(eq(finishCollectionsTable.id, id));

    res.json({ ...full, panelImageUrl: toPublicImageUrl(full.panelImageUrl) });
  },
);

// ---------------------------------------------------------------------------
// Admin: per-product variants + grade pricing
// ---------------------------------------------------------------------------
async function loadVariantsConfig(productId: number) {
  const variants = await db
    .select({
      id: productVariantsTable.id,
      variantSku: productVariantsTable.variantSku,
      variantName: productVariantsTable.variantName,
      optionLabel: productVariantsTable.optionLabel,
      priceAdjustment: productVariantsTable.priceAdjustment,
      msrp: productVariantsTable.msrp,
      salePrice: productVariantsTable.salePrice,
      shippingSurcharge: productVariantsTable.shippingSurcharge,
      weight: productVariantsTable.weight,
      notes: productVariantsTable.notes,
      minOrderQty: productVariantsTable.minOrderQty,
      excludeStripeFabrics: productVariantsTable.excludeStripeFabrics,
      displayOrder: productVariantsTable.displayOrder,
      isActive: productVariantsTable.isActive,
    })
    .from(productVariantsTable)
    .where(eq(productVariantsTable.productId, productId))
    .orderBy(asc(productVariantsTable.displayOrder), asc(productVariantsTable.id));

  if (variants.length === 0) return { variants: [] };

  const prices = await db
    .select({
      variantId: variantGradePricesTable.variantId,
      grade: variantGradePricesTable.grade,
      msrp: variantGradePricesTable.msrp,
      salePrice: variantGradePricesTable.salePrice,
    })
    .from(variantGradePricesTable)
    .where(
      inArray(
        variantGradePricesTable.variantId,
        variants.map((v) => v.id),
      ),
    )
    .orderBy(asc(variantGradePricesTable.grade));

  const byVariant = new Map<number, { grade: string; msrp: string; salePrice: string }[]>();
  for (const p of prices) {
    const list = byVariant.get(p.variantId) ?? [];
    list.push({ grade: p.grade, msrp: p.msrp, salePrice: p.salePrice });
    byVariant.set(p.variantId, list);
  }

  return {
    variants: variants.map((v) => ({
      ...v,
      gradePrices: byVariant.get(v.id) ?? [],
    })),
  };
}

router.get(
  "/admin/products/:id/variants",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetProductVariantsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid product id" });
      return;
    }
    const product = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, params.data.id))
      .limit(1);
    if (product.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    res.json(await loadVariantsConfig(params.data.id));
  },
);

router.put(
  "/admin/products/:id/variants",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateProductVariantsParams.safeParse(req.params);
    const body = AdminUpdateProductVariantsBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const productId = params.data.id;
    const { variants } = body.data;

    const product = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(eq(productsTable.id, productId))
      .limit(1);
    if (product.length === 0) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    // Reject duplicate SKUs within the submitted set.
    const skus = variants.map((v) => v.variantSku.trim());
    if (new Set(skus).size !== skus.length) {
      res.status(400).json({ error: "Duplicate variant SKU in submission" });
      return;
    }
    // Reject duplicate grade rows within a single variant.
    for (const v of variants) {
      const grades = v.gradePrices.map((g) => g.grade.trim());
      if (new Set(grades).size !== grades.length) {
        res
          .status(400)
          .json({ error: `Duplicate grade for variant "${v.variantSku}"` });
        return;
      }
    }

    // Field-level validation: required identifiers + well-formed money/qty.
    // These are config rows that feed dynamic SKUs and pricing, so reject
    // malformed input with a clear 400 rather than 500-ing on a DB parse error.
    const money = /^\d+(\.\d{1,2})?$/;
    const signedMoney = /^-?\d+(\.\d{1,2})?$/;
    for (const v of variants) {
      if (v.variantSku.trim() === "" || v.variantName.trim() === "") {
        res
          .status(400)
          .json({ error: "Every variant needs a SKU and a name" });
        return;
      }
      if (
        v.priceAdjustment != null &&
        v.priceAdjustment.trim() !== "" &&
        !signedMoney.test(v.priceAdjustment.trim())
      ) {
        res.status(400).json({
          error: `Invalid price adjustment for variant "${v.variantSku}"`,
        });
        return;
      }
      if (
        v.msrp != null &&
        v.msrp.trim() !== "" &&
        !money.test(v.msrp.trim())
      ) {
        res.status(400).json({
          error: `Invalid MSRP for variant "${v.variantSku}"`,
        });
        return;
      }
      if (
        v.salePrice != null &&
        v.salePrice.trim() !== "" &&
        !money.test(v.salePrice.trim())
      ) {
        res.status(400).json({
          error: `Invalid sale price for variant "${v.variantSku}"`,
        });
        return;
      }
      // Absolute per-variant pricing is keyed on MSRP across PDP/cart/checkout.
      // A sale price without an MSRP would be silently ignored (falling back to
      // base pricing), so reject that ambiguous state rather than misprice.
      {
        const hasMsrp = v.msrp != null && v.msrp.trim() !== "";
        const hasSale = v.salePrice != null && v.salePrice.trim() !== "";
        if (hasSale && !hasMsrp) {
          res.status(400).json({
            error: `Variant "${v.variantSku}" has a sale price but no MSRP. Set an MSRP to enable per-variant pricing, or clear the sale price.`,
          });
          return;
        }
      }
      if (
        v.shippingSurcharge != null &&
        v.shippingSurcharge.trim() !== "" &&
        !money.test(v.shippingSurcharge.trim())
      ) {
        res.status(400).json({
          error: `Invalid shipping surcharge for variant "${v.variantSku}"`,
        });
        return;
      }
      if (
        v.weight != null &&
        v.weight.trim() !== "" &&
        !money.test(v.weight.trim())
      ) {
        res.status(400).json({
          error: `Invalid weight for variant "${v.variantSku}"`,
        });
        return;
      }
      if (
        v.minOrderQty != null &&
        (!Number.isInteger(v.minOrderQty) || v.minOrderQty < 0)
      ) {
        res.status(400).json({
          error: `Invalid minimum order quantity for variant "${v.variantSku}"`,
        });
        return;
      }
      for (const g of v.gradePrices) {
        if (
          g.grade.trim() === "" ||
          !money.test(g.msrp.trim()) ||
          !money.test(g.salePrice.trim())
        ) {
          res.status(400).json({
            error: `Invalid grade price for variant "${v.variantSku}"`,
          });
          return;
        }
      }
    }

    const previousConfig = await loadVariantsConfig(productId);
    try {
      await db.transaction(async (tx) => {
        // Keyed upsert (matched by variantSku) instead of delete-all + reinsert.
        // product_variants.id is referenced by cart_items.variant_id with ON
        // DELETE CASCADE, so churning IDs on every save would silently drop
        // customers' cart lines. Preserve identity: update existing rows,
        // insert new ones, and delete only the variants that were removed.
        const existing = await tx
          .select({
            id: productVariantsTable.id,
            variantSku: productVariantsTable.variantSku,
          })
          .from(productVariantsTable)
          .where(eq(productVariantsTable.productId, productId));
        const existingBySku = new Map(
          existing.map((e) => [e.variantSku, e.id]),
        );
        const submittedSkus = new Set(variants.map((v) => v.variantSku.trim()));

        const removedIds = existing
          .filter((e) => !submittedSkus.has(e.variantSku))
          .map((e) => e.id);
        if (removedIds.length > 0) {
          await tx
            .delete(productVariantsTable)
            .where(inArray(productVariantsTable.id, removedIds));
        }

        for (let i = 0; i < variants.length; i++) {
          const v = variants[i]!;
          const sku = v.variantSku.trim();
          const values = {
            variantName: v.variantName.trim(),
            optionLabel: v.optionLabel.trim() || "Option",
            priceAdjustment: v.priceAdjustment ?? "0",
            msrp:
              v.msrp != null && v.msrp.trim() !== "" ? v.msrp.trim() : null,
            salePrice:
              v.salePrice != null && v.salePrice.trim() !== ""
                ? v.salePrice.trim()
                : null,
            shippingSurcharge:
              v.shippingSurcharge != null && v.shippingSurcharge.trim() !== ""
                ? v.shippingSurcharge.trim()
                : "0",
            weight:
              v.weight != null && v.weight.trim() !== ""
                ? v.weight.trim()
                : null,
            notes: v.notes?.trim() || null,
            minOrderQty: v.minOrderQty ?? null,
            excludeStripeFabrics: v.excludeStripeFabrics ?? false,
            displayOrder: v.displayOrder ?? i,
            isActive: v.isActive ?? true,
          };

          let variantId = existingBySku.get(sku);
          if (variantId != null) {
            await tx
              .update(productVariantsTable)
              .set(values)
              .where(eq(productVariantsTable.id, variantId));
            // Grade prices have no inbound cart FK, so replace them wholesale.
            await tx
              .delete(variantGradePricesTable)
              .where(eq(variantGradePricesTable.variantId, variantId));
          } else {
            const [row] = await tx
              .insert(productVariantsTable)
              .values({ productId, variantSku: sku, ...values })
              .returning({ id: productVariantsTable.id });
            variantId = row!.id;
          }

          if (v.gradePrices.length > 0) {
            await tx.insert(variantGradePricesTable).values(
              v.gradePrices.map((g) => ({
                variantId: variantId!,
                grade: g.grade.trim(),
                msrp: g.msrp,
                salePrice: g.salePrice,
              })),
            );
          }
        }
      });
    } catch (err: unknown) {
      const pgErr = err as { code?: string };
      if (pgErr.code === "23505") {
        res
          .status(409)
          .json({ error: "A variant SKU is already in use by another product" });
        return;
      }
      req.log.error({ err }, "Failed to save product variants");
      res.status(500).json({ error: "Failed to save product variants" });
      return;
    }

    const newConfig = await loadVariantsConfig(productId);
    await recordHistory(req, {
      entityType: "product_variants",
      entityId: productId,
      changeType: "replace",
      snapshot: newConfig,
      previousSnapshot: previousConfig,
    });
    res.json(newConfig);
  },
);

export default router;
