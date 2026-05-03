import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq } from "drizzle-orm";
import {
  db,
  discountEventsTable,
  couponCodesTable,
  couponCodeUsesTable,
  ordersTable,
  usersTable,
  type DiscountEvent,
  type CouponCode,
} from "@workspace/db";
import {
  AdminCreateDiscountEventBody,
  AdminUpdateDiscountEventParams,
  AdminUpdateDiscountEventBody,
  AdminDeleteDiscountEventParams,
  AdminCreateCouponCodeBody,
  AdminUpdateCouponCodeParams,
  AdminUpdateCouponCodeBody,
  AdminDeleteCouponCodeParams,
  AdminListCouponCodeUsesParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { isUniqueViolation } from "../lib/dbErrors";
import { recordHistory } from "../lib/history";

const router: IRouter = Router();

type DiscountType = "percentage" | "fixed";
type AppliesTo = "global" | "category" | "manufacturer" | "product";

function discountEventToPayload(row: DiscountEvent) {
  return {
    id: row.id,
    name: row.name,
    type: row.type as DiscountType,
    value: Number(row.value),
    appliesTo: row.appliesTo as AppliesTo,
    targetIds: row.targetIds ?? [],
    startDate: row.startDate ? row.startDate.toISOString() : null,
    endDate: row.endDate ? row.endDate.toISOString() : null,
    isStackable: row.isStackable,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function couponToPayload(row: CouponCode) {
  return {
    id: row.id,
    code: row.code,
    discountType: row.discountType as DiscountType,
    value: Number(row.value),
    minOrderAmount:
      row.minOrderAmount === null ? null : Number(row.minOrderAmount),
    maxUsesTotal: row.maxUsesTotal,
    currentUses: row.currentUses,
    singleUsePerCustomer: row.singleUsePerCustomer,
    appliesTo: row.appliesTo as AppliesTo,
    targetIds: row.targetIds ?? [],
    startDate: row.startDate ? row.startDate.toISOString() : null,
    expirationDate: row.expirationDate
      ? row.expirationDate.toISOString()
      : null,
    isStackable: row.isStackable,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function dateRangeOk(
  start: Date | null | undefined,
  end: Date | null | undefined,
): boolean {
  if (!start || !end) return true;
  return end.getTime() > start.getTime();
}

// ---------------- Discount Events ----------------

router.get(
  "/admin/discount-events",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(discountEventsTable)
      .orderBy(
        desc(discountEventsTable.isActive),
        asc(discountEventsTable.id),
      );
    res.json(rows.map(discountEventToPayload));
  },
);

router.post(
  "/admin/discount-events",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateDiscountEventBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    if (data.type === "percentage" && data.value > 100) {
      res
        .status(400)
        .json({ error: "Percentage value cannot exceed 100." });
      return;
    }
    if (!dateRangeOk(data.startDate, data.endDate)) {
      res
        .status(400)
        .json({ error: "End date must be after start date." });
      return;
    }
    const [row] = await db
      .insert(discountEventsTable)
      .values({
        name: data.name.trim(),
        type: data.type,
        value: String(data.value),
        appliesTo: data.appliesTo ?? "global",
        targetIds: data.targetIds ?? [],
        startDate: data.startDate ?? null,
        endDate: data.endDate ?? null,
        isStackable: data.isStackable ?? false,
        isActive: data.isActive ?? true,
      })
      .returning();
    if (!row) {
      res.status(500).json({ error: "Failed to create event" });
      return;
    }
    await recordHistory(req, {
      entityType: "discount_event",
      entityId: row.id,
      changeType: "create",
      snapshot: row,
    });
    res.status(201).json(discountEventToPayload(row));
  },
);

router.put(
  "/admin/discount-events/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateDiscountEventParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateDiscountEventBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = body.data;
    if (
      data.type === "percentage" &&
      data.value !== undefined &&
      data.value > 100
    ) {
      res
        .status(400)
        .json({ error: "Percentage value cannot exceed 100." });
      return;
    }
    if (
      data.startDate !== undefined &&
      data.endDate !== undefined &&
      !dateRangeOk(data.startDate, data.endDate)
    ) {
      res
        .status(400)
        .json({ error: "End date must be after start date." });
      return;
    }
    const updates: Partial<typeof discountEventsTable.$inferInsert> = {};
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.type !== undefined) updates.type = data.type;
    if (data.value !== undefined) updates.value = String(data.value);
    if (data.appliesTo !== undefined) updates.appliesTo = data.appliesTo;
    if (data.targetIds !== undefined) updates.targetIds = data.targetIds;
    if (data.startDate !== undefined) updates.startDate = data.startDate;
    if (data.endDate !== undefined) updates.endDate = data.endDate;
    if (data.isStackable !== undefined) updates.isStackable = data.isStackable;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    if (Object.keys(updates).length === 0) {
      const [existing] = await db
        .select()
        .from(discountEventsTable)
        .where(eq(discountEventsTable.id, params.data.id))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(discountEventToPayload(existing));
      return;
    }
    const [previous] = await db
      .select()
      .from(discountEventsTable)
      .where(eq(discountEventsTable.id, params.data.id));
    const [row] = await db
      .update(discountEventsTable)
      .set(updates)
      .where(eq(discountEventsTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "discount_event",
      entityId: row.id,
      changeType: "update",
      snapshot: row,
      previousSnapshot: previous ?? null,
    });
    res.json(discountEventToPayload(row));
  },
);

router.delete(
  "/admin/discount-events/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminDeleteDiscountEventParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [previous] = await db
      .select()
      .from(discountEventsTable)
      .where(eq(discountEventsTable.id, params.data.id));
    const result = await db
      .delete(discountEventsTable)
      .where(eq(discountEventsTable.id, params.data.id))
      .returning({ id: discountEventsTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "discount_event",
      entityId: params.data.id,
      changeType: "delete",
      snapshot: previous ?? { id: params.data.id },
      previousSnapshot: previous ?? null,
    });
    res.status(204).end();
  },
);

