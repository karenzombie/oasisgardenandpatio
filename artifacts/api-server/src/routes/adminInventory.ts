import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import {
  db,
  productsTable,
  productImagesTable,
  inventoryTable,
  manufacturersTable,
  categoriesTable,
  inventoryLocationsTable,
  inventoryAdjustmentsTable,
  usersTable,
  type InventoryLocation,
} from "@workspace/db";
import {
  AdminListInventoryQueryParams,
  AdminAdjustInventoryBody,
  AdminListInventoryAdjustmentsQueryParams,
  AdminCreateInventoryLocationBody,
  AdminUpdateInventoryLocationParams,
  AdminUpdateInventoryLocationBody,
  AdminSetInventoryLocationActiveParams,
  AdminSetInventoryLocationActiveBody,
  AdminSetInventoryLocationDefaultParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { isUniqueViolation } from "../lib/dbErrors";
import { recordHistory } from "../lib/history";

const router: IRouter = Router();

const ALLOWED_ADJUSTMENT_TYPES = new Set([
  "cycle_count",
  "damage",
  "loss",
  "found",
  "transfer",
  "return",
  "manual_correction",
  "other",
]);

function locationToPayload(loc: InventoryLocation) {
  return {
    id: loc.id,
    name: loc.name,
    code: loc.code,
    address: loc.address,
    isActive: loc.isActive,
    isDefault: loc.isDefault,
    createdAt: loc.createdAt.toISOString(),
    updatedAt: loc.updatedAt.toISOString(),
  };
}

const PRIMARY_IMAGE_SQL = sql<string | null>`(
  select ${productImagesTable.url}
  from ${productImagesTable}
  where ${productImagesTable.productId} = ${productsTable.id}
  order by ${productImagesTable.isPrimary} desc, ${productImagesTable.displayOrder} asc, ${productImagesTable.id} asc
  limit 1
)`;

// Effective threshold = max of product.lowStockThreshold and inventory.reorderThreshold.
// We use COALESCE because the inventory row may not exist for brand-new products.
const EFFECTIVE_THRESHOLD_SQL = sql<number>`GREATEST(
  ${productsTable.lowStockThreshold},
  COALESCE(${inventoryTable.reorderThreshold}, 0)
)`;

const ON_HAND_SQL = sql<number>`COALESCE(${inventoryTable.onHand}, 0)`;
const ON_HOLD_SQL = sql<number>`COALESCE(${inventoryTable.onHold}, 0)`;
const REORDER_THRESHOLD_SQL = sql<number>`COALESCE(${inventoryTable.reorderThreshold}, 0)`;

const STATUS_SQL = sql<"in_stock" | "low_stock" | "out_of_stock">`CASE
  WHEN COALESCE(${inventoryTable.onHand}, 0) <= 0 THEN 'out_of_stock'
  WHEN COALESCE(${inventoryTable.onHand}, 0) <= GREATEST(
    ${productsTable.lowStockThreshold},
    COALESCE(${inventoryTable.reorderThreshold}, 0)
  ) THEN 'low_stock'
  ELSE 'in_stock'
END`;

// ──────────────────────────────────────────────────────────────────────────
// Locations CRUD
// ──────────────────────────────────────────────────────────────────────────

router.get(
  "/admin/inventory/locations",
  requireAuth,
  requireRole("admin", "agent"),
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(inventoryLocationsTable)
      .orderBy(
        desc(inventoryLocationsTable.isDefault),
        asc(inventoryLocationsTable.name),
      );
    res.json(rows.map(locationToPayload));
  },
);

router.post(
  "/admin/inventory/locations",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateInventoryLocationBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const { name, code, address, isActive } = parsed.data;
    try {
      const [created] = await db
        .insert(inventoryLocationsTable)
        .values({
          name: name.trim(),
          code: code?.trim() || null,
          address: address?.trim() || null,
          isActive: isActive ?? true,
          isDefault: false,
        })
        .returning();
      if (!created) {
        res.status(500).json({ error: "Insert returned no row" });
        return;
      }
      await recordHistory(req, {
        entityType: "inventory_location",
        entityId: created.id,
        changeType: "create",
        snapshot: created,
      });
      res.status(201).json(locationToPayload(created));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Location code already in use" });
        return;
      }
      throw err;
    }
  },
);

