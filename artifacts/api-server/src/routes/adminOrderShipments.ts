import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq } from "drizzle-orm";
import {
  db,
  ordersTable,
  shipmentsTable,
  carriersTable,
  type Shipment,
  type Carrier,
} from "@workspace/db";
import {
  AdminListOrderShipmentsParams,
  AdminCreateOrderShipmentParams,
  AdminCreateOrderShipmentBody,
  AdminUpdateOrderShipmentParams,
  AdminUpdateOrderShipmentBody,
  AdminDeleteOrderShipmentParams,
  AdminUpdateOrderShippingMethodParams,
  AdminUpdateOrderShippingMethodBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordHistory } from "../lib/history";

const router: IRouter = Router();

function nullify(v: string | null | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function buildTrackingUrl(
  template: string | null,
  trackingNumber: string | null,
): string | null {
  if (!template || !trackingNumber) return null;
  const t = trackingNumber.trim();
  if (!t) return null;
  if (template.includes("{tracking}")) {
    return template.replaceAll("{tracking}", encodeURIComponent(t));
  }
  if (template.includes("{trackingNumber}")) {
    return template.replaceAll("{trackingNumber}", encodeURIComponent(t));
  }
  return template + encodeURIComponent(t);
}

export function shipmentToPayload(
  s: Shipment,
  carrier: Pick<Carrier, "id" | "name" | "code" | "trackingUrlTemplate"> | null,
) {
  return {
    id: s.id,
    orderId: s.orderId,
    carrierId: s.carrierId,
    carrierName: carrier?.name ?? null,
    carrierCode: carrier?.code ?? null,
    trackingNumber: s.trackingNumber,
    trackingUrl: buildTrackingUrl(
      carrier?.trackingUrlTemplate ?? null,
      s.trackingNumber,
    ),
    shippedAt: s.shippedAt ? s.shippedAt.toISOString() : null,
    deliveredAt: s.deliveredAt ? s.deliveredAt.toISOString() : null,
    notes: s.notes,
    createdAt: s.createdAt.toISOString(),
  };
}

export async function loadOrderShipments(orderId: number) {
  const rows = await db
    .select({ s: shipmentsTable, c: carriersTable })
    .from(shipmentsTable)
    .leftJoin(carriersTable, eq(carriersTable.id, shipmentsTable.carrierId))
    .where(eq(shipmentsTable.orderId, orderId))
    .orderBy(asc(shipmentsTable.createdAt));
  return rows.map((r) => shipmentToPayload(r.s, r.c));
}

async function ensureOrderExists(orderId: number): Promise<boolean> {
  const [row] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  return !!row;
}

async function ensureCarrierActive(
  carrierId: number,
): Promise<{ ok: true; carrier: Carrier } | { ok: false; reason: string }> {
  const [c] = await db
    .select()
    .from(carriersTable)
    .where(eq(carriersTable.id, carrierId))
    .limit(1);
  if (!c) return { ok: false, reason: "Carrier not found" };
  if (!c.isActive) return { ok: false, reason: "Carrier is not active" };
  return { ok: true, carrier: c };
}

function dateOrNull(v: Date | null | undefined): Date | null {
  return v ?? null;
}

function validateShipmentInput(input: {
  carrierId: number | null | undefined;
  trackingNumber: string | null | undefined;
  shippedAt: Date | null;
  deliveredAt: Date | null;
}): string | null {
  const tracking = input.trackingNumber?.trim() ?? "";
  if (tracking.length > 0 && input.carrierId == null) {
    return "Select a carrier when entering a tracking number";
  }
  if (
    input.shippedAt &&
    input.deliveredAt &&
    input.deliveredAt.getTime() < input.shippedAt.getTime()
  ) {
    return "Delivered date cannot be before shipped date";
  }
  return null;
}

router.patch(
  "/admin/orders/:id/shipping-method",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateOrderShippingMethodParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateOrderShippingMethodBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    const orderId = params.data.id;
    const [previous] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    if (!previous) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const next = nullify(body.data.shippingMethod);
    const [updated] = await db
      .update(ordersTable)
      .set({ shippingMethod: next })
      .where(eq(ordersTable.id, orderId))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "order",
      entityId: orderId,
      changeType: "update",
      snapshot: updated,
      previousSnapshot: previous,
      notes: `shippingMethod=${next ?? "(none)"}`,
    });
    // Re-use admin orders detail loader by importing lazily to avoid cycles.
    const { loadOrderDetail } = await import("./adminOrders");
    const detail = await loadOrderDetail(orderId);
    if (!detail) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(detail);
  },
);

