import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, asc, desc, eq, ilike, or, sql, inArray } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  orderStatusHistoryTable,
  addressesTable,
  customersTable,
  usersTable,
  vendorOrdersTable,
  cancellationRequestsTable,
  manufacturersTable,
  productsTable,
  productVariantsTable,
  fabricsTable,
  type Order,
  type OrderItem,
  type Address,
} from "@workspace/db";
import {
  AdminListOrdersQueryParams,
  AdminGetOrderParams,
  AdminUpdateOrderStatusParams,
  AdminUpdateOrderStatusBody,
  AdminUpdateOrderNotesParams,
  AdminUpdateOrderNotesBody,
  AdminUpdateOrderTotalsParams,
  AdminUpdateOrderTotalsBody,
  AdminListCancellationRequestsQueryParams,
  AdminReviewCancellationRequestParams,
  AdminReviewCancellationRequestBody,
  AdminCreateOrderBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordAudit } from "../lib/audit";
import { recordHistory } from "../lib/history";
import { loadOrderShipments } from "./adminOrderShipments";
import { loadOrderPayments } from "./adminOrderPayments";
import { autoGenerateVendorOrders } from "../lib/autoGenerateVendorOrders";
import { sendOrderStatusEmail } from "../lib/orderStatusEmail";

const router: IRouter = Router();
const DEFAULT_LIMIT = 50;

// Allowed statuses for the order lifecycle. Kept permissive for v1; we accept
// any of these and log the transition. Strict transition graphs come later
// when the agent / customer-facing flows formalize the workflow.
const ALLOWED_ORDER_STATUSES = new Set([
  "pending",
  "confirmed",
  "in_production",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "completed",
  "canceled",
  "refunded",
]);

// Once an order reaches one of these, it cannot transition out of it.
// Refunds out of canceled are intentionally allowed (canceled -> refunded).
const TERMINAL_ORDER_STATUSES = new Set(["completed", "refunded"]);

function nameOf(first: string | null, last: string | null): string | null {
  const v = [first, last].filter(Boolean).join(" ").trim();
  return v.length === 0 ? null : v;
}

function addressToPayload(a: Address | null) {
  if (!a) return null;
  return {
    id: a.id,
    recipientName: a.recipientName,
    street1: a.street1,
    street2: a.street2,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
    phone: a.phone,
  };
}

function itemToPayload(it: OrderItem) {
  return {
    id: it.id,
    productId: it.productId,
    productSkuSnapshot: it.productSkuSnapshot,
    variantSkuSnapshot: it.variantSkuSnapshot,
    variantNameSnapshot: it.variantNameSnapshot,
    fabricNameSnapshot: it.fabricNameSnapshot,
    department: it.department,
    description: it.description,
    quantity: it.quantity,
    unitPrice: Number(it.unitPrice),
    amount: Number(it.amount),
    discountAmount: Number(it.discountAmount),
    discountReason: it.discountReason,
    notes: it.notes,
    vendorOrderId: it.vendorOrderId,
  };
}

router.get(
  "/admin/orders",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminListOrdersQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const { status, q, customerId, limit, offset, includeRestocks } =
      parsed.data;
    // Agents are scoped to orders they created. Admins may filter by any agent.
    const agentId =
      req.user?.role === "agent" ? req.user.id : parsed.data.agentId;
    const conditions: Array<ReturnType<typeof eq>> = [];
    if (status) conditions.push(eq(ordersTable.status, status));
    if (customerId !== undefined)
      conditions.push(eq(ordersTable.customerId, customerId));
    if (agentId !== undefined)
      conditions.push(eq(ordersTable.createdByAgentId, agentId));
    // Internal inventory-restock orders are hidden from the standard order
    // list — they are visible from the vendor-orders area instead.
    if (!includeRestocks)
      conditions.push(eq(ordersTable.isInternalRestock, false));
    if (q && q.trim()) {
      const needle = `%${q.trim()}%`;
      const orExpr = or(
        ilike(ordersTable.orderNumber, needle),
        ilike(customersTable.email, needle),
        ilike(customersTable.firstName, needle),
        ilike(customersTable.lastName, needle),
      );
      if (orExpr) conditions.push(orExpr);
    }
    const whereExpr = conditions.length ? and(...conditions) : undefined;
    const cap = Math.min(limit ?? DEFAULT_LIMIT, 200);
    const off = offset ?? 0;

    const rows = await db
      .select({
        order: ordersTable,
        customer: customersTable,
        agent: usersTable,
        itemCount: sql<number>`(
          SELECT count(*)::int
          FROM ${orderItemsTable}
          WHERE ${orderItemsTable.orderId} = ${ordersTable.id}
        )`,
      })
      .from(ordersTable)
      .leftJoin(customersTable, eq(customersTable.id, ordersTable.customerId))
      .leftJoin(usersTable, eq(usersTable.id, ordersTable.createdByAgentId))
      .where(whereExpr)
      .orderBy(desc(ordersTable.placedAt))
      .limit(cap)
      .offset(off);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ordersTable)
      .leftJoin(customersTable, eq(customersTable.id, ordersTable.customerId))
      .where(whereExpr);

    res.json({
      rows: rows.map((r) => ({
        id: r.order.id,
        orderNumber: r.order.orderNumber,
        status: r.order.status,
        orderType: r.order.orderType,
        total: Number(r.order.total),
        balanceDue: Number(r.order.balanceDue),
        customerId: r.order.customerId,
        customerName: r.customer
          ? nameOf(r.customer.firstName, r.customer.lastName)
          : null,
        customerEmail: r.customer?.email ?? null,
        agentId: r.order.createdByAgentId,
        agentName: r.agent ? nameOf(r.agent.firstName, r.agent.lastName) : null,
        itemCount: r.itemCount,
        placedAt: r.order.placedAt.toISOString(),
        isInternalRestock: r.order.isInternalRestock,
      })),
      total: countRow?.count ?? 0,
    });
  },
);