// ---------------- Coupon Codes ----------------

router.get(
  "/admin/coupon-codes",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(couponCodesTable)
      .orderBy(desc(couponCodesTable.isActive), asc(couponCodesTable.id));
    res.json(rows.map(couponToPayload));
  },
);

router.post(
  "/admin/coupon-codes",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateCouponCodeBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    if (data.discountType === "percentage" && data.value > 100) {
      res
        .status(400)
        .json({ error: "Percentage value cannot exceed 100." });
      return;
    }
    if (!dateRangeOk(data.startDate, data.expirationDate)) {
      res
        .status(400)
        .json({ error: "Expiration must be after start date." });
      return;
    }
    try {
      const [row] = await db
        .insert(couponCodesTable)
        .values({
          code: data.code.trim().toUpperCase(),
          discountType: data.discountType,
          value: String(data.value),
          minOrderAmount:
            data.minOrderAmount === undefined || data.minOrderAmount === null
              ? null
              : String(data.minOrderAmount),
          maxUsesTotal: data.maxUsesTotal ?? null,
          singleUsePerCustomer: data.singleUsePerCustomer ?? false,
          appliesTo: data.appliesTo ?? "global",
          targetIds: data.targetIds ?? [],
          startDate: data.startDate ?? null,
          expirationDate: data.expirationDate ?? null,
          isStackable: data.isStackable ?? false,
          isActive: data.isActive ?? true,
        })
        .returning();
      if (!row) {
        res.status(500).json({ error: "Failed to create coupon" });
        return;
      }
      await recordHistory(req, {
        entityType: "coupon_code",
        entityId: row.id,
        changeType: "create",
        snapshot: row,
      });
      res.status(201).json(couponToPayload(row));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res
          .status(409)
          .json({ error: "A coupon code with that code already exists." });
        return;
      }
      throw err;
    }
  },
);

