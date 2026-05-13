import { Router, type IRouter, type Request, type Response } from "express";
import { asc, eq, inArray, sql, count } from "drizzle-orm";
import {
  db,
  fabricsTable,
  manufacturersTable,
  productsTable,
  productFabricOptionsTable,
  productFabricPoolsTable,
  productAttributesTable,
} from "@workspace/db";
import {
  AdminCreateFabricBody,
  AdminUpdateFabricParams,
  AdminUpdateFabricBody,
  AdminGetProductFabricsParams,
  AdminUpdateProductFabricsParams,
  AdminUpdateProductFabricsBody,
  AdminGetProductAttributesParams,
  AdminUpdateProductAttributesParams,
  AdminUpdateProductAttributesBody,
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
    const { manufacturerId, itemNumber, name, swatchImageUrl, grade, isActive, displayOrder } = body.data;

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
    const { manufacturerId, itemNumber, name, swatchImageUrl, grade, isActive, displayOrder } = body.data;

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

export default router;