export async function loadOrderDetail(orderId: number) {
  const [orderRow] = await db
    .select({
      order: ordersTable,
      customer: customersTable,
      agent: usersTable,
    })
    .from(ordersTable)
    .leftJoin(customersTable, eq(customersTable.id, ordersTable.customerId))
    .leftJoin(usersTable, eq(usersTable.id, ordersTable.createdByAgentId))
    .where(eq(ordersTable.id, orderId))
    .limit(1);
  if (!orderRow) return null;
  const o = orderRow.order;

  const [shippingAddr, billingAddr] = await Promise.all([
    o.shippingAddressId
      ? db
          .select()
          .from(addressesTable)
          .where(eq(addressesTable.id, o.shippingAddressId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
    o.billingAddressId
      ? db
          .select()
          .from(addressesTable)
          .where(eq(addressesTable.id, o.billingAddressId))
          .limit(1)
          .then((r) => r[0] ?? null)
      : Promise.resolve(null),
  ]);

  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, orderId))
    .orderBy(asc(orderItemsTable.id));

  const history = await db
    .select({
      h: orderStatusHistoryTable,
      user: usersTable,
    })
    .from(orderStatusHistoryTable)
    .leftJoin(
      usersTable,
      eq(usersTable.id, orderStatusHistoryTable.changedByUserId),
    )
    .where(eq(orderStatusHistoryTable.orderId, orderId))
    .orderBy(desc(orderStatusHistoryTable.createdAt));

  const vos = await db
    .select({
      vo: vendorOrdersTable,
      mfg: manufacturersTable,
    })
    .from(vendorOrdersTable)
    .leftJoin(
      manufacturersTable,
      eq(manufacturersTable.id, vendorOrdersTable.manufacturerId),
    )
    .where(eq(vendorOrdersTable.customerOrderId, orderId))
    .orderBy(asc(vendorOrdersTable.id));

  const cancellations = await db
    .select({
      c: cancellationRequestsTable,
      requester: usersTable,
    })
    .from(cancellationRequestsTable)
    .leftJoin(
      usersTable,
      eq(usersTable.id, cancellationRequestsTable.requestedByUserId),
    )
    .where(eq(cancellationRequestsTable.orderId, orderId))
    .orderBy(desc(cancellationRequestsTable.createdAt));

  const reviewerIds = Array.from(
    new Set(
      cancellations
        .map((cr) => cr.c.reviewedByUserId)
        .filter((id): id is number => id !== null),
    ),
  );
  const reviewers = reviewerIds.length
    ? await db
        .select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(inArray(usersTable.id, reviewerIds))
    : [];
  const reviewerEmail = new Map(reviewers.map((r) => [r.id, r.email]));

  return {
    id: o.id,
    orderNumber: o.orderNumber,
    status: o.status,
    orderType: o.orderType,
    subtotal: Number(o.subtotal),
    taxAmount: Number(o.taxAmount),
    deliveryAmount: Number(o.deliveryAmount),
    total: Number(o.total),
    depositAmount: Number(o.depositAmount),
    balanceDue: Number(o.balanceDue),
    customerId: o.customerId,
    customerName: orderRow.customer
      ? nameOf(orderRow.customer.firstName, orderRow.customer.lastName)
      : null,
    customerEmail: orderRow.customer?.email ?? null,
    agentId: o.createdByAgentId,
    agentName: orderRow.agent
      ? nameOf(orderRow.agent.firstName, orderRow.agent.lastName)
      : null,
    salespersonName: o.salespersonName,
    shippingMethod: o.shippingMethod,
    specialInstructions: o.specialInstructions,
    notes: o.notes,
    merchandiseReceived: o.merchandiseReceived,
    placedAt: o.placedAt.toISOString(),
    updatedAt: o.updatedAt.toISOString(),
    shippingAddress: addressToPayload(shippingAddr),
    billingAddress: addressToPayload(billingAddr),
    items: items.map(itemToPayload),
    statusHistory: history.map((h) => ({
      id: h.h.id,
      fromStatus: h.h.fromStatus,
      toStatus: h.h.toStatus,
      changedByUserId: h.h.changedByUserId,
      changedByEmail: h.user?.email ?? null,
      note: h.h.note,
      createdAt: h.h.createdAt.toISOString(),
    })),
    shipments: await loadOrderShipments(orderId),
    payments: await loadOrderPayments(orderId),
    amountPaid: Number(o.depositAmount),
    paidInFull: Number(o.balanceDue) <= 0 && Number(o.depositAmount) > 0,
    vendorOrders: vos.map((v) => ({
      id: v.vo.id,
      vendorOrderNumber: v.vo.vendorOrderNumber,
      status: v.vo.status,
      manufacturerId: v.vo.manufacturerId,
      manufacturerName: v.mfg?.name ?? null,
      sentAt: v.vo.sentAt ? v.vo.sentAt.toISOString() : null,
      receivedAt: v.vo.receivedAt ? v.vo.receivedAt.toISOString() : null,
      itemsReceived: v.vo.itemsReceived,
    })),
    cancellationRequests: cancellations.map((cr) => ({
      id: cr.c.id,
      orderId: cr.c.orderId,
      orderNumber: o.orderNumber,
      requestedByUserId: cr.c.requestedByUserId,
      requestedByEmail: cr.requester?.email ?? null,
      reason: cr.c.reason,
      status: cr.c.status,
      reviewedByUserId: cr.c.reviewedByUserId,
      reviewedByEmail:
        cr.c.reviewedByUserId !== null
          ? (reviewerEmail.get(cr.c.reviewedByUserId) ?? null)
          : null,
      reviewedAt: cr.c.reviewedAt ? cr.c.reviewedAt.toISOString() : null,
      reviewNote: cr.c.reviewNote,
      refundAmount:
        cr.c.refundAmount === null ? null : Number(cr.c.refundAmount),
      createdAt: cr.c.createdAt.toISOString(),
    })),
    isQuickOrder: o.isQuickOrder,
    skipVendorOrder: o.skipVendorOrder,
    walkInName: o.walkInName,
    walkInEmail: o.walkInEmail,
    walkInPhone: o.walkInPhone,
    isInternalRestock: o.isInternalRestock,
    shipToStore: o.shipToStore,
  };
}

