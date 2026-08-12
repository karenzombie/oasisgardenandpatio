import { Router, type IRouter, type Request, type Response } from "express";
import { eq, sql, asc, inArray } from "drizzle-orm";
import {
  db,
  productSetsTable,
  productSetItemsTable,
  productsTable,
  productImagesTable,
  manufacturersTable,
  type ProductSet,
} from "@workspace/db";
import {
  AdminCreateSetBody,
  AdminUpdateSetParams,
  AdminUpdateSetBody,
  AdminGetSetParams,
  AdminSetSetActiveParams,
  AdminSetSetActiveBody,
  AdminReplaceSetItemsParams,
  AdminReplaceSetItemsBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { isUniqueViolation } from "../lib/dbErrors";
import { recordHistory } from "../lib/history";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

type SummaryRow = {
  set: ProductSet;
  manufacturerName: string | null;
  itemCount: number;
};

function toSummaryPayload({ set, manufacturerName, itemCount }: SummaryRow) {
  return {
    id: set.id,
    name: set.name,
    slug: set.slug,
    sku: set.sku,
    description: set.description,
    manufacturerId: set.manufacturerId,
    manufacturerName,
    setPrice: set.setPrice,
    isActive: set.isActive,
    displayOrder: set.displayOrder,
    itemCount,
    createdAt: set.createdAt.toISOString(),
    updatedAt: set.updatedAt.toISOString(),
  };
}

type ItemRow = {
  id: number;
  setId: number;
  productId: number;
  productSku: string;
  productName: string;
  productPrice: string | null;
  productPrimaryImageUrl: string | null;
  quantity: number;
  displayOrder: number;
};

async function loadSetItems(setId: number): Promise<ItemRow[]> {
  const rows = await db
    .select({
      id: productSetItemsTable.id,
      setId: productSetItemsTable.setId,
      productId: productSetItemsTable.productId,
      quantity: productSetItemsTable.quantity,
      displayOrder: productSetItemsTable.displayOrder,
      productSku: productsTable.sku,
      productName: productsTable.name,
      productPrice: productsTable.price,
      productMsrp: productsTable.msrp,
      productPrimaryImageUrl: sql<string | null>`(
        select ${productImagesTable.url}
        from ${productImagesTable}
        where ${productImagesTable.productId} = ${productsTable.id}
          and ${productImagesTable.isPrimary} = true
        order by ${productImagesTable.displayOrder} asc
        limit 1
      )`,
    })
    .from(productSetItemsTable)
    .innerJoin(
      productsTable,
      eq(productsTable.id, productSetItemsTable.productId),
    )
    .where(eq(productSetItemsTable.setId, setId))
    .orderBy(
      asc(productSetItemsTable.displayOrder),
      asc(productSetItemsTable.id),
    );
  return rows.map((r) => ({
    ...r,
    productPrimaryImageUrl: toPublicImageUrl(r.productPrimaryImageUrl),
  }));
}

async function loadSummary(setId: number): Promise<SummaryRow | null> {
  const [row] = await db
    .select({
      set: productSetsTable,
      manufacturerName: manufacturersTable.name,
      itemCount: sql<number>`(
        select count(*)::int
        from ${productSetItemsTable}
        where ${productSetItemsTable.setId} = ${productSetsTable.id}
      )`,
    })
    .from(productSetsTable)
    .leftJoin(
      manufacturersTable,
      eq(manufacturersTable.id, productSetsTable.manufacturerId),
    )
    .where(eq(productSetsTable.id, setId));
  return row ?? null;
}

async function loadFullSet(setId: number) {
  const summary = await loadSummary(setId);
  if (!summary) return null;
  const items = await loadSetItems(setId);
  return { ...toSummaryPayload(summary), items };
}

// ----- LIST -----
router.get(
  "/admin/sets",
  requireAuth,
  requireRole("admin", "agent"),
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select({
        set: productSetsTable,
        manufacturerName: manufacturersTable.name,
        itemCount: sql<number>`(
          select count(*)::int
          from ${productSetItemsTable}
          where ${productSetItemsTable.setId} = ${productSetsTable.id}
        )`,
      })
      .from(productSetsTable)
      .leftJoin(
        manufacturersTable,
        eq(manufacturersTable.id, productSetsTable.manufacturerId),
      )
      .orderBy(
        asc(productSetsTable.displayOrder),
        asc(productSetsTable.name),
      );
    res.json(rows.map(toSummaryPayload));
  },
);

// ----- DETAIL -----
router.get(
  "/admin/sets/:id",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetSetParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid set id" });
      return;
    }
    const full = await loadFullSet(params.data.id);
    if (!full) {
      res.status(404).json({ error: "Set not found" });
      return;
    }
    res.json(full);
  },
);

// ----- CREATE -----
router.post(
  "/admin/sets",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateSetBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    try {
      const [row] = await db
        .insert(productSetsTable)
        .values({
          name: parsed.data.name,
          slug: parsed.data.slug,
          sku: parsed.data.sku ?? null,
          description: parsed.data.description ?? null,
          manufacturerId: parsed.data.manufacturerId ?? null,
          setPrice: parsed.data.setPrice ?? null,
          displayOrder: parsed.data.displayOrder ?? 0,
          isActive: parsed.data.isActive ?? true,
        })
        .returning();
      const full = await loadFullSet(row.id);
      await recordHistory(req, {
        entityType: "product_set",
        entityId: row.id,
        changeType: "create",
        snapshot: full,
      });
      res.status(201).json(full);
    } catch (err) {
      if (isUniqueViolation(err)) {
        res
          .status(409)
          .json({ error: "A set with that slug or SKU already exists" });
        return;
      }
      req.log.error({ err }, "Failed to create set");
      res.status(500).json({ error: "Failed to create set" });
    }
  },
);

