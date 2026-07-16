import { Router, type IRouter, type Request, type Response } from "express";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { coerceAvailabilityFlags } from "../lib/coerceAvailabilityFlags";
import {
  db,
  productsTable,
  manufacturersTable,
  categoriesTable,
  fabricsTable,
  productFabricPoolsTable,
  productFabricOptionsTable,
} from "@workspace/db";
import { AdminBulkUpdateProductsBody } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordHistory } from "../lib/history";

/** Apply a flat-dollar or percentage adjustment to a price string, returning
 *  the new value as a string with `roundTo` decimal places, or null when the
 *  input value is null/undefined (those fields are skipped for that product). */
function applyPriceAdj(
  current: string | null | undefined,
  mode: "flat" | "percent",
  amount: number,
  roundTo = 2,
): string | null {
  if (current == null) return null;
  const cur = Number(current);
  if (!Number.isFinite(cur)) return null;
  const next = Math.max(
    0,
    mode === "flat" ? cur + amount : cur * (1 + amount / 100),
  );
  const factor = Math.pow(10, roundTo);
  return (Math.round(next * factor) / factor).toFixed(roundTo);
}

const router: IRouter = Router();

type FabricsConfig = {
  pools: { manufacturerId: number; manufacturerName: string; fabricCount: number }[];
  fabricIds: number[];
};

async function loadFabricsConfig(productId: number): Promise<FabricsConfig> {
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

  return { pools, fabricIds: opts.map((o) => o.fabricId) };
}

function applyMode(
  current: number[],
  mode: "replace" | "add" | "remove" | "clear",
  ids: number[],
): { next: number[]; changed: boolean } {
  const cur = new Set(current);
  let next: Set<number>;
  if (mode === "clear") {
    next = new Set();
  } else if (mode === "replace") {
    next = new Set(ids);
  } else if (mode === "add") {
    next = new Set(cur);
    for (const id of ids) next.add(id);
  } else {
    next = new Set(cur);
    for (const id of ids) next.delete(id);
  }
  const changed =
    next.size !== cur.size || [...next].some((id) => !cur.has(id));
  return { next: [...next], changed };
}

