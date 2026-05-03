import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
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
  AdminGetProductFabricsParams,
  AdminUpdateProductFabricsParams,
  AdminUpdateProductFabricsBody,
  AdminGetProductAttributesParams,
  AdminUpdateProductAttributesParams,
  AdminUpdateProductAttributesBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordHistory } from "../lib/history";

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
    res.json(rows);
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

// silence unused import warning when no usage of `and`
void and;

export default router;