router.get(
  "/admin/orders/:id/shipments",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminListOrderShipmentsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    if (!(await ensureOrderExists(params.data.id))) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const list = await loadOrderShipments(params.data.id);
    res.json(list);
  },
);

router.post(
  "/admin/orders/:id/shipments",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminCreateOrderShipmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminCreateOrderShipmentBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const orderId = params.data.id;
    if (!(await ensureOrderExists(orderId))) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    const shippedAt = dateOrNull(body.data.shippedAt);
    const deliveredAt = dateOrNull(body.data.deliveredAt);
    const trackingNumber = nullify(body.data.trackingNumber);
    const validationError = validateShipmentInput({
      carrierId: body.data.carrierId ?? null,
      trackingNumber,
      shippedAt,
      deliveredAt,
    });
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    let carrier: Carrier | null = null;
    if (body.data.carrierId != null) {
      const check = await ensureCarrierActive(body.data.carrierId);
      if (!check.ok) {
        res.status(400).json({ error: check.reason });
        return;
      }
      carrier = check.carrier;
    }
    const [created] = await db
      .insert(shipmentsTable)
      .values({
        orderId,
        carrierId: body.data.carrierId ?? null,
        trackingNumber,
        shippedAt,
        deliveredAt,
        notes: nullify(body.data.notes),
      })
      .returning();
    if (!created) {
      res.status(500).json({ error: "Insert returned no row" });
      return;
    }
    await recordHistory(req, {
      entityType: "order",
      entityId: orderId,
      changeType: "update",
      snapshot: created,
      notes: `shipment.create id=${created.id}`,
    });
    res.status(201).json(shipmentToPayload(created, carrier));
  },
);

router.put(
  "/admin/orders/:id/shipments/:shipmentId",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateOrderShipmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateOrderShipmentBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const orderId = params.data.id;
    const shipmentId = params.data.shipmentId;
    const [previous] = await db
      .select()
      .from(shipmentsTable)
      .where(
        and(
          eq(shipmentsTable.id, shipmentId),
          eq(shipmentsTable.orderId, orderId),
        ),
      )
      .limit(1);
    if (!previous) {
      res.status(404).json({ error: "Shipment not found" });
      return;
    }
    const shippedAt = dateOrNull(body.data.shippedAt);
    const deliveredAt = dateOrNull(body.data.deliveredAt);
    const trackingNumber = nullify(body.data.trackingNumber);
    const validationError = validateShipmentInput({
      carrierId: body.data.carrierId ?? null,
      trackingNumber,
      shippedAt,
      deliveredAt,
    });
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    let carrier: Carrier | null = null;
    if (body.data.carrierId != null) {
      const check = await ensureCarrierActive(body.data.carrierId);
      if (!check.ok) {
        res.status(400).json({ error: check.reason });
        return;
      }
      carrier = check.carrier;
    }
    const [updated] = await db
      .update(shipmentsTable)
      .set({
        carrierId: body.data.carrierId ?? null,
        trackingNumber,
        shippedAt,
        deliveredAt,
        notes: nullify(body.data.notes),
      })
      .where(
        and(
          eq(shipmentsTable.id, shipmentId),
          eq(shipmentsTable.orderId, orderId),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Shipment not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "order",
      entityId: orderId,
      changeType: "update",
      snapshot: updated,
      previousSnapshot: previous,
      notes: `shipment.update id=${shipmentId}`,
    });
    res.json(shipmentToPayload(updated, carrier));
  },
);

router.delete(
  "/admin/orders/:id/shipments/:shipmentId",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminDeleteOrderShipmentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const orderId = params.data.id;
    const shipmentId = params.data.shipmentId;
    const [previous] = await db
      .select()
      .from(shipmentsTable)
      .where(
        and(
          eq(shipmentsTable.id, shipmentId),
          eq(shipmentsTable.orderId, orderId),
        ),
      )
      .limit(1);
    if (!previous) {
      res.status(404).json({ error: "Shipment not found" });
      return;
    }
    await db
      .delete(shipmentsTable)
      .where(
        and(
          eq(shipmentsTable.id, shipmentId),
          eq(shipmentsTable.orderId, orderId),
        ),
      );
    await recordHistory(req, {
      entityType: "order",
      entityId: orderId,
      changeType: "delete",
      snapshot: previous,
      previousSnapshot: previous,
      notes: `shipment.delete id=${shipmentId}`,
    });
    res.status(204).end();
  },
);

export default router;