router.post(
  "/admin/products/bulk-update",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminBulkUpdateProductsBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid input" });
      return;
    }
    const { productIds, fields, fabricPools, fabricPicks, priceAdjustments } =
      parsed.data;

    const hasFields = fields !== undefined && Object.keys(fields).length > 0;
    if (!hasFields && !fabricPools && !fabricPicks && !priceAdjustments) {
      res.status(400).json({ error: "Nothing to update" });
      return;
    }

    // Validate FKs on scalar fields
    if (fields) {
      const fkChecks: { id: number; table: typeof manufacturersTable | typeof categoriesTable; label: string }[] = [];
      if (fields.manufacturerId != null)
        fkChecks.push({ id: fields.manufacturerId, table: manufacturersTable, label: "Manufacturer" });
      if (fields.categoryId != null)
        fkChecks.push({ id: fields.categoryId, table: categoriesTable, label: "Category" });
      for (const c of fkChecks) {
        const [row] = await db
          .select({ id: c.table.id })
          .from(c.table)
          .where(eq(c.table.id, c.id));
        if (!row) {
          res.status(400).json({ error: `${c.label} does not exist` });
          return;
        }
      }
    }

    // Validate fabric/manufacturer ids that we'll be writing
    if (fabricPools && fabricPools.mode !== "clear") {
      const ids = fabricPools.manufacturerIds ?? [];
      if (ids.length === 0) {
        res
          .status(400)
          .json({ error: "manufacturerIds required for this fabric-pools mode" });
        return;
      }
      const found = await db
        .select({ id: manufacturersTable.id })
        .from(manufacturersTable)
        .where(inArray(manufacturersTable.id, ids));
      if (found.length !== new Set(ids).size) {
        res.status(400).json({ error: "Unknown manufacturer in fabric pools" });
        return;
      }
    }
    if (fabricPicks && fabricPicks.mode !== "clear") {
      const ids = fabricPicks.fabricIds ?? [];
      if (ids.length === 0) {
        res
          .status(400)
          .json({ error: "fabricIds required for this fabric-picks mode" });
        return;
      }
      const found = await db
        .select({ id: fabricsTable.id })
        .from(fabricsTable)
        .where(inArray(fabricsTable.id, ids));
      if (found.length !== new Set(ids).size) {
        res.status(400).json({ error: "Unknown fabric id in picks" });
        return;
      }
    }

    // Resolve which productIds actually exist
    const existing = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(inArray(productsTable.id, productIds));
    const existingSet = new Set(existing.map((r) => r.id));
    const notFound = productIds.filter((id) => !existingSet.has(id));
    const targetIds = productIds.filter((id) => existingSet.has(id));

    // Pre-build the scalar update set
    const scalarSet: Record<string, unknown> = {};
    if (fields) {
      if (fields.isActive !== undefined) scalarSet.isActive = fields.isActive;
      if (fields.featured !== undefined) {
        scalarSet.featured = fields.featured;
        scalarSet.featuredAt = fields.featured
          ? sql`COALESCE(${productsTable.featuredAt}, now())`
          : null;
      }
      if (fields.inStoreOnly !== undefined) scalarSet.inStoreOnly = fields.inStoreOnly;
      Object.assign(
        scalarSet,
        coerceAvailabilityFlags({
          availableOnline: fields.availableOnline,
          quoteOnly: fields.quoteOnly,
        }),
      );
      if (fields.showPriceOnline !== undefined) scalarSet.showPriceOnline = fields.showPriceOnline;
      if (fields.categoryId !== undefined) scalarSet.categoryId = fields.categoryId ?? null;
      if (fields.manufacturerId !== undefined) scalarSet.manufacturerId = fields.manufacturerId ?? null;
      if (fields.rankGroup !== undefined) scalarSet.rankGroup = fields.rankGroup ?? null;
    }
    const scalarHasUpdates = Object.keys(scalarSet).length > 0;

    let productsUpdated = 0;
    let fabricsUpdated = 0;
    let pricesUpdated = 0;

    // Process per-product so each gets its own history row. The whole per-product
    // mutation (scalar + fabric pools + fabric picks + price adjustments) runs in
    // ONE transaction so a single product is updated atomically; failures roll back
    // THAT product only and the loop continues (partial-success batch semantics).
    for (const productId of targetIds) {
      // Pre-load previous snapshots outside the tx (matches the pattern used by
      // the per-row PUT endpoints; readers in HistoryPanel see consistent shape).
      const prevFabrics =
        fabricPools || fabricPicks ? await loadFabricsConfig(productId) : null;
      let scalarPrev: Record<string, unknown> | null = null;
      let scalarNext: Record<string, unknown> | null = null;
      let scalarChanged = false;
      let fabricsChanged = false;
      let priceSnapshot: {
        mode: string;
        amount: number;
        fields: string[];
        before: Record<string, string | null>;
        after: Record<string, string | null>;
      } | null = null;
      let priceChanged = false;

      try {
        await db.transaction(async (tx) => {
          if (scalarHasUpdates) {
            const [prev] = await tx
              .select()
              .from(productsTable)
              .where(eq(productsTable.id, productId));
            if (!prev) return; // raced — disappeared between existence check & now
            const [next] = await tx
              .update(productsTable)
              .set(scalarSet)
              .where(eq(productsTable.id, productId))
              .returning();
            scalarPrev = prev;
            scalarNext = next ?? null;
            scalarChanged = true;
          }

          if (priceAdjustments) {
            const { fields, mode, amount, roundTo = 2 } = priceAdjustments;
            const [cur] = await tx
              .select({
                price: productsTable.price,
                salePrice: productsTable.salePrice,
                cost: productsTable.cost,
                msrp: productsTable.msrp,
                frameOnlyPrice: productsTable.frameOnlyPrice,
              })
              .from(productsTable)
              .where(eq(productsTable.id, productId));
            if (!cur) return;

            const before: Record<string, string | null> = {};
            const after: Record<string, string | null> = {};
            const updateSet: Record<string, string | null> = {};

            for (const field of fields) {
              const key = field as keyof typeof cur;
              const raw = cur[key];
              const prev = raw ?? null;
              const adj = applyPriceAdj(raw, mode, amount, roundTo);
              before[field] = prev;
              after[field] = adj;
              // Only write when the value actually changes AND is non-null
              if (adj !== null && adj !== prev) {
                updateSet[key] = adj;
              }
            }

            if (Object.keys(updateSet).length > 0) {
              await tx
                .update(productsTable)
                .set(updateSet)
                .where(eq(productsTable.id, productId));
              priceSnapshot = { mode, amount, fields: [...fields], before, after };
              priceChanged = true;
            }
          }

          if (prevFabrics) {
            let nextPoolIds = prevFabrics.pools.map((p) => p.manufacturerId);
            let nextFabricIds = [...prevFabrics.fabricIds];
            let poolsChanged = false;
            let picksChanged = false;
            if (fabricPools) {
              const r = applyMode(
                nextPoolIds,
                fabricPools.mode,
                fabricPools.manufacturerIds ?? [],
              );
              nextPoolIds = r.next;
              poolsChanged = r.changed;
            }
            if (fabricPicks) {
              const r = applyMode(
                nextFabricIds,
                fabricPicks.mode,
                fabricPicks.fabricIds ?? [],
              );
              nextFabricIds = r.next;
              picksChanged = r.changed;
            }
            if (poolsChanged) {
              await tx
                .delete(productFabricPoolsTable)
                .where(eq(productFabricPoolsTable.productId, productId));
              if (nextPoolIds.length > 0) {
                await tx.insert(productFabricPoolsTable).values(
                  nextPoolIds.map((mid) => ({
                    productId,
                    manufacturerId: mid,
                  })),
                );
              }
            }
            if (picksChanged) {
              await tx
                .delete(productFabricOptionsTable)
                .where(eq(productFabricOptionsTable.productId, productId));
              if (nextFabricIds.length > 0) {
                await tx.insert(productFabricOptionsTable).values(
                  nextFabricIds.map((fid, i) => ({
                    productId,
                    fabricId: fid,
                    displayOrder: i,
                  })),
                );
              }
            }
            fabricsChanged = poolsChanged || picksChanged;
          }
        });
      } catch (err) {
        req.log.error({ err, productId }, "Bulk update failed for product");
        continue;
      }

      // History writes happen AFTER the data tx commits — they are best-effort
      // (recordHistory swallows errors) and we don't want a history-write failure
      // to roll back the live mutation.
      if (scalarChanged && scalarPrev && scalarNext) {
        await recordHistory(req, {
          entityType: "product",
          entityId: productId,
          changeType: "update",
          snapshot: scalarNext,
          previousSnapshot: scalarPrev,
          notes: "bulk update",
        });
        productsUpdated += 1;
      }
      if (priceChanged && priceSnapshot !== null) {
        // TypeScript can't track mutations inside async callbacks, so we assert here.
        const ps = priceSnapshot as {
          mode: string;
          amount: number;
          fields: string[];
          before: Record<string, string | null>;
          after: Record<string, string | null>;
        };
        await recordHistory(req, {
          entityType: "product",
          entityId: productId,
          changeType: "update",
          snapshot: { prices: ps.after },
          previousSnapshot: { prices: ps.before },
          notes: "price adjustment",
        });
        pricesUpdated += 1;
      }
      if (fabricsChanged && prevFabrics) {
        const newFabrics = await loadFabricsConfig(productId);
        await recordHistory(req, {
          entityType: "product_fabrics",
          entityId: productId,
          changeType: "replace",
          snapshot: newFabrics,
          previousSnapshot: prevFabrics,
          notes: "bulk update",
        });
        fabricsUpdated += 1;
      }
    }

    res.json({ productsUpdated, fabricsUpdated, pricesUpdated, notFound });
  },
);

export default router;