router.get(
  "/admin/orders/:id",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const detail = await loadOrderDetail(params.data.id);
    if (!detail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Agents may only view orders they created.
    if (req.user?.role === "agent" && detail.agentId !== req.user.id) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(detail);
  },
);

router.post(
  "/admin/orders/:id/status",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateOrderStatusParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateOrderStatusBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    if (!ALLOWED_ORDER_STATUSES.has(body.data.toStatus)) {
      res.status(400).json({ error: "Unknown order status" });
      return;
    }
    const orderId = params.data.id;
    const userId = req.session?.userId ?? null;
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "not_found" as const };
      // Agents can only modify orders they created.
      if (
        req.user?.role === "agent" &&
        existing.createdByAgentId !== req.user.id
      ) {
        return { kind: "not_found" as const };
      }
      if (existing.status === body.data.toStatus) {
        return { kind: "noop" as const };
      }
      if (TERMINAL_ORDER_STATUSES.has(existing.status)) {
        return {
          kind: "terminal" as const,
          fromStatus: existing.status,
        };
      }
      const [row] = await tx
        .update(ordersTable)
        .set({ status: body.data.toStatus })
        .where(eq(ordersTable.id, orderId))
        .returning();
      await tx.insert(orderStatusHistoryTable).values({
        orderId,
        fromStatus: existing.status,
        toStatus: body.data.toStatus,
        changedByUserId: userId,
        note: body.data.note ?? null,
      });
      return { kind: "updated" as const, row: row ?? null };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "terminal") {
      res.status(409).json({
        error: `Cannot transition out of terminal status '${result.fromStatus}'`,
      });
      return;
    }
    if (result.kind === "updated") {
      await recordAudit(req, {
        action: "order.status_change",
        entityType: "order",
        entityId: orderId,
        changes: { toStatus: body.data.toStatus, note: body.data.note ?? null },
      });
      if (result.row) {
        await recordHistory(req, {
          entityType: "order",
          entityId: orderId,
          changeType: "update",
          snapshot: result.row,
          notes: `status → ${body.data.toStatus}${body.data.note ? `: ${body.data.note}` : ""}`,
        });
      }
      // Fire customer status-change email. Intentionally NOT awaited so
      // a slow Resend round-trip doesn't add latency to the API
      // response or tie up an Express worker. Errors are swallowed
      // inside the helper, but we attach a final `.catch` as belt-and-
      // suspenders against any unhandled rejection.
      void sendOrderStatusEmail(orderId, body.data.toStatus).catch(() => {});
    }
    const detail = await loadOrderDetail(orderId);
    if (!detail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(detail);
  },
);

