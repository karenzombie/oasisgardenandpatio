import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import {
  db,
  shippingRulesTable,
  shippingRuleProductsTable,
  shippingWeightTiersTable,
  categoriesTable,
  manufacturersTable,
  productsTable,
  type ShippingRule as ShippingRuleRow,
} from "@workspace/db";
import {
  AdminCreateShippingRuleBody,
  AdminUpdateShippingRuleParams,
  AdminUpdateShippingRuleBody,
  AdminDeleteShippingRuleParams,
  AdminUpdateShippingWeightTiersBody,
  AdminGetShippingSubcategoriesQueryParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordHistory } from "../lib/history";
import {
  loadShippingConfig,
  productMatchesRule,
  type MatchableProduct,
} from "../lib/shippingRules";

const router: IRouter = Router();

const SCOPES = ["site_wide", "category", "manufacturer", "product"] as const;
const RATE_TYPES = ["flat", "percentage"] as const;
type Scope = (typeof SCOPES)[number];
type RateType = (typeof RATE_TYPES)[number];

interface RulePayloadProduct {
  productId: number;
  sku: string;
  name: string;
}

function nullify(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

/** Build API payloads for the given rule rows (names + product refs resolved). */
async function buildRulePayloads(rows: ShippingRuleRow[]) {
  if (rows.length === 0) return [];
  const ruleIds = rows.map((r) => r.id);
  const categoryIds = [
    ...new Set(rows.map((r) => r.categoryId).filter((v): v is number => v != null)),
  ];
  const manufacturerIds = [
    ...new Set(
      rows.map((r) => r.manufacturerId).filter((v): v is number => v != null),
    ),
  ];

  const [catRows, mfrRows, prodRows] = await Promise.all([
    categoryIds.length
      ? db
          .select({ id: categoriesTable.id, name: categoriesTable.name })
          .from(categoriesTable)
          .where(inArray(categoriesTable.id, categoryIds))
      : Promise.resolve([] as { id: number; name: string }[]),
    manufacturerIds.length
      ? db
          .select({ id: manufacturersTable.id, name: manufacturersTable.name })
          .from(manufacturersTable)
          .where(inArray(manufacturersTable.id, manufacturerIds))
      : Promise.resolve([] as { id: number; name: string }[]),
    db
      .select({
        ruleId: shippingRuleProductsTable.ruleId,
        productId: productsTable.id,
        sku: productsTable.sku,
        name: productsTable.name,
      })
      .from(shippingRuleProductsTable)
      .innerJoin(
        productsTable,
        eq(shippingRuleProductsTable.productId, productsTable.id),
      )
      .where(inArray(shippingRuleProductsTable.ruleId, ruleIds))
      .orderBy(asc(productsTable.name)),
  ]);

  const catName = new Map(catRows.map((c) => [c.id, c.name]));
  const mfrName = new Map(mfrRows.map((m) => [m.id, m.name]));
  const productsByRule = new Map<number, RulePayloadProduct[]>();
  for (const p of prodRows) {
    const list = productsByRule.get(p.ruleId) ?? [];
    list.push({ productId: p.productId, sku: p.sku, name: p.name });
    productsByRule.set(p.ruleId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    scope: r.scope,
    rateType: r.rateType,
    rateValue: r.rateValue,
    categoryId: r.categoryId,
    categoryName: r.categoryId != null ? catName.get(r.categoryId) ?? null : null,
    subCategory: r.subCategory,
    manufacturerId: r.manufacturerId,
    manufacturerName:
      r.manufacturerId != null ? mfrName.get(r.manufacturerId) ?? null : null,
    label: r.label,
    isActive: r.isActive,
    products: productsByRule.get(r.id) ?? [],
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }));
}

/**
 * SKUs covered by `ruleId` that ALSO match at least one OTHER active rule
 * (shipping stacks). Only computed for product-scope rules — that is the
 * SKU-multiselect UX the overlap toast targets.
 */
