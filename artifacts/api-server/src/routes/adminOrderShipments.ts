import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  shipmentsTable,
  shipmentItemsTable,
  carriersTable,
  type Shipment,
  type Carrier,
  type OrderItem,
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
  AdminUpdateOrderScheduledDeliveryParams,
  AdminUpdateOrderScheduledDeliveryBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordHistory } from "../lib/history";

const router: IRouter = Router();

function nullify(v: string | null | undefined): string | null {
  if (v == null) return null;
  const trimmed = v.trim();
  return trimmed.length === 0 ? null : trimmed;
}

// Human-readable label for an order line: base description plus any
// variant/finish/finial/fabric snapshots. Mirrors what the customer sees.
export function orderItemLabel(it: {
  description: string;
  variantNameSnapshot: string | null;
  finishNameSnapshot: string | null;
  finialNameSnapshot: string | null;
  fabricNameSnapshot: string | null;
}): string {
  const extras = [
    it.variantNameSnapshot,
    it.finishNameSnapshot,
    it.finialNameSnapshot,
    it.fabricNameSnapshot,
  ].filter((x): x is string => !!x && x.trim().length > 0);
  return extras.length > 0
    ? `${it.description} — ${extras.join(", ")}`
    : it.description;
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

export type ShipmentItemPayload = {
  orderItemId: number;
  quantity: number;
  description: string;
};

export function shipmentToPayload(
  s: Shipment,
  carrier: Pick<Carrier, "id" | "name" | "code" | "trackingUrlTemplate"> | null,
  items: ShipmentItemPayload[],
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
    notes: s.notes,
    items,
    createdAt: s.createdAt.toISOString(),
  };
}

// Load the assigned items for a set of shipments, keyed by shipmentId, with a
// human-readable label pulled from the order line snapshots.
async function loadShipmentItemsByShipment(
  shipmentIds: number[],
): Promise<Map<number, ShipmentItemPayload[]>> {
  const map = new Map<number, ShipmentItemPayload[]>();
  if (shipmentIds.length === 0) return map;
  const rows = await db
    .select({ si: shipmentItemsTable, oi: orderItemsTable })
    .from(shipmentItemsTable)
    .innerJoin(
      orderItemsTable,
      eq(orderItemsTable.id, shipmentItemsTable.orderItemId),
    )
    .where(inArray(shipmentItemsTable.shipmentId, shipmentIds))
    .orderBy(asc(shipmentItemsTable.id));
  for (const r of rows) {
    const list = map.get(r.si.shipmentId) ?? [];
    list.push({
      orderItemId: r.si.orderItemId,
      quantity: r.si.quantity,
      description: orderItemLabel(r.oi),
    });
    map.set(r.si.shipmentId, list);
  }
  return map;
}

export async function loadOrderShipments(orderId: number) {
  const rows = await db
    .select({ s: shipmentsTable, c: carriersTable })
    .from(shipmentsTable)
    .leftJoin(carriersTable, eq(carriersTable.id, shipmentsTable.carrierId))
    .where(eq(shipmentsTable.orderId, orderId))
    .orderBy(asc(shipmentsTable.createdAt));
  const itemsByShipment = await loadShipmentItemsByShipment(
    rows.map((r) => r.s.id),
  );
  return rows.map((r) =>
    shipmentToPayload(r.s, r.c, itemsByShipment.get(r.s.id) ?? []),
  );
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

// Sum, per orderItemId, of quantities already assigned to OTHER shipments on
// the same order (optionally excluding the shipment being edited).
async function loadAssignedByOrderItem(
  orderId: number,
  excludeShipmentId?: number,
): Promise<Map<number, number>> {
  const rows = await db
    .select({
      orderItemId: shipmentItemsTable.orderItemId,
      quantity: shipmentItemsTable.quantity,
      shipmentId: shipmentItemsTable.shipmentId,
    })
    .from(shipmentItemsTable)
    .innerJoin(
      shipmentsTable,
      eq(shipmentsTable.id, shipmentItemsTable.shipmentId),
    )
    .where(eq(shipmentsTable.orderId, orderId));
  const map = new Map<number, number>();
  for (const r of rows) {
    if (excludeShipmentId != null && r.shipmentId === excludeShipmentId)
      continue;
    map.set(r.orderItemId, (map.get(r.orderItemId) ?? 0) + r.quantity);
  }
  return map;
}

type ValidatedShipment = {
  carrierId: number;
  trackingNumber: string;
  items: { orderItemId: number; quantity: number }[];
};

// Validates a create/update shipment payload: carrier + tracking required, at
// least one item with quantity > 0, and no item over its unassigned remainder.
async function validateShipmentPayload(
  orderId: number,
  input: {
    carrierId: number | null | undefined;
    trackingNumber: string | null;
    items: { orderItemId: number; quantity: number }[];
  },
  excludeShipmentId?: number,
): Promise<{ ok: true; value: ValidatedShipment } | { ok: false; error: string }> {
  if (input.carrierId == null) {
    return { ok: false, error: "Select a carrier for this shipment" };
  }
  const tracking = input.trackingNumber?.trim() ?? "";
  if (tracking.length === 0) {
    return { ok: false, error: "Enter a tracking number" };
  }

  // Aggregate requested quantities per order item (drop zero/negative).
  const requested = new Map<number, number>();
  for (const it of input.items) {
    if (!Number.isInteger(it.quantity) || it.quantity < 0) {
      return { ok: false, error: "Quantities must be whole numbers" };
    }
    if (it.quantity === 0) continue;
    requested.set(it.orderItemId, (requested.get(it.orderItemId) ?? 0) + it.quantity);
  }
  if (requested.size === 0) {
    return { ok: false, error: "Assign at least one item to this shipment" };
  }

  const orderLines = await db
    .select({ id: orderItemsTable.id, quantity: orderItemsTable.quantity })
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, orderId));
  const orderedById = new Map(orderLines.map((l) => [l.id, l.quantity]));
  const assigned = await loadAssignedByOrderItem(orderId, excludeShipmentId);

  for (const [orderItemId, qty] of requested) {
    const ordered = orderedById.get(orderItemId);
    if (ordered == null) {
      return { ok: false, error: "Item does not belong to this order" };
    }
    const remaining = ordered - (assigned.get(orderItemId) ?? 0);
    if (qty > remaining) {
      return {
        ok: false,
        error: `Cannot assign ${qty}; only ${remaining} left unassigned for one of the items`,
      };
    }
  }

  return {
    ok: true,
    value: {
      carrierId: input.carrierId,
      trackingNumber: tracking,
      items: [...requested.entries()].map(([orderItemId, quantity]) => ({
        orderItemId,
        quantity,
      })),
    },
  };
}