router.post(
  "/admin/orders/:id/totals",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateOrderTotalsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateOrderTotalsBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    if (
      body.data.deliveryAmount === undefined &&
      body.data.taxAmount === undefined
    ) {
      res
        .status(400)
        .json({ error: "Provide at least one of deliveryAmount or taxAmount" });
      return;
    }
    const orderId = params.data.id;
    const userId = req.session?.userId ?? null;

    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "not_found" as const };

      const subtotal = Number(existing.subtotal);
      const deposit = Number(existing.depositAmount);
      const oldDelivery = Number(existing.deliveryAmount);
      const oldTax = Number(existing.taxAmount);
      const newDelivery =
        body.data.deliveryAmount !== undefined
          ? body.data.deliveryAmount
          : oldDelivery;
      const newTax =
        body.data.taxAmount !== undefined ? body.data.taxAmount : oldTax;
      const newTotal = subtotal + newDelivery + newTax;
      const newBalance = newTotal - deposit;

      await tx
        .update(ordersTable)
        .set({
          deliveryAmount: money(newDelivery),
          taxAmount: money(newTax),
          total: money(newTotal),
          balanceDue: money(newBalance),
        })
        .where(eq(ordersTable.id, orderId));

      const parts: string[] = [];
      if (body.data.deliveryAmount !== undefined)
        parts.push(`delivery ${money(oldDelivery)} → ${money(newDelivery)}`);
      if (body.data.taxAmount !== undefined)
        parts.push(`tax ${money(oldTax)} → ${money(newTax)}`);
      const noteSuffix = body.data.note ? ` — ${body.data.note}` : "";
      await tx.insert(orderStatusHistoryTable).values({
        orderId,
        fromStatus: existing.status,
        toStatus: existing.status,
        changedByUserId: userId,
        note: `Totals overridden: ${parts.join(", ")}${noteSuffix}`,
      });

      return { kind: "updated" as const };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }

    await recordAudit(req, {
      action: "order.totals_override",
      entityType: "order",
      entityId: orderId,
      changes: {
        deliveryAmount: body.data.deliveryAmount,
        taxAmount: body.data.taxAmount,
        note: body.data.note ?? null,
      },
    });
    const [latestOrder] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId));
    if (latestOrder) {
      await recordHistory(req, {
        entityType: "order",
        entityId: orderId,
        changeType: "update",
        snapshot: latestOrder,
        notes: `totals override${body.data.note ? `: ${body.data.note}` : ""}`,
      });
    }

    const detail = await loadOrderDetail(orderId);
    if (!detail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(detail);
  },
);