router.put(
  "/admin/inventory/locations/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateInventoryLocationParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateInventoryLocationBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const [previousLoc] = await db
      .select()
      .from(inventoryLocationsTable)
      .where(eq(inventoryLocationsTable.id, params.data.id));
    try {
      const [updated] = await db
        .update(inventoryLocationsTable)
        .set({
          name: body.data.name.trim(),
          code: body.data.code?.trim() || null,
          address: body.data.address?.trim() || null,
        })
        .where(eq(inventoryLocationsTable.id, params.data.id))
        .returning();
      if (!updated) {
        res.status(404).json({ error: "Location not found" });
        return;
      }
      await recordHistory(req, {
        entityType: "inventory_location",
        entityId: updated.id,
        changeType: "update",
        snapshot: updated,
        previousSnapshot: previousLoc ?? null,
      });
      res.json(locationToPayload(updated));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res.status(409).json({ error: "Location code already in use" });
        return;
      }
      throw err;
    }
  },
);

router.patch(
  "/admin/inventory/locations/:id/active",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminSetInventoryLocationActiveParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminSetInventoryLocationActiveBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    const [existing] = await db
      .select()
      .from(inventoryLocationsTable)
      .where(eq(inventoryLocationsTable.id, params.data.id));
    if (!existing) {
      res.status(404).json({ error: "Location not found" });
      return;
    }
    if (!body.data.isActive && existing.isDefault) {
      res
        .status(400)
        .json({ error: "Cannot deactivate the default location" });
      return;
    }
    const [updated] = await db
      .update(inventoryLocationsTable)
      .set({ isActive: body.data.isActive })
      .where(eq(inventoryLocationsTable.id, params.data.id))
      .returning();
    await recordHistory(req, {
      entityType: "inventory_location",
      entityId: params.data.id,
      changeType: "update",
      snapshot: updated!,
      previousSnapshot: existing,
      notes: body.data.isActive ? "activated" : "deactivated",
    });
    res.json(locationToPayload(updated!));
  },
);

router.post(
  "/admin/inventory/locations/:id/default",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminSetInventoryLocationDefaultParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    const result = await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(inventoryLocationsTable)
        .where(eq(inventoryLocationsTable.id, params.data.id))
        .for("update");
      if (!target) return { kind: "not_found" as const };
      if (!target.isActive) return { kind: "inactive" as const };

      // Atomically clear the flag from every other row.
      await tx
        .update(inventoryLocationsTable)
        .set({ isDefault: false })
        .where(eq(inventoryLocationsTable.isDefault, true));

      const [updated] = await tx
        .update(inventoryLocationsTable)
        .set({ isDefault: true })
        .where(eq(inventoryLocationsTable.id, params.data.id))
        .returning();
      return { kind: "ok" as const, updated: updated! };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Location not found" });
      return;
    }
    if (result.kind === "inactive") {
      res
        .status(400)
        .json({ error: "Cannot set an inactive location as default" });
      return;
    }
    await recordHistory(req, {
      entityType: "inventory_location",
      entityId: result.updated.id,
      changeType: "update",
      snapshot: result.updated,
      notes: "set as default",
    });
    res.json(locationToPayload(result.updated));
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Inventory list (products with stock + status)
// ──────────────────────────────────────────────────────────────────────────