async function computeConflictSkus(
  ruleId: number,
  scope: Scope,
  productIds: number[],
): Promise<string[]> {
  if (scope !== "product" || productIds.length === 0) return [];
  const prodRows = await db
    .select({
      productId: productsTable.id,
      sku: productsTable.sku,
      categoryId: productsTable.categoryId,
      subCategory: productsTable.subCategory,
      manufacturerId: productsTable.manufacturerId,
    })
    .from(productsTable)
    .where(inArray(productsTable.id, productIds));

  const config = await loadShippingConfig();
  const otherRules = config.rules.filter((r) => r.id !== ruleId);
  const conflicts: string[] = [];
  for (const p of prodRows) {
    const matchable: MatchableProduct = {
      productId: p.productId,
      categoryId: p.categoryId,
      subCategory: p.subCategory,
      manufacturerId: p.manufacturerId,
    };
    if (otherRules.some((r) => productMatchesRule(r, matchable))) {
      conflicts.push(p.sku);
    }
  }
  return conflicts;
}

function validateScopeFields(
  scope: Scope,
  data: {
    categoryId?: number | null;
    manufacturerId?: number | null;
    productIds?: number[] | null;
  },
): string | null {
  switch (scope) {
    case "category":
      if (data.categoryId == null) return "categoryId is required for a category rule";
      return null;
    case "manufacturer":
      if (data.manufacturerId == null)
        return "manufacturerId is required for a manufacturer rule";
      return null;
    case "product":
      if (!data.productIds || data.productIds.length === 0)
        return "At least one product is required for a product rule";
      return null;
    case "site_wide":
      return null;
    default:
      return "Invalid scope";
  }
}

router.get(
  "/admin/shipping/rules",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(shippingRulesTable)
      .orderBy(asc(shippingRulesTable.scope), asc(shippingRulesTable.id));
    const rules = await buildRulePayloads(rows);
    res.json({ rules });
  },
);

router.post(
  "/admin/shipping/rules",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateShippingRuleBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    if (!SCOPES.includes(data.scope as Scope)) {
      res.status(400).json({ error: "Invalid scope" });
      return;
    }
    if (!RATE_TYPES.includes(data.rateType as RateType)) {
      res.status(400).json({ error: "Invalid rateType" });
      return;
    }
    const scope = data.scope as Scope;
    const fieldErr = validateScopeFields(scope, data);
    if (fieldErr) {
      res.status(400).json({ error: fieldErr });
      return;
    }

    const created = await db.transaction(async (tx) => {
      const [rule] = await tx
        .insert(shippingRulesTable)
        .values({
          scope,
          rateType: data.rateType,
          rateValue: data.rateValue.toFixed(2),
          categoryId: scope === "category" ? data.categoryId ?? null : null,
          subCategory:
            scope === "category" ? nullify(data.subCategory) : null,
          manufacturerId:
            scope === "manufacturer" ? data.manufacturerId ?? null : null,
          label: nullify(data.label),
          isActive: data.isActive ?? true,
        })
        .returning();
      if (!rule) throw new Error("Insert returned no row");
      if (scope === "product" && data.productIds && data.productIds.length) {
        const unique = [...new Set(data.productIds)];
        await tx.insert(shippingRuleProductsTable).values(
          unique.map((productId) => ({ ruleId: rule.id, productId })),
        );
      }
      return rule;
    });

    const conflictSkus = await computeConflictSkus(
      created.id,
      scope,
      scope === "product" ? [...new Set(data.productIds ?? [])] : [],
    );
    await recordHistory(req, {
      entityType: "shipping_rule",
      entityId: created.id,
      changeType: "create",
      snapshot: created,
    });
    const [payload] = await buildRulePayloads([created]);
    res.status(201).json({ rule: payload, conflictSkus });
  },
);