// ----- UPDATE METADATA -----
router.put(
  "/admin/sets/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateSetParams.safeParse(req.params);
    const body = AdminUpdateSetBody.safeParse(req.body);
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
    const previous = await loadFullSet(params.data.id);
    try {
      const [row] = await db
        .update(productSetsTable)
        .set({
          name: body.data.name,
          slug: body.data.slug,
          sku: body.data.sku ?? null,
          description: body.data.description ?? null,
          manufacturerId: body.data.manufacturerId ?? null,
          setPrice: body.data.setPrice ?? null,
          ...(body.data.displayOrder !== undefined
            ? { displayOrder: body.data.displayOrder }
            : {}),
          ...(body.data.isActive !== undefined
            ? { isActive: body.data.isActive }
            : {}),
        })
        .where(eq(productSetsTable.id, params.data.id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "Set not found" });
        return;
      }
      const full = await loadFullSet(row.id);
      await recordHistory(req, {
        entityType: "product_set",
        entityId: row.id,
        changeType: "update",
        snapshot: full,
        previousSnapshot: previous,
      });
      res.json(full);
    } catch (err) {
      if (isUniqueViolation(err)) {
        res
          .status(409)
          .json({ error: "A set with that slug or SKU already exists" });
        return;
      }
      req.log.error({ err }, "Failed to update set");
      res.status(500).json({ error: "Failed to update set" });
    }
  },
);

// ----- TOGGLE ACTIVE -----
router.patch(
  "/admin/sets/:id/active",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminSetSetActiveParams.safeParse(req.params);
    const body = AdminSetSetActiveBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const previous = await loadFullSet(params.data.id);
    const [row] = await db
      .update(productSetsTable)
      .set({ isActive: body.data.isActive })
      .where(eq(productSetsTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Set not found" });
      return;
    }
    const summary = await loadSummary(row.id);
    if (!summary) {
      res.status(404).json({ error: "Set not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "product_set",
      entityId: row.id,
      changeType: "update",
      snapshot: await loadFullSet(row.id),
      previousSnapshot: previous,
      notes: `set isActive=${body.data.isActive}`,
    });
    res.json(toSummaryPayload(summary));
  },
);

// ----- REPLACE ITEMS (atomic) -----
router.put(
  "/admin/sets/:id/items",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminReplaceSetItemsParams.safeParse(req.params);
    const body = AdminReplaceSetItemsBody.safeParse(req.body);
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

    const setId = params.data.id;
    const incoming = body.data.items;

    // Reject duplicate productIds in payload
    const seen = new Set<number>();
    for (const it of incoming) {
      if (seen.has(it.productId)) {
        res.status(400).json({
          error: `Product id ${it.productId} appears more than once in items`,
        });
        return;
      }
      seen.add(it.productId);
    }

    try {
      const result = await db.transaction(async (tx) => {
        // Lock the set row to serialize concurrent edits
        const [setRow] = await tx
          .select()
          .from(productSetsTable)
          .where(eq(productSetsTable.id, setId))
          .for("update");
        if (!setRow) return { notFound: true as const };

        // Validate all productIds exist before any writes
        if (incoming.length > 0) {
          const existing = await tx
            .select({ id: productsTable.id })
            .from(productsTable)
            .where(
              inArray(
                productsTable.id,
                incoming.map((i) => i.productId),
              ),
            );
          const existingIds = new Set(existing.map((r) => r.id));
          const missing = incoming
            .map((i) => i.productId)
            .filter((id) => !existingIds.has(id));
          if (missing.length > 0) {
            return {
              badRequest: `Unknown product id(s): ${missing.join(", ")}` as const,
            };
          }
        }

        // Wipe + reinsert
        await tx
          .delete(productSetItemsTable)
          .where(eq(productSetItemsTable.setId, setId));

        if (incoming.length > 0) {
          await tx.insert(productSetItemsTable).values(
            incoming.map((it, idx) => ({
              setId,
              productId: it.productId,
              quantity: it.quantity ?? 1,
              displayOrder: it.displayOrder ?? idx,
            })),
          );
        }

        // Touch updated_at on the parent set
        await tx
          .update(productSetsTable)
          .set({ updatedAt: new Date() })
          .where(eq(productSetsTable.id, setId));

        return { ok: true as const };
      });

      if ("notFound" in result) {
        res.status(404).json({ error: "Set not found" });
        return;
      }
      if ("badRequest" in result) {
        res.status(400).json({ error: result.badRequest });
        return;
      }

      const full = await loadFullSet(setId);
      await recordHistory(req, {
        entityType: "product_set_items",
        entityId: setId,
        changeType: "replace",
        snapshot: { items: full?.items ?? [] },
        notes: `replaced items (${incoming.length})`,
      });
      res.json(full);
    } catch (err) {
      req.log.error({ err, setId }, "Failed to replace set items");
      res.status(500).json({ error: "Failed to replace set items" });
    }
  },
);

export default router;
