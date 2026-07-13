import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, exists, sql } from "drizzle-orm";
import {
  db,
  categoriesTable,
  productsTable,
  type Category,
} from "@workspace/db";
import {
  ListCategoriesResponse,
  AdminListCategoriesResponse,
  AdminCreateCategoryBody,
  AdminUpdateCategoryParams,
  AdminUpdateCategoryBody,
  AdminSetCategoryActiveParams,
  AdminSetCategoryActiveBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { isUniqueViolation } from "../lib/dbErrors";
import { recordHistory } from "../lib/history";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

// Public list of active categories (for storefront)
router.get("/categories", async (req, res): Promise<void> => {
  const onlineOnly = req.query.onlineOnly === "true";

  const productConditions = [
    eq(productsTable.categoryId, categoriesTable.id),
    eq(productsTable.isActive, true),
  ];
  if (onlineOnly) {
    productConditions.push(eq(productsTable.catalogVisible, true));
    productConditions.push(eq(productsTable.quoteOnly, false));
    productConditions.push(eq(productsTable.inStoreOnly, false));
    productConditions.push(eq(productsTable.showPriceOnline, true));
    productConditions.push(sql`${productsTable.price} IS NOT NULL`);
    productConditions.push(sql`${productsTable.price} > 0`);
  }

  const rows = await db
    .select({
      id: categoriesTable.id,
      name: categoriesTable.name,
      slug: categoriesTable.slug,
      parentId: categoriesTable.parentId,
      imageUrl: categoriesTable.imageUrl,
      displayOrder: categoriesTable.displayOrder,
    })
    .from(categoriesTable)
    .where(
      and(
        eq(categoriesTable.isActive, true),
        exists(
          db
            .select({ v: sql`1` })
            .from(productsTable)
            .where(and(...productConditions)),
        ),
      ),
    )
    .orderBy(
      sql`${categoriesTable.displayOrder} asc`,
      sql`${categoriesTable.name} asc`,
    );

  res.json(ListCategoriesResponse.parse(rows.map((r) => ({
    ...r,
    imageUrl: toPublicImageUrl(r.imageUrl),
  }))));
});

// ----- Admin endpoints -----

function toAdminPayload(row: Category, productCount: number) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    parentId: row.parentId,
    imageUrl: toPublicImageUrl(row.imageUrl),
    displayOrder: row.displayOrder,
    isActive: row.isActive,
    productCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Walk the parent chain to detect a cycle. Returns true if assigning
 * `proposedParent` as the parent of `id` would create a cycle (or self-link).
 */
async function wouldCreateCycle(
  id: number,
  proposedParent: number,
): Promise<boolean> {
  if (proposedParent === id) return true;
  let cursor: number | null = proposedParent;
  const visited = new Set<number>();
  while (cursor !== null) {
    if (cursor === id) return true;
    if (visited.has(cursor)) return true; // pre-existing cycle, bail
    visited.add(cursor);
    const [row] = await db
      .select({ parentId: categoriesTable.parentId })
      .from(categoriesTable)
      .where(eq(categoriesTable.id, cursor));
    if (!row) return false;
    cursor = row.parentId;
  }
  return false;
}

router.get(
  "/admin/categories",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const counts = await db
      .select({
        categoryId: productsTable.categoryId,
        count: sql<number>`count(*)::int`,
      })
      .from(productsTable)
      .groupBy(productsTable.categoryId);
    const countByCategory = new Map<number, number>();
    for (const c of counts) {
      if (c.categoryId !== null) countByCategory.set(c.categoryId, c.count);
    }
    const rows = await db
      .select()
      .from(categoriesTable)
      .orderBy(
        sql`${categoriesTable.displayOrder} asc`,
        sql`${categoriesTable.name} asc`,
      );
    res.json(
      AdminListCategoriesResponse.parse(
        rows.map((r) => toAdminPayload(r, countByCategory.get(r.id) ?? 0)),
      ),
    );
  },
);

router.post(
  "/admin/categories",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateCategoryBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    if (parsed.data.parentId !== null && parsed.data.parentId !== undefined) {
      const [parent] = await db
        .select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(eq(categoriesTable.id, parsed.data.parentId));
      if (!parent) {
        res.status(400).json({ error: "Parent category does not exist" });
        return;
      }
    }
    try {
      const [row] = await db
        .insert(categoriesTable)
        .values({
          name: parsed.data.name,
          slug: parsed.data.slug,
          description: parsed.data.description ?? null,
          parentId: parsed.data.parentId ?? null,
          imageUrl: parsed.data.imageUrl ?? null,
          displayOrder: parsed.data.displayOrder ?? 0,
          isActive: parsed.data.isActive ?? true,
        })
        .returning();
      await recordHistory(req, {
        entityType: "category",
        entityId: row.id,
        changeType: "create",
        snapshot: row,
      });
      res.status(201).json(toAdminPayload(row, 0));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res
          .status(409)
          .json({ error: "A category with that slug already exists" });
        return;
      }
      req.log.error({ err }, "Failed to create category");
      res.status(500).json({ error: "Failed to create category" });
    }
  },
);

router.put(
  "/admin/categories/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateCategoryParams.safeParse(req.params);
    const body = AdminUpdateCategoryBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    if (body.data.parentId !== null && body.data.parentId !== undefined) {
      const [parent] = await db
        .select({ id: categoriesTable.id })
        .from(categoriesTable)
        .where(eq(categoriesTable.id, body.data.parentId));
      if (!parent) {
        res.status(400).json({ error: "Parent category does not exist" });
        return;
      }
      if (await wouldCreateCycle(params.data.id, body.data.parentId)) {
        res.status(400).json({
          error: "That would create a cycle (a category cannot be its own ancestor)",
        });
        return;
      }
    }
    const [previous] = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, params.data.id));
    try {
      const [row] = await db
        .update(categoriesTable)
        .set({
          name: body.data.name,
          slug: body.data.slug,
          description: body.data.description ?? null,
          parentId: body.data.parentId ?? null,
          imageUrl: body.data.imageUrl ?? null,
          ...(body.data.displayOrder !== undefined
            ? { displayOrder: body.data.displayOrder }
            : {}),
          ...(body.data.isActive !== undefined
            ? { isActive: body.data.isActive }
            : {}),
        })
        .where(eq(categoriesTable.id, params.data.id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "Category not found" });
        return;
      }
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(productsTable)
        .where(eq(productsTable.categoryId, row.id));
      await recordHistory(req, {
        entityType: "category",
        entityId: row.id,
        changeType: "update",
        snapshot: row,
        previousSnapshot: previous ?? null,
      });
      res.json(toAdminPayload(row, count));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res
          .status(409)
          .json({ error: "A category with that slug already exists" });
        return;
      }
      req.log.error({ err }, "Failed to update category");
      res.status(500).json({ error: "Failed to update category" });
    }
  },
);

router.patch(
  "/admin/categories/:id/active",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminSetCategoryActiveParams.safeParse(req.params);
    const body = AdminSetCategoryActiveBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid input" });
      return;
    }
    const [previous] = await db
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.id, params.data.id));
    const [row] = await db
      .update(categoriesTable)
      .set({ isActive: body.data.isActive })
      .where(eq(categoriesTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Category not found" });
      return;
    }
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(productsTable)
      .where(eq(productsTable.categoryId, row.id));
    await recordHistory(req, {
      entityType: "category",
      entityId: row.id,
      changeType: "update",
      snapshot: row,
      previousSnapshot: previous ?? null,
      notes: `set isActive=${body.data.isActive}`,
    });
    res.json(toAdminPayload(row, count));
  },
);

export default router;