// Build the payload item list (with labels) for a freshly written shipment.
async function buildShipmentItemPayloads(
  items: { orderItemId: number; quantity: number }[],
): Promise<ShipmentItemPayload[]> {
  const ids = items.map((i) => i.orderItemId);
  const rows =
    ids.length === 0
      ? ([] as OrderItem[])
      : await db
          .select()
          .from(orderItemsTable)
          .where(inArray(orderItemsTable.id, ids));
  const labelById = new Map(rows.map((r) => [r.id, orderItemLabel(r)]));
  return items.map((i) => ({
    orderItemId: i.orderItemId,
    quantity: i.quantity,
    description: labelById.get(i.orderItemId) ?? "",
  }));
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

router.patch(
  "/admin/orders/:id/scheduled-delivery",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateOrderScheduledDeliveryParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateOrderScheduledDeliveryBody.safeParse(req.body);
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
    const scheduledDeliveryDate = nullify(body.data.scheduledDeliveryDate);
    const scheduledDeliveryTime = nullify(body.data.scheduledDeliveryTime);
    const [updated] = await db
      .update(ordersTable)
      .set({ scheduledDeliveryDate, scheduledDeliveryTime })
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
      notes: `scheduledDelivery=${scheduledDeliveryDate ?? "(none)"} ${
        scheduledDeliveryTime ?? ""
      }`.trim(),
    });
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
    const validated = await validateShipmentPayload(orderId, {
      carrierId: body.data.carrierId ?? null,
      trackingNumber: nullify(body.data.trackingNumber),
      items: body.data.items,
    });
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }
    const check = await ensureCarrierActive(validated.value.carrierId);
    if (!check.ok) {
      res.status(400).json({ error: check.reason });
      return;
    }
    const carrier: Carrier = check.carrier;
    const created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(shipmentsTable)
        .values({
          orderId,
          carrierId: validated.value.carrierId,
          trackingNumber: validated.value.trackingNumber,
          notes: nullify(body.data.notes),
        })
        .returning();
      if (!row) return null;
      await tx.insert(shipmentItemsTable).values(
        validated.value.items.map((i) => ({
          shipmentId: row.id,
          orderItemId: i.orderItemId,
          quantity: i.quantity,
        })),
      );
      return row;
    });
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
    const itemPayloads = await buildShipmentItemPayloads(validated.value.items);
    res.status(201).json(shipmentToPayload(created, carrier, itemPayloads));
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
    const validated = await validateShipmentPayload(
      orderId,
      {
        carrierId: body.data.carrierId ?? null,
        trackingNumber: nullify(body.data.trackingNumber),
        items: body.data.items,
      },
      shipmentId,
    );
    if (!validated.ok) {
      res.status(400).json({ error: validated.error });
      return;
    }
    const check = await ensureCarrierActive(validated.value.carrierId);
    if (!check.ok) {
      res.status(400).json({ error: check.reason });
      return;
    }
    const carrier: Carrier = check.carrier;
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(shipmentsTable)
        .set({
          carrierId: validated.value.carrierId,
          trackingNumber: validated.value.trackingNumber,
          notes: nullify(body.data.notes),
        })
        .where(
          and(
            eq(shipmentsTable.id, shipmentId),
            eq(shipmentsTable.orderId, orderId),
          ),
        )
        .returning();
      if (!row) return null;
      await tx
        .delete(shipmentItemsTable)
        .where(eq(shipmentItemsTable.shipmentId, shipmentId));
      await tx.insert(shipmentItemsTable).values(
        validated.value.items.map((i) => ({
          shipmentId,
          orderItemId: i.orderItemId,
          quantity: i.quantity,
        })),
      );
      return row;
    });
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
    const itemPayloads = await buildShipmentItemPayloads(validated.value.items);
    res.json(shipmentToPayload(updated, carrier, itemPayloads));
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