router.post(
  "/admin/orders/:id/notes",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateOrderNotesParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateOrderNotesBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    // Agents can only modify orders they created.
    if (req.user?.role === "agent") {
      const [existing] = await db
        .select({ createdByAgentId: ordersTable.createdByAgentId })
        .from(ordersTable)
        .where(eq(ordersTable.id, params.data.id))
        .limit(1);
      if (!existing || existing.createdByAgentId !== req.user.id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
    }
    const [row] = await db
      .update(ordersTable)
      .set({ notes: body.data.notes ?? null })
      .where(eq(ordersTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await recordAudit(req, {
      action: "order.notes_update",
      entityType: "order",
      entityId: row.id,
      changes: { notes: body.data.notes ?? null },
    });
    await recordHistory(req, {
      entityType: "order",
      entityId: row.id,
      changeType: "update",
      snapshot: row,
      notes: "notes updated",
    });
    const detail = await loadOrderDetail(row.id);
    if (!detail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(detail);
  },
);

router.get(
  "/admin/cancellation-requests",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminListCancellationRequestsQueryParams.safeParse(
      req.query,
    );
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const { status } = parsed.data;
    const whereExpr = status
      ? eq(cancellationRequestsTable.status, status)
      : undefined;
    const rows = await db
      .select({
        c: cancellationRequestsTable,
        order: ordersTable,
        requester: usersTable,
      })
      .from(cancellationRequestsTable)
      .leftJoin(
        ordersTable,
        eq(ordersTable.id, cancellationRequestsTable.orderId),
      )
      .leftJoin(
        usersTable,
        eq(usersTable.id, cancellationRequestsTable.requestedByUserId),
      )
      .where(whereExpr)
      .orderBy(desc(cancellationRequestsTable.createdAt));
    const reviewerIds = Array.from(
      new Set(
        rows
          .map((r) => r.c.reviewedByUserId)
          .filter((id): id is number => id !== null),
      ),
    );
    const reviewers = reviewerIds.length
      ? await db
          .select({ id: usersTable.id, email: usersTable.email })
          .from(usersTable)
          .where(inArray(usersTable.id, reviewerIds))
      : [];
    const reviewerMap = new Map(reviewers.map((r) => [r.id, r.email]));
    res.json(
      rows.map((r) => ({
        id: r.c.id,
        orderId: r.c.orderId,
        orderNumber: r.order?.orderNumber ?? null,
        requestedByUserId: r.c.requestedByUserId,
        requestedByEmail: r.requester?.email ?? null,
        reason: r.c.reason,
        status: r.c.status,
        reviewedByUserId: r.c.reviewedByUserId,
        reviewedByEmail:
          r.c.reviewedByUserId !== null
            ? (reviewerMap.get(r.c.reviewedByUserId) ?? null)
            : null,
        reviewedAt: r.c.reviewedAt ? r.c.reviewedAt.toISOString() : null,
        reviewNote: r.c.reviewNote,
        refundAmount:
          r.c.refundAmount === null ? null : Number(r.c.refundAmount),
        createdAt: r.c.createdAt.toISOString(),
      })),
    );
  },
);

router.post(
  "/admin/cancellation-requests/:id/review",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminReviewCancellationRequestParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminReviewCancellationRequestBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    if (
      body.data.decision === "denied" &&
      body.data.refundAmount !== undefined &&
      body.data.refundAmount !== null
    ) {
      res
        .status(400)
        .json({ error: "refundAmount is not allowed when denying" });
      return;
    }
    const userId = req.session?.userId ?? null;
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(cancellationRequestsTable)
        .where(eq(cancellationRequestsTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "not_found" as const };
      if (existing.status !== "pending")
        return { kind: "already" as const, status: existing.status };
      const [row] = await tx
        .update(cancellationRequestsTable)
        .set({
          status: body.data.decision,
          reviewedByUserId: userId,
          reviewedAt: new Date(),
          reviewNote: body.data.reviewNote ?? null,
          refundAmount:
            body.data.refundAmount !== undefined &&
            body.data.refundAmount !== null
              ? body.data.refundAmount.toString()
              : null,
        })
        .where(eq(cancellationRequestsTable.id, params.data.id))
        .returning();
      // If approved, also flip the order to canceled and write history.
      if (body.data.decision === "approved" && row) {
        const [orderRow] = await tx
          .select()
          .from(ordersTable)
          .where(eq(ordersTable.id, row.orderId))
          .for("update")
          .limit(1);
        if (orderRow && orderRow.status !== "canceled") {
          await tx
            .update(ordersTable)
            .set({ status: "canceled" })
            .where(eq(ordersTable.id, row.orderId));
          await tx.insert(orderStatusHistoryTable).values({
            orderId: row.orderId,
            fromStatus: orderRow.status,
            toStatus: "canceled",
            changedByUserId: userId,
            note: `Cancellation request #${row.id} approved`,
          });
        }
      }
      return { kind: "updated" as const, row: row ?? null };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "already") {
      res
        .status(409)
        .json({ error: `Already ${result.status}` });
      return;
    }
    const updated = result.row;
    if (!updated) {
      res.status(500).json({ error: "Update failed" });
      return;
    }
    await recordAudit(req, {
      action: "cancellation_request.review",
      entityType: "cancellation_request",
      entityId: updated.id,
      changes: { decision: body.data.decision },
    });
    await recordHistory(req, {
      entityType: "cancellation_request",
      entityId: updated.id,
      changeType: "update",
      snapshot: updated,
      notes: `${body.data.decision}${body.data.reviewNote ? `: ${body.data.reviewNote}` : ""}`,
    });
    const [reviewer] = updated.reviewedByUserId
      ? await db
          .select({ email: usersTable.email })
          .from(usersTable)
          .where(eq(usersTable.id, updated.reviewedByUserId))
          .limit(1)
      : [];
    const [orderRow] = await db
      .select({ orderNumber: ordersTable.orderNumber })
      .from(ordersTable)
      .where(eq(ordersTable.id, updated.orderId))
      .limit(1);
    res.json({
      id: updated.id,
      orderId: updated.orderId,
      orderNumber: orderRow?.orderNumber ?? null,
      requestedByUserId: updated.requestedByUserId,
      requestedByEmail: null,
      reason: updated.reason,
      status: updated.status,
      reviewedByUserId: updated.reviewedByUserId,
      reviewedByEmail: reviewer?.email ?? null,
      reviewedAt: updated.reviewedAt ? updated.reviewedAt.toISOString() : null,
      reviewNote: updated.reviewNote,
      refundAmount:
        updated.refundAmount === null ? null : Number(updated.refundAmount),
      createdAt: updated.createdAt.toISOString(),
    });
  },
);

// ──────────────────────────────────────────────────────────────────────────
// Create order (used by Agent New Order builder)
// ──────────────────────────────────────────────────────────────────────────

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${ts}-${rand}`;
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

// Restock invariants enforced at the schema level so generated clients and
// route logic agree: an internal restock has no customer/addresses and every
// line item must reference a real product (so we can group by manufacturer).
const AdminCreateOrderBodyChecked = AdminCreateOrderBody.superRefine(
  (data, ctx) => {
    if (!data.isInternalRestock) return;
    if (data.customerId != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customerId"],
        message: "Inventory restock orders cannot be tied to a customer",
      });
    }
    if (data.shippingAddressId != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["shippingAddressId"],
        message: "Inventory restock orders do not accept a shipping address",
      });
    }
    if (data.billingAddressId != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["billingAddressId"],
        message: "Inventory restock orders do not accept a billing address",
      });
    }
    data.items.forEach((it, i) => {
      if (it.productId == null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["items", i, "productId"],
          message: "Each restock line must reference a product",
        });
      }
    });
  },
);

router.post(
  "/admin/orders",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateOrderBodyChecked.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    const isInternalRestock = data.isInternalRestock ?? false;
    const isQuickOrder = isInternalRestock ? false : (data.isQuickOrder ?? false);
    const skipVendorOrder = isInternalRestock
      ? false
      : (data.skipVendorOrder ?? false);

    if (skipVendorOrder && !isQuickOrder) {
      res.status(400).json({
        error: "skipVendorOrder is only allowed on quick orders",
      });
      return;
    }

    // Drop-ship guard: when staff unchecks "ship to store" the order must
    // have a real shipping address so the PO Ship-To block can be filled
    // with the customer's address. Restocks always ship to store. Staff may
    // either pick a saved address (shippingAddressId) OR enter a one-off
    // address (customShippingAddress) which we'll persist as a new addresses
    // row attached to the order's customer.
    const shipToStore = isInternalRestock ? true : (data.shipToStore ?? true);
    if (
      !shipToStore &&
      data.shippingAddressId == null &&
      data.customShippingAddress == null
    ) {
      res.status(400).json({
        error:
          "Direct-ship orders (ship to store unchecked) require either a saved shippingAddressId or a customShippingAddress",
      });
      return;
    }
    if (data.customShippingAddress != null && data.shippingAddressId != null) {
      res.status(400).json({
        error:
          "Provide either shippingAddressId or customShippingAddress, not both",
      });
      return;
    }
    if (data.customShippingAddress != null && shipToStore) {
      res.status(400).json({
        error:
          "customShippingAddress is only valid when shipToStore is false",
      });
      return;
    }
    if (data.customShippingAddress != null && isQuickOrder) {
      res.status(400).json({
        error:
          "Quick / walk-in orders cannot use customShippingAddress — direct ship is not supported for quick orders",
      });
      return;
    }
    if (data.customShippingAddress != null && isInternalRestock) {
      res.status(400).json({
        error: "Inventory restock orders cannot use customShippingAddress",
      });
      return;
    }

    if (isInternalRestock) {
      if (data.customerId != null) {
        res.status(400).json({
          error: "Inventory restock orders cannot be tied to a customer",
        });
        return;
      }
      if (data.shippingAddressId != null || data.billingAddressId != null) {
        res.status(400).json({
          error: "Inventory restock orders do not accept shipping or billing addresses",
        });
        return;
      }
      // Restock orders are internal — no per-line manual pricing required.
      // Every item must reference a real product so we can group by manufacturer.
      for (const it of data.items) {
        if (it.productId == null) {
          res.status(400).json({
            error: "Each restock line must reference a product",
          });
          return;
        }
      }
    }

    let customer: { id: number } | null = null;
    if (data.customerId != null) {
      const [row] = await db
        .select()
        .from(customersTable)
        .where(eq(customersTable.id, data.customerId))
        .limit(1);
      if (!row) {
        res.status(400).json({ error: "Customer not found" });
        return;
      }
      customer = row;
    } else if (!isQuickOrder && !isInternalRestock) {
      res.status(400).json({
        error: "customerId is required unless isQuickOrder is true",
      });
      return;
    }

    if (data.shippingAddressId != null) {
      if (!customer) {
        res.status(400).json({
          error: "Cannot attach an address to a quick order without a customer",
        });
        return;
      }
      const [a] = await db
        .select()
        .from(addressesTable)
        .where(
          and(
            eq(addressesTable.id, data.shippingAddressId),
            eq(addressesTable.customerId, customer.id),
          ),
        )
        .limit(1);
      if (!a) {
        res
          .status(400)
          .json({ error: "Shipping address does not belong to customer" });
        return;
      }
    }
    if (data.customShippingAddress != null && !customer) {
      res.status(400).json({
        error:
          "A one-off direct-ship address requires a customer (existing or new). Quick orders cannot use customShippingAddress.",
      });
      return;
    }
    if (data.billingAddressId != null) {
      if (!customer) {
        res.status(400).json({
          error: "Cannot attach an address to a quick order without a customer",
        });
        return;
      }
      const [a] = await db
        .select()
        .from(addressesTable)
        .where(
          and(
            eq(addressesTable.id, data.billingAddressId),
            eq(addressesTable.customerId, customer.id),
          ),
        )
        .limit(1);
      if (!a) {
        res
          .status(400)
          .json({ error: "Billing address does not belong to customer" });
        return;
      }
    }

    if (data.items.length === 0) {
      res.status(400).json({ error: "Order must have at least one item" });
      return;
    }

    try {
      const txResult = await db.transaction(async (tx) => {
        // If staff entered a one-off direct-ship address, persist it as a
        // new addresses row attached to the order's customer so the receipt
        // and vendor PO Ship-To resolve through the same join path as
        // saved addresses.
        let resolvedShippingAddressId: number | null =
          data.shippingAddressId ?? null;
        if (data.customShippingAddress != null && customer) {
          const c = data.customShippingAddress;
          const [addr] = await tx
            .insert(addressesTable)
            .values({
              customerId: customer.id,
              type: "shipping",
              recipientName: c.recipientName?.trim() || null,
              street1: c.street1.trim(),
              street2: c.street2?.trim() || null,
              city: c.city.trim(),
              state: c.state.trim().toUpperCase(),
              zip: c.zip.trim(),
              country: (c.country?.trim() || "US").toUpperCase(),
              phone: c.phone?.trim() || null,
              isDefault: false,
            })
            .returning();
          if (!addr) throw new Error("Custom shipping address insert failed");
          resolvedShippingAddressId = addr.id;
        }

        let subtotal = 0;
        const prepared: Array<{
          productId: number | null;
          variantId: number | null;
          fabricId: number | null;
          productSkuSnapshot: string | null;
          variantSkuSnapshot: string | null;
          variantNameSnapshot: string | null;
          fabricItemNumberSnapshot: string | null;
          fabricNameSnapshot: string | null;
          description: string;
          quantity: number;
          unitPrice: string;
          amount: string;
          discountAmount: string;
          discountReason: string | null;
          notes: string | null;
        }> = [];

        for (const it of data.items) {
          let productSku: string | null = null;
          let variantSku: string | null = null;
          let variantName: string | null = null;
          let fabricItem: string | null = null;
          let fabricName: string | null = null;

          if (it.productId != null) {
            const [p] = await tx
              .select({ sku: productsTable.sku })
              .from(productsTable)
              .where(eq(productsTable.id, it.productId))
              .limit(1);
            if (!p)
              throw new Error(`Product ${it.productId} not found`);
            productSku = p.sku;
          }
          if (it.variantId != null) {
            const [v] = await tx
              .select({
                sku: productVariantsTable.variantSku,
                name: productVariantsTable.variantName,
                productId: productVariantsTable.productId,
              })
              .from(productVariantsTable)
              .where(eq(productVariantsTable.id, it.variantId))
              .limit(1);
            if (!v) throw new Error(`Variant ${it.variantId} not found`);
            if (it.productId != null && v.productId !== it.productId)
              throw new Error("Variant does not belong to product");
            variantSku = v.sku;
            variantName = v.name;
          }
          if (it.fabricId != null) {
            const [f] = await tx
              .select({
                itemNumber: fabricsTable.itemNumber,
                name: fabricsTable.name,
              })
              .from(fabricsTable)
              .where(eq(fabricsTable.id, it.fabricId))
              .limit(1);
            if (!f) throw new Error(`Fabric ${it.fabricId} not found`);
            fabricItem = f.itemNumber;
            fabricName = f.name;
          }

          const lineAmount = it.quantity * it.unitPrice;
          const discount = it.discountAmount ?? 0;
          subtotal += lineAmount - discount;

          prepared.push({
            productId: it.productId ?? null,
            variantId: it.variantId ?? null,
            fabricId: it.fabricId ?? null,
            productSkuSnapshot: productSku,
            variantSkuSnapshot: variantSku,
            variantNameSnapshot: variantName,
            fabricItemNumberSnapshot: fabricItem,
            fabricNameSnapshot: fabricName,
            description: it.description,
            quantity: it.quantity,
            unitPrice: money(it.unitPrice),
            amount: money(lineAmount),
            discountAmount: money(discount),
            discountReason: it.discountReason ?? null,
            notes: it.notes ?? null,
          });
        }

        // Restock orders are zero-priced internal records — pricing/tax/
        // delivery/deposit fields are forced to zero regardless of payload.
        const taxRate = isInternalRestock ? 0 : (data.taxRate ?? 0);
        const effectiveSubtotal = isInternalRestock ? 0 : subtotal;
        const taxAmount = effectiveSubtotal * taxRate;
        const deliveryAmount = isInternalRestock ? 0 : (data.deliveryAmount ?? 0);
        const total = effectiveSubtotal + taxAmount + deliveryAmount;
        const deposit = isInternalRestock ? 0 : (data.depositAmount ?? 0);
        const balanceDue = total - deposit;

        const status = data.status ?? "pending";
        const [order] = await tx
          .insert(ordersTable)
          .values({
            orderNumber: generateOrderNumber(),
            customerId: data.customerId ?? null,
            createdByAgentId: req.user?.id ?? null,
            orderType: data.orderType ?? "in_store",
            status,
            subtotal: money(effectiveSubtotal),
            taxAmount: money(taxAmount),
            deliveryAmount: money(deliveryAmount),
            total: money(total),
            depositAmount: money(deposit),
            balanceDue: money(balanceDue),
            shippingAddressId: resolvedShippingAddressId,
            billingAddressId: data.billingAddressId ?? null,
            shippingMethod: data.shippingMethod ?? null,
            salespersonName: data.salespersonName ?? null,
            specialInstructions: data.specialInstructions ?? null,
            notes: data.notes ?? null,
            isQuickOrder,
            skipVendorOrder,
            walkInName: data.walkInName?.trim() || null,
            walkInEmail: data.walkInEmail?.trim().toLowerCase() || null,
            walkInPhone: data.walkInPhone?.trim() || null,
            isInternalRestock,
            shipToStore,
          })
          .returning();
        if (!order) throw new Error("Order insert returned no row");

        // For restock orders we wipe pricing-related fields on each line
        // (unitPrice/amount/discount stay at zero in the snapshot).
        const itemValues = prepared.map((p) => ({
          ...p,
          unitPrice: isInternalRestock ? money(0) : p.unitPrice,
          amount: isInternalRestock ? money(0) : p.amount,
          discountAmount: isInternalRestock ? money(0) : p.discountAmount,
          discountReason: isInternalRestock ? null : p.discountReason,
          orderId: order.id,
        }));
        const insertedItems = await tx
          .insert(orderItemsTable)
          .values(itemValues)
          .returning();

        await tx.insert(orderStatusHistoryTable).values({
          orderId: order.id,
          fromStatus: null,
          toStatus: status,
          changedByUserId: req.user?.id ?? null,
          note: "Order created",
        });

        // Auto-create pending vendor POs for every customer order. Restock
        // orders MUST produce vendor POs (that's their entire purpose) so we
        // throw if any line has no manufacturer. Regular orders skip silently
        // when a line can't be grouped (no productId / no manufacturer / quick
        // order with skipVendorOrder=true). Helper is shared with /checkout.
        let createdVendorOrderIds: number[] = [];
        const shouldAutoGen = !skipVendorOrder;
        if (shouldAutoGen) {
          if (isInternalRestock) {
            // Pre-validate every line has a manufacturer before delegating —
            // matches the historical "every restock line must have one" rule.
            const productIds = Array.from(
              new Set(
                insertedItems
                  .map((it) => it.productId)
                  .filter((id): id is number => id != null),
              ),
            );
            const prods = productIds.length
              ? await tx
                  .select({
                    id: productsTable.id,
                    manufacturerId: productsTable.manufacturerId,
                  })
                  .from(productsTable)
                  .where(inArray(productsTable.id, productIds))
              : [];
            const mfgByProductId = new Map(
              prods.map((p) => [p.id, p.manufacturerId]),
            );
            for (const it of insertedItems) {
              if (it.productId == null) continue;
              const mfg = mfgByProductId.get(it.productId);
              if (mfg == null) {
                throw new Error(
                  `Product ${it.productId} has no manufacturer assigned — cannot create restock vendor order`,
                );
              }
            }
          }
          const result = await autoGenerateVendorOrders(
            tx,
            order.id,
            req.user?.id ?? null,
            data.notes ?? null,
          );
          createdVendorOrderIds = result.createdVendorOrderIds;
        }

        return { id: order.id, createdVendorOrderIds };
      });

      const { id: orderId, createdVendorOrderIds } = txResult;

      await recordAudit(req, {
        action: isInternalRestock ? "order.create_restock" : "order.create",
        entityType: "order",
        entityId: orderId,
        changes: {
          itemCount: data.items.length,
          isInternalRestock,
          vendorOrderIds: createdVendorOrderIds,
        },
      });

      const [createdRow] = await db
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId));
      const createdItems = await db
        .select()
        .from(orderItemsTable)
        .where(eq(orderItemsTable.orderId, orderId));
      await recordHistory(req, {
        entityType: "order",
        entityId: orderId,
        changeType: "create",
        snapshot: { ...(createdRow ?? { id: orderId }), items: createdItems },
      });

      const detail = await loadOrderDetail(orderId);
      if (!detail) {
        res.status(500).json({ error: "Order created but could not be loaded" });
        return;
      }
      res.status(201).json(detail);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create order";
      res.status(400).json({ error: msg });
    }
  },
);

export default router;