router.get(
  "/admin/inventory",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminListInventoryQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }
    const {
      q,
      status,
      manufacturerId,
      categoryId,
      includeInactive = false,
      page = 1,
      pageSize = 50,
      sortBy,
      sortOrder = "asc",
    } = parsed.data;

    const conditions = [];
    if (q && q.trim()) {
      const needle = `%${q.trim()}%`;
      conditions.push(
        or(
          ilike(productsTable.name, needle),
          ilike(productsTable.sku, needle),
          ilike(productsTable.slug, needle),
        ),
      );
    }
    if (manufacturerId != null) {
      conditions.push(eq(productsTable.manufacturerId, manufacturerId));
    }
    if (categoryId != null) {
      conditions.push(eq(productsTable.categoryId, categoryId));
    }
    if (!includeInactive) {
      conditions.push(eq(productsTable.isActive, true));
    }
    if (status === "out_of_stock") {
      conditions.push(sql`COALESCE(${inventoryTable.onHand}, 0) <= 0`);
    } else if (status === "low_stock") {
      conditions.push(
        sql`COALESCE(${inventoryTable.onHand}, 0) > 0 AND COALESCE(${inventoryTable.onHand}, 0) <= ${EFFECTIVE_THRESHOLD_SQL}`,
      );
    } else if (status === "in_stock") {
      conditions.push(
        sql`COALESCE(${inventoryTable.onHand}, 0) > ${EFFECTIVE_THRESHOLD_SQL}`,
      );
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const offset = (page - 1) * pageSize;

    const rowsP = db
      .select({
        productId: productsTable.id,
        name: productsTable.name,
        sku: productsTable.sku,
        slug: productsTable.slug,
        manufacturerName: manufacturersTable.name,
        categoryName: categoriesTable.name,
        primaryImageUrl: PRIMARY_IMAGE_SQL,
        onHand: ON_HAND_SQL,
        onHold: ON_HOLD_SQL,
        lowStockThreshold: productsTable.lowStockThreshold,
        reorderThreshold: REORDER_THRESHOLD_SQL,
        status: STATUS_SQL,
        isActive: productsTable.isActive,
        updatedAt: inventoryTable.updatedAt,
      })
      .from(productsTable)
      .leftJoin(
        inventoryTable,
        and(
          eq(inventoryTable.productId, productsTable.id),
          isNull(inventoryTable.variantId),
        ),
      )
      .leftJoin(
        manufacturersTable,
        eq(manufacturersTable.id, productsTable.manufacturerId),
      )
      .leftJoin(
        categoriesTable,
        eq(categoriesTable.id, productsTable.categoryId),
      )
      .where(whereClause as ReturnType<typeof and>)
      .orderBy(...((): Array<ReturnType<typeof asc>> => {
        const dir = sortOrder === "desc" ? desc : asc;
        const tb = asc(productsTable.id);
        switch (sortBy) {
          case "name":
            return [dir(productsTable.name), tb];
          case "sku":
            return [dir(productsTable.sku), tb];
          case "manufacturer":
            return [dir(manufacturersTable.name), asc(productsTable.name), tb];
          case "category":
            return [dir(categoriesTable.name), asc(productsTable.name), tb];
          case "onHand":
            return [dir(ON_HAND_SQL), asc(productsTable.name), tb];
          case "reorderThreshold":
            return [dir(REORDER_THRESHOLD_SQL), asc(productsTable.name), tb];
          default:
            return [asc(productsTable.name), tb];
        }
      })())
      .limit(pageSize)
      .offset(offset);

    const totalP = db
      .select({ count: sql<number>`count(*)::int` })
      .from(productsTable)
      .leftJoin(
        inventoryTable,
        and(
          eq(inventoryTable.productId, productsTable.id),
          isNull(inventoryTable.variantId),
        ),
      )
      .where(whereClause as ReturnType<typeof and>);

    const [rows, totalRows] = await Promise.all([rowsP, totalP]);
    res.json({
      items: rows.map((r) => ({
        productId: r.productId,
        name: r.name,
        sku: r.sku,
        slug: r.slug,
        manufacturerName: r.manufacturerName,
        categoryName: r.categoryName,
        primaryImageUrl: r.primaryImageUrl,
        onHand: r.onHand,
        onHold: r.onHold,
        lowStockThreshold: r.lowStockThreshold,
        reorderThreshold: r.reorderThreshold,
        status: r.status,
        isActive: r.isActive,
        updatedAt: r.updatedAt ? r.updatedAt.toISOString() : null,
      })),
      total: totalRows[0]?.count ?? 0,
      page,
      pageSize,
    });
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Adjust inventory (atomic + audit row)
// ──────────────────────────────────────────────────────────────────────────

router.post(
  "/admin/inventory/adjust",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminAdjustInventoryBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const { productId, locationId, adjustmentType, quantityChange, reason } =
      parsed.data;

    if (quantityChange === 0) {
      res.status(400).json({ error: "quantityChange cannot be zero" });
      return;
    }
    if (!ALLOWED_ADJUSTMENT_TYPES.has(adjustmentType)) {
      res.status(400).json({ error: "Unknown adjustmentType" });
      return;
    }

    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    // Resolve effective location: explicit > default > error.
    let effectiveLocationId: number | null = null;
    if (locationId != null) {
      const [loc] = await db
        .select()
        .from(inventoryLocationsTable)
        .where(eq(inventoryLocationsTable.id, locationId));
      if (!loc) {
        res.status(400).json({ error: "Unknown locationId" });
        return;
      }
      if (!loc.isActive) {
        res.status(400).json({ error: "Location is inactive" });
        return;
      }
      effectiveLocationId = loc.id;
    } else {
      const [defaultLoc] = await db
        .select({ id: inventoryLocationsTable.id })
        .from(inventoryLocationsTable)
        .where(eq(inventoryLocationsTable.isDefault, true));
      if (!defaultLoc) {
        res.status(400).json({
          error:
            "No default inventory location configured. Set one in Locations.",
        });
        return;
      }
      effectiveLocationId = defaultLoc.id;
    }

    type TxResult =
      | { kind: "product_not_found" }
      | { kind: "would_be_negative"; current: number }
      | { kind: "ok"; onHand: number; adjustmentId: number };

    const result = await db.transaction(async (tx): Promise<TxResult> => {
      // Confirm product exists (lock it briefly to avoid TOCTOU).
      const [product] = await tx
        .select({ id: productsTable.id })
        .from(productsTable)
        .where(eq(productsTable.id, productId))
        .for("update");
      if (!product) return { kind: "product_not_found" };

      // Get-or-create the canonical product-level inventory row (variantId IS
      // NULL — the schema's partial unique index guarantees at most one such
      // row per product). Variant-level adjustments are intentionally NOT
      // exposed here; they would need their own UI.
      let [inv] = await tx
        .select()
        .from(inventoryTable)
        .where(
          and(
            eq(inventoryTable.productId, productId),
            isNull(inventoryTable.variantId),
          ),
        )
        .for("update");
      if (!inv) {
        const [created] = await tx
          .insert(inventoryTable)
          .values({
            productId,
            variantId: null,
            onHand: 0,
            onHold: 0,
            reorderThreshold: 0,
          })
          .returning();
        // Re-select FOR UPDATE on the freshly-inserted row.
        const [locked] = await tx
          .select()
          .from(inventoryTable)
          .where(eq(inventoryTable.id, created!.id))
          .for("update");
        inv = locked!;
      }

      const newOnHand = inv.onHand + quantityChange;
      if (newOnHand < 0) {
        return { kind: "would_be_negative", current: inv.onHand };
      }

      await tx
        .update(inventoryTable)
        .set({ onHand: newOnHand })
        .where(eq(inventoryTable.id, inv.id));

      const [adjustment] = await tx
        .insert(inventoryAdjustmentsTable)
        .values({
          productId,
          inventoryId: inv.id,
          locationId: effectiveLocationId,
          adjustmentType,
          quantityChange,
          quantityAfter: newOnHand,
          reason: reason?.trim() || null,
          performedByUserId: userId,
        })
        .returning({ id: inventoryAdjustmentsTable.id });

      return {
        kind: "ok",
        onHand: newOnHand,
        adjustmentId: adjustment!.id,
      };
    });

    if (result.kind === "product_not_found") {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (result.kind === "would_be_negative") {
      res.status(400).json({
        error: `Adjustment would result in negative stock (current: ${result.current})`,
      });
      return;
    }
    await recordHistory(req, {
      entityType: "product",
      entityId: productId,
      changeType: "update",
      snapshot: {
        productId,
        onHand: result.onHand,
        adjustmentId: result.adjustmentId,
        adjustmentType,
        quantityChange,
        locationId: effectiveLocationId,
        reason: reason ?? null,
      },
      notes: `inventory ${adjustmentType} ${quantityChange >= 0 ? "+" : ""}${quantityChange} → onHand ${result.onHand}`,
    });
    res.json({
      productId,
      onHand: result.onHand,
      adjustmentId: result.adjustmentId,
    });
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Adjustments list (audit trail)
// ──────────────────────────────────────────────────────────────────────────

router.get(
  "/admin/inventory/adjustments",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminListInventoryAdjustmentsQueryParams.safeParse(
      req.query,
    );
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid query" });
      return;
    }
    const {
      productId,
      locationId,
      type,
      page = 1,
      pageSize = 50,
    } = parsed.data;

    const conditions = [];
    if (productId != null) {
      conditions.push(eq(inventoryAdjustmentsTable.productId, productId));
    }
    if (locationId != null) {
      conditions.push(eq(inventoryAdjustmentsTable.locationId, locationId));
    }
    if (type && type.trim()) {
      conditions.push(eq(inventoryAdjustmentsTable.adjustmentType, type));
    }
    const whereClause = conditions.length ? and(...conditions) : undefined;

    const offset = (page - 1) * pageSize;

    const rowsP = db
      .select({
        id: inventoryAdjustmentsTable.id,
        productId: inventoryAdjustmentsTable.productId,
        productName: productsTable.name,
        productSku: productsTable.sku,
        locationId: inventoryAdjustmentsTable.locationId,
        locationName: inventoryLocationsTable.name,
        adjustmentType: inventoryAdjustmentsTable.adjustmentType,
        quantityChange: inventoryAdjustmentsTable.quantityChange,
        quantityAfter: inventoryAdjustmentsTable.quantityAfter,
        reason: inventoryAdjustmentsTable.reason,
        performedByUserId: inventoryAdjustmentsTable.performedByUserId,
        performedByEmail: usersTable.email,
        performedByFirstName: usersTable.firstName,
        performedByLastName: usersTable.lastName,
        createdAt: inventoryAdjustmentsTable.createdAt,
      })
      .from(inventoryAdjustmentsTable)
      .leftJoin(
        productsTable,
        eq(productsTable.id, inventoryAdjustmentsTable.productId),
      )
      .leftJoin(
        inventoryLocationsTable,
        eq(
          inventoryLocationsTable.id,
          inventoryAdjustmentsTable.locationId,
        ),
      )
      .leftJoin(
        usersTable,
        eq(usersTable.id, inventoryAdjustmentsTable.performedByUserId),
      )
      .where(whereClause as ReturnType<typeof and>)
      .orderBy(desc(inventoryAdjustmentsTable.createdAt))
      .limit(pageSize)
      .offset(offset);

    const totalP = db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryAdjustmentsTable)
      .where(whereClause as ReturnType<typeof and>);

    const [rows, totalRows] = await Promise.all([rowsP, totalP]);

    function formatName(
      first: string | null,
      last: string | null,
      email: string | null,
    ): string | null {
      const f = (first ?? "").trim();
      const l = (last ?? "").trim();
      const full = `${f} ${l}`.trim();
      if (full) return full;
      return email ?? null;
    }

    res.json({
      adjustments: rows.map((r) => ({
        id: r.id,
        productId: r.productId,
        productName: r.productName ?? "(deleted product)",
        productSku: r.productSku ?? "—",
        locationId: r.locationId,
        locationName: r.locationName,
        adjustmentType: r.adjustmentType,
        quantityChange: r.quantityChange,
        quantityAfter: r.quantityAfter,
        reason: r.reason,
        performedByUserId: r.performedByUserId,
        performedByName: formatName(
          r.performedByFirstName,
          r.performedByLastName,
          r.performedByEmail,
        ),
        createdAt: r.createdAt.toISOString(),
      })),
      total: totalRows[0]?.count ?? 0,
      page,
      pageSize,
    });
  },
);

export default router;