router.put(
  "/admin/coupon-codes/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateCouponCodeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateCouponCodeBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = body.data;
    if (
      data.discountType === "percentage" &&
      data.value !== undefined &&
      data.value > 100
    ) {
      res
        .status(400)
        .json({ error: "Percentage value cannot exceed 100." });
      return;
    }
    if (
      data.startDate !== undefined &&
      data.expirationDate !== undefined &&
      !dateRangeOk(data.startDate, data.expirationDate)
    ) {
      res
        .status(400)
        .json({ error: "Expiration must be after start date." });
      return;
    }
    const updates: Partial<typeof couponCodesTable.$inferInsert> = {};
    if (data.code !== undefined)
      updates.code = data.code.trim().toUpperCase();
    if (data.discountType !== undefined)
      updates.discountType = data.discountType;
    if (data.value !== undefined) updates.value = String(data.value);
    if (data.minOrderAmount !== undefined)
      updates.minOrderAmount =
        data.minOrderAmount === null ? null : String(data.minOrderAmount);
    if (data.maxUsesTotal !== undefined)
      updates.maxUsesTotal = data.maxUsesTotal;
    if (data.singleUsePerCustomer !== undefined)
      updates.singleUsePerCustomer = data.singleUsePerCustomer;
    if (data.appliesTo !== undefined) updates.appliesTo = data.appliesTo;
    if (data.targetIds !== undefined) updates.targetIds = data.targetIds;
    if (data.startDate !== undefined) updates.startDate = data.startDate;
    if (data.expirationDate !== undefined)
      updates.expirationDate = data.expirationDate;
    if (data.isStackable !== undefined) updates.isStackable = data.isStackable;
    if (data.isActive !== undefined) updates.isActive = data.isActive;

    if (Object.keys(updates).length === 0) {
      const [existing] = await db
        .select()
        .from(couponCodesTable)
        .where(eq(couponCodesTable.id, params.data.id))
        .limit(1);
      if (!existing) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(couponToPayload(existing));
      return;
    }
    const [previous] = await db
      .select()
      .from(couponCodesTable)
      .where(eq(couponCodesTable.id, params.data.id));
    try {
      const [row] = await db
        .update(couponCodesTable)
        .set(updates)
        .where(eq(couponCodesTable.id, params.data.id))
        .returning();
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      await recordHistory(req, {
        entityType: "coupon_code",
        entityId: row.id,
        changeType: "update",
        snapshot: row,
        previousSnapshot: previous ?? null,
      });
      res.json(couponToPayload(row));
    } catch (err) {
      if (isUniqueViolation(err)) {
        res
          .status(409)
          .json({ error: "A coupon code with that code already exists." });
        return;
      }
      throw err;
    }
  },
);

router.delete(
  "/admin/coupon-codes/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminDeleteCouponCodeParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [previous] = await db
      .select()
      .from(couponCodesTable)
      .where(eq(couponCodesTable.id, params.data.id));
    const result = await db
      .delete(couponCodesTable)
      .where(eq(couponCodesTable.id, params.data.id))
      .returning({ id: couponCodesTable.id });
    if (result.length === 0) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "coupon_code",
      entityId: params.data.id,
      changeType: "delete",
      snapshot: previous ?? { id: params.data.id },
      previousSnapshot: previous ?? null,
    });
    res.status(204).end();
  },
);

router.get(
  "/admin/coupon-codes/:id/uses",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminListCouponCodeUsesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [coupon] = await db
      .select({ id: couponCodesTable.id })
      .from(couponCodesTable)
      .where(eq(couponCodesTable.id, params.data.id))
      .limit(1);
    if (!coupon) {
      res.status(404).json({ error: "Coupon not found" });
      return;
    }
    const rows = await db
      .select({
        id: couponCodeUsesTable.id,
        couponCodeId: couponCodeUsesTable.couponCodeId,
        userId: couponCodeUsesTable.userId,
        userEmail: usersTable.email,
        orderId: couponCodeUsesTable.orderId,
        orderNumber: ordersTable.orderNumber,
        discountApplied: couponCodeUsesTable.discountApplied,
        createdAt: couponCodeUsesTable.createdAt,
      })
      .from(couponCodeUsesTable)
      .leftJoin(usersTable, eq(usersTable.id, couponCodeUsesTable.userId))
      .leftJoin(ordersTable, eq(ordersTable.id, couponCodeUsesTable.orderId))
      .where(eq(couponCodeUsesTable.couponCodeId, params.data.id))
      .orderBy(desc(couponCodeUsesTable.createdAt));
    res.json(
      rows.map((r) => ({
        id: r.id,
        couponCodeId: r.couponCodeId,
        userId: r.userId,
        userEmail: r.userEmail,
        orderId: r.orderId,
        orderNumber: r.orderNumber,
        discountApplied: Number(r.discountApplied),
        createdAt: r.createdAt.toISOString(),
      })),
    );
  },
);

export default router;