router.patch(
  "/admin/shipping/rules/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateShippingRuleParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateShippingRuleBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = body.data;
    const [existing] = await db
      .select()
      .from(shippingRulesTable)
      .where(eq(shippingRulesTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Shipping rule not found" });
      return;
    }
    const scope = existing.scope as Scope;
    if (data.rateType != null && !RATE_TYPES.includes(data.rateType as RateType)) {
      res.status(400).json({ error: "Invalid rateType" });
      return;
    }

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(shippingRulesTable)
        .set({
          rateType: data.rateType ?? existing.rateType,
          rateValue:
            data.rateValue != null
              ? data.rateValue.toFixed(2)
              : existing.rateValue,
          categoryId:
            scope === "category"
              ? data.categoryId !== undefined
                ? data.categoryId
                : existing.categoryId
              : null,
          subCategory:
            scope === "category"
              ? data.subCategory !== undefined
                ? nullify(data.subCategory)
                : existing.subCategory
              : null,
          manufacturerId:
            scope === "manufacturer"
              ? data.manufacturerId !== undefined
                ? data.manufacturerId
                : existing.manufacturerId
              : null,
          label:
            data.label !== undefined ? nullify(data.label) : existing.label,
          isActive: data.isActive ?? existing.isActive,
        })
        .where(eq(shippingRulesTable.id, params.data.id))
        .returning();
      if (scope === "product" && data.productIds !== undefined) {
        await tx
          .delete(shippingRuleProductsTable)
          .where(eq(shippingRuleProductsTable.ruleId, params.data.id));
        const unique = [...new Set(data.productIds)];
        if (unique.length) {
          await tx.insert(shippingRuleProductsTable).values(
            unique.map((productId) => ({ ruleId: params.data.id, productId })),
          );
        }
      }
      return row;
    });
    if (!updated) {
      res.status(404).json({ error: "Shipping rule not found" });
      return;
    }

    let productIds: number[] = [];
    if (scope === "product") {
      const rows =
        data.productIds !== undefined
          ? [...new Set(data.productIds)]
          : (
              await db
                .select({ productId: shippingRuleProductsTable.productId })
                .from(shippingRuleProductsTable)
                .where(eq(shippingRuleProductsTable.ruleId, params.data.id))
            ).map((r) => r.productId);
      productIds = rows;
    }
    const conflictSkus = await computeConflictSkus(
      updated.id,
      scope,
      productIds,
    );
    await recordHistory(req, {
      entityType: "shipping_rule",
      entityId: updated.id,
      changeType: "update",
      snapshot: updated,
      previousSnapshot: existing,
    });
    const [payload] = await buildRulePayloads([updated]);
    res.json({ rule: payload, conflictSkus });
  },
);

router.delete(
  "/admin/shipping/rules/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminDeleteShippingRuleParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [deleted] = await db
      .delete(shippingRulesTable)
      .where(eq(shippingRulesTable.id, params.data.id))
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Shipping rule not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "shipping_rule",
      entityId: deleted.id,
      changeType: "delete",
      snapshot: deleted,
    });
    res.status(204).end();
  },
);

router.get(
  "/admin/shipping/weight-tiers",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(shippingWeightTiersTable)
      .orderBy(asc(shippingWeightTiersTable.displayOrder));
    res.json({
      tiers: rows.map((t) => ({
        id: t.id,
        minWeight: t.minWeight,
        maxWeight: t.maxWeight,
        amount: t.amount,
        displayOrder: t.displayOrder,
      })),
    });
  },
);

router.put(
  "/admin/shipping/weight-tiers",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminUpdateShippingWeightTiersBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    await db.transaction(async (tx) => {
      for (const t of parsed.data.tiers) {
        await tx
          .update(shippingWeightTiersTable)
          .set({ amount: t.amount.toFixed(2) })
          .where(eq(shippingWeightTiersTable.id, t.id));
      }
    });
    const rows = await db
      .select()
      .from(shippingWeightTiersTable)
      .orderBy(asc(shippingWeightTiersTable.displayOrder));
    res.json({
      tiers: rows.map((t) => ({
        id: t.id,
        minWeight: t.minWeight,
        maxWeight: t.maxWeight,
        amount: t.amount,
        displayOrder: t.displayOrder,
      })),
    });
  },
);

router.get(
  "/admin/shipping/subcategories",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminGetShippingSubcategoriesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid categoryId" });
      return;
    }
    const rows = await db
      .selectDistinct({ subCategory: productsTable.subCategory })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.categoryId, parsed.data.categoryId),
          isNotNull(productsTable.subCategory),
          ne(sql`btrim(${productsTable.subCategory})`, ""),
        ),
      )
      .orderBy(asc(productsTable.subCategory));
    const subCategories = rows
      .map((r) => r.subCategory)
      .filter((v): v is string => v != null && v.trim().length > 0);
    res.json({ subCategories });
  },
);

export default router;
