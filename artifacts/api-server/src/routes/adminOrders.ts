import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { and, asc, desc, eq, ilike, isNull, or, sql, inArray } from "drizzle-orm";
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
  inventoryTable,
  inventoryAdjustmentsTable,
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
  AdminUpdateOrderItemFabricVendorParams,
  AdminUpdateOrderItemFabricVendorBody,
  AdminRefundOrderParams,
  AdminRefundOrderBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordAudit } from "../lib/audit";
import { recordHistory } from "../lib/history";
import { loadOrderShipments } from "./adminOrderShipments";
import { loadOrderPayments } from "./adminOrderPayments";
import { autoGenerateVendorOrders } from "../lib/autoGenerateVendorOrders";
import { sendOrderStatusEmail, sendOrderRefundEmail } from "../lib/orderStatusEmail";
import { processAuthnetRefund } from "../lib/authorizeNet";
import {
  generateCustomerOrderPdf,
  type PdfCustomerOrderItem,
  type PdfCustomerOrderPayment,
} from "../lib/customerOrderPdf";
import { logger } from "../lib/logger";

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

function itemToPayload(
  it: OrderItem,
  fabricVendorName: string | null = null,
) {
  return {
    id: it.id,
    productId: it.productId,
    productSkuSnapshot: it.productSkuSnapshot,
    variantSkuSnapshot: it.variantSkuSnapshot,
    variantNameSnapshot: it.variantNameSnapshot,
    fabricId: it.fabricId,
    fabricNameSnapshot: it.fabricNameSnapshot,
    fabricVendorId: it.fabricVendorId,
    fabricVendorName,
    fabricVendorOrderId: it.fabricVendorOrderId,
    department: it.department,
    description: it.description,
    quantity: it.quantity,
    unitPrice: Number(it.unitPrice),
    amount: Number(it.amount),
    discountAmount: Number(it.discountAmount),
    discountReason: it.discountReason,
    notes: it.notes,
    vendorOrderId: it.vendorOrderId,
    useInventory: it.useInventory,
    inventoryQtyUsed: it.inventoryQtyUsed,
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

  // Resolve fabric-vendor display names in a single round-trip so the
  // staff order detail can show "Fabric vendor: Acme" inline. Items
  // without an alternate fabric vendor map to null.
  const fabricVendorIds = Array.from(
    new Set(
      items
        .map((it) => it.fabricVendorId)
        .filter((id): id is number => id !== null),
    ),
  );
  const fabricVendors = fabricVendorIds.length
    ? await db
        .select({
          id: manufacturersTable.id,
          name: manufacturersTable.name,
        })
        .from(manufacturersTable)
        .where(inArray(manufacturersTable.id, fabricVendorIds))
    : [];
  const fabricVendorNameById = new Map(
    fabricVendors.map((m) => [m.id, m.name]),
  );

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
    items: items.map((it) =>
      itemToPayload(
        it,
        it.fabricVendorId == null
          ? null
          : (fabricVendorNameById.get(it.fabricVendorId) ?? null),
      ),
    ),
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

// ──────────────────────────────────────────────────────────────────────────
// Inventory deduction on delivery
// ──────────────────────────────────────────────────────────────────────────

async function deductInventoryForDelivery(
  orderId: number,
  userId: number | null,
): Promise<void> {
  const items = await db
    .select()
    .from(orderItemsTable)
    .where(
      and(
        eq(orderItemsTable.orderId, orderId),
        eq(orderItemsTable.useInventory, true),
        sql`${orderItemsTable.inventoryQtyUsed} > 0`,
      ),
    );

  for (const item of items) {
    if (!item.productId) continue;
    await db.transaction(async (tx) => {
      const variantCond =
        item.variantId != null
          ? eq(inventoryTable.variantId, item.variantId)
          : isNull(inventoryTable.variantId);
      const fabricCond =
        item.fabricId != null
          ? eq(inventoryTable.fabricId, item.fabricId)
          : isNull(inventoryTable.fabricId);
      const [inv] = await tx
        .select()
        .from(inventoryTable)
        .where(
          and(
            eq(inventoryTable.productId, item.productId!),
            variantCond,
            fabricCond,
          ),
        )
        .for("update")
        .limit(1);
      if (!inv) return;
      const deduct = Math.min(item.inventoryQtyUsed, inv.onHand);
      if (deduct <= 0) return;
      const newOnHand = inv.onHand - deduct;
      await tx
        .update(inventoryTable)
        .set({ onHand: newOnHand })
        .where(eq(inventoryTable.id, inv.id));
      await tx.insert(inventoryAdjustmentsTable).values({
        productId: item.productId!,
        variantId: item.variantId,
        fabricId: item.fabricId,
        inventoryId: inv.id,
        adjustmentType: "sold",
        quantityChange: -deduct,
        quantityAfter: newOnHand,
        orderId,
        performedByUserId: userId,
        reason: `Delivered from store inventory (order item ${item.id})`,
      });
    });
  }
}

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
      if (body.data.toStatus === "delivered") {
        try {
          await deductInventoryForDelivery(orderId, req.session?.userId ?? null);
        } catch (err) {
          logger.error({ err, orderId }, "inventory deduction on delivery failed");
        }
      }
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
  "/admin/orders/:id/refund",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminRefundOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminRefundOrderBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }

    const { grossRefundAmount, restockingFeeType, restockingFeeValue, note } =
      body.data;

    // Compute restocking fee and net refund.
    let restockingFee = 0;
    if (restockingFeeType === "flat" && restockingFeeValue != null) {
      restockingFee = Math.min(restockingFeeValue, grossRefundAmount);
    } else if (restockingFeeType === "percent" && restockingFeeValue != null) {
      restockingFee = (grossRefundAmount * restockingFeeValue) / 100;
    }
    const netRefundAmount = Math.max(0, grossRefundAmount - restockingFee);

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
      if (
        req.user?.role === "agent" &&
        existing.createdByAgentId !== req.user.id
      ) {
        return { kind: "not_found" as const };
      }
      if (existing.status === "refunded") {
        return { kind: "noop" as const };
      }
      // Only block if already completed — canceled orders can be refunded.
      if (existing.status === "completed") {
        return { kind: "terminal" as const, fromStatus: existing.status };
      }
      const [row] = await tx
        .update(ordersTable)
        .set({ status: "refunded" })
        .where(eq(ordersTable.id, orderId))
        .returning();
      await tx.insert(orderStatusHistoryTable).values({
        orderId,
        fromStatus: existing.status,
        toStatus: "refunded",
        changedByUserId: userId,
        note: note ?? null,
      });
      return {
        kind: "updated" as const,
        row: row ?? null,
        fromStatus: existing.status,
        orderType: existing.orderType,
      };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "terminal") {
      res.status(409).json({
        error: `Cannot refund an order already in '${result.fromStatus}' status`,
      });
      return;
    }

    // For online orders with a card transaction on file, attempt the gateway
    // refund. Failure is logged but does NOT roll back the status change —
    // the staff member will see the warning and can handle it manually.
    let authnetWarning: string | null = null;
    if (
      result.kind === "updated" &&
      result.orderType === "online" &&
      netRefundAmount > 0
    ) {
      const payments = await loadOrderPayments(orderId);
      const cardPayment = payments.find(
        (p) =>
          p.transactionId &&
          (p.paymentMethod === "credit_card" ||
            p.paymentMethod === "debit_card"),
      );
      if (cardPayment?.transactionId && cardPayment.cardLast4) {
        const authnetResult = await processAuthnetRefund({
          originalTransactionId: cardPayment.transactionId,
          cardLast4: cardPayment.cardLast4,
          amount: netRefundAmount,
        });
        if (!authnetResult.success) {
          authnetWarning = authnetResult.notConfigured
            ? "Authorize.net not configured — process refund manually in the gateway."
            : `Gateway refund failed: ${authnetResult.errorMessage ?? "Unknown error"}. Process refund manually.`;
        }
      }
    }

    await recordAudit(req, {
      action: "order.refund",
      entityType: "order",
      entityId: orderId,
      changes: {
        grossRefundAmount,
        restockingFeeType: restockingFeeType ?? null,
        restockingFeeValue: restockingFeeValue ?? null,
        netRefundAmount,
        note: note ?? null,
      },
    });
    if (result.kind === "updated" && result.row) {
      await recordHistory(req, {
        entityType: "order",
        entityId: orderId,
        changeType: "update",
        snapshot: result.row,
        notes: `status → refunded (gross: $${grossRefundAmount.toFixed(2)}, fee: $${restockingFee.toFixed(2)}, net: $${netRefundAmount.toFixed(2)})`,
      });
    }

    // Fire customer refund email — intentionally not awaited.
    void sendOrderRefundEmail(orderId, {
      grossRefundAmount,
      restockingFee: restockingFee > 0 ? restockingFee : null,
      restockingFeeType: restockingFeeType ?? null,
      netRefundAmount,
    }).catch(() => {});

    const detail = await loadOrderDetail(orderId);
    if (!detail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Attach gateway warning to the response so the UI can surface it.
    res.json({ ...detail, _authnetWarning: authnetWarning });
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
          fabricVendorId: number | null;
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
          useInventory: boolean;
          inventoryQtyUsed: number;
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
          // An alternate fabric vendor only makes sense when the line has a
          // fabric. If supplied, validate the manufacturer exists so we
          // don't silently store a dangling FK and fail later in PO
          // generation.
          if (it.fabricVendorId != null) {
            if (it.fabricId == null) {
              throw new Error(
                "fabricVendorId requires fabricId on the same line",
              );
            }
            const [m] = await tx
              .select({ id: manufacturersTable.id })
              .from(manufacturersTable)
              .where(eq(manufacturersTable.id, it.fabricVendorId))
              .limit(1);
            if (!m)
              throw new Error(
                `Fabric vendor ${it.fabricVendorId} not found`,
              );
          }

          const lineAmount = it.quantity * it.unitPrice;
          const discount = it.discountAmount ?? 0;
          subtotal += lineAmount - discount;

          // For lines marked "use inventory", look up current on-hand and
          // reserve as many units as possible from the store's stock.
          // The actual inventory deduction happens on delivery; here we
          // only record how many units were promised from store stock so
          // the vendor order (created after this loop) knows the balance.
          let inventoryQtyUsed = 0;
          const wantsInventory =
            (it.useInventory ?? false) && !isInternalRestock;
          if (wantsInventory && it.productId != null) {
            const ivCond = and(
              eq(inventoryTable.productId, it.productId),
              it.variantId != null
                ? eq(inventoryTable.variantId, it.variantId)
                : isNull(inventoryTable.variantId),
              it.fabricId != null
                ? eq(inventoryTable.fabricId, it.fabricId)
                : isNull(inventoryTable.fabricId),
            );
            const [inv] = await tx
              .select({ onHand: inventoryTable.onHand })
              .from(inventoryTable)
              .where(ivCond)
              .for("update")
              .limit(1);
            if (inv && inv.onHand > 0) {
              inventoryQtyUsed = Math.min(it.quantity, inv.onHand);
            }
          }

          prepared.push({
            productId: it.productId ?? null,
            variantId: it.variantId ?? null,
            fabricId: it.fabricId ?? null,
            fabricVendorId: it.fabricVendorId ?? null,
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
            useInventory: wantsInventory,
            inventoryQtyUsed,
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

// ────────────────────────────────────────────────────────────────────
// Per-line alternate fabric-vendor assignment.
//
// Lets staff designate a different manufacturer to source the fabric
// from than the product's own vendor. The handler clears any existing
// product-PO and fabric-PO links on the line, then re-runs
// `autoGenerateVendorOrders` so the regrouped POs are created in the
// same `pending` state as a fresh order.
//
// Hard precondition: every PO currently referenced from this line
// (product or fabric) must still be `pending`. Once a PO has been sent,
// regrouping silently behind it would corrupt the vendor's view of
// what they're being asked to ship.
// ────────────────────────────────────────────────────────────────────
router.patch(
  "/admin/orders/:orderId/items/:itemId/fabric-vendor",
  requireAuth,
  requireRole("admin"),
  async (req, res) => {
    const params = AdminUpdateOrderItemFabricVendorParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid params" });
      return;
    }
    const body = AdminUpdateOrderItemFabricVendorBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }

    const { orderId, itemId } = params.data;
    const { fabricVendorId } = body.data;

    type RegroupResult =
      | { kind: "ok" }
      | { kind: "not_found" }
      | { kind: "no_fabric" }
      | { kind: "vendor_not_found" }
      | { kind: "po_not_pending" };

    try {
      const result: RegroupResult = await db.transaction(async (tx) => {
        // Lock the order_item row first so a concurrent
        // send-vendor-order or another regroup can't mutate the linked
        // PO ids between our status check and our update.
        const [item] = await tx
          .select()
          .from(orderItemsTable)
          .where(
            and(
              eq(orderItemsTable.id, itemId),
              eq(orderItemsTable.orderId, orderId),
            ),
          )
          .for("update")
          .limit(1);
        if (!item) return { kind: "not_found" };

        if (fabricVendorId != null) {
          if (item.fabricId == null) return { kind: "no_fabric" };
          const [m] = await tx
            .select({ id: manufacturersTable.id })
            .from(manufacturersTable)
            .where(eq(manufacturersTable.id, fabricVendorId))
            .limit(1);
          if (!m) return { kind: "vendor_not_found" };
        }

        // Lock and re-check the status of every PO this line currently
        // belongs to. Locking guarantees a parallel "send PO" can't
        // flip status between our check and our regroup.
        const linkedPoIds = [
          item.vendorOrderId,
          item.fabricVendorOrderId,
        ].filter((id): id is number => id !== null);
        if (linkedPoIds.length > 0) {
          const linkedPos = await tx
            .select({
              id: vendorOrdersTable.id,
              status: vendorOrdersTable.status,
            })
            .from(vendorOrdersTable)
            .where(inArray(vendorOrdersTable.id, linkedPoIds))
            .for("update");
          for (const po of linkedPos) {
            if (po.status !== "pending") return { kind: "po_not_pending" };
          }
        }

        await tx
          .update(orderItemsTable)
          .set({
            fabricVendorId: fabricVendorId,
            // Clear PO links so autoGenerateVendorOrders treats this
            // line as fresh and groups it under the new vendor.
            vendorOrderId: null,
            fabricVendorOrderId: null,
          })
          .where(eq(orderItemsTable.id, itemId));

        // Garbage-collect any pending PO that is now empty (every
        // line was either reassigned away or cancelled). Without
        // this, stale empty pending POs would clutter the vendor list.
        for (const poId of linkedPoIds) {
          const remainingProduct = await tx
            .select({ id: orderItemsTable.id })
            .from(orderItemsTable)
            .where(eq(orderItemsTable.vendorOrderId, poId))
            .limit(1);
          const remainingFabric = await tx
            .select({ id: orderItemsTable.id })
            .from(orderItemsTable)
            .where(eq(orderItemsTable.fabricVendorOrderId, poId))
            .limit(1);
          if (remainingProduct.length === 0 && remainingFabric.length === 0) {
            await tx
              .delete(vendorOrdersTable)
              .where(eq(vendorOrdersTable.id, poId));
          }
        }

        await autoGenerateVendorOrders(
          tx,
          orderId,
          req.session?.userId ?? null,
        );
        return { kind: "ok" };
      });

      if (result.kind === "not_found") {
        res.status(404).json({ error: "Order item not found" });
        return;
      }
      if (result.kind === "no_fabric") {
        res.status(400).json({
          error: "Cannot set a fabric vendor on a line without a fabric",
        });
        return;
      }
      if (result.kind === "vendor_not_found") {
        res.status(400).json({ error: "Fabric vendor not found" });
        return;
      }
      if (result.kind === "po_not_pending") {
        res.status(409).json({
          error:
            "Cannot reassign fabric vendor: a related vendor order has already been sent. Cancel or void it first.",
        });
        return;
      }

      await recordAudit(req, {
        action: "order_item.fabric_vendor.updated",
        entityType: "order_item",
        entityId: itemId,
        changes: { orderId, fabricVendorId },
      });

      const detail = await loadOrderDetail(orderId);
      if (!detail) {
        res.status(404).json({ error: "Order not found" });
        return;
      }
      res.json(detail);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Failed to update fabric vendor";
      res.status(500).json({ error: msg });
    }
  },
);

// ────────────────────────────────────────────────────────────────────
// Printable customer order receipt (Customer Copy / Store Copy).
// Both copies are produced by the same renderer; the only difference is
// the footer label. There's no print-count limit — agents may reprint
// either copy at any time from the order detail screen, including after
// recording new partial payments (the PDF re-reads the latest payments
// each time).
// ────────────────────────────────────────────────────────────────────
const PdfQuery = z.object({
  copy: z.enum(["customer", "store", "delivery"]).optional(),
});

router.get(
  "/admin/orders/:id/pdf",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const query = PdfQuery.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const copy = query.data.copy ?? "customer";
    const orderId = params.data.id;

    // Pull base order + items + addresses + customer.
    const [orderRow] = await db
      .select({
        order: ordersTable,
        customer: customersTable,
      })
      .from(ordersTable)
      .leftJoin(customersTable, eq(customersTable.id, ordersTable.customerId))
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    if (!orderRow) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    // Agents are scoped to orders they created — same rule as the rest
    // of the admin order endpoints.
    if (
      req.user?.role === "agent" &&
      orderRow.order.createdByAgentId !== req.user.id
    ) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    const o = orderRow.order;

    const [shippingAddr, billingAddr, items, vos, payments] = await Promise.all(
      [
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
        db
          .select()
          .from(orderItemsTable)
          .where(eq(orderItemsTable.orderId, orderId))
          .orderBy(asc(orderItemsTable.id)),
        db
          .select({ vo: vendorOrdersTable, mfg: manufacturersTable })
          .from(vendorOrdersTable)
          .leftJoin(
            manufacturersTable,
            eq(manufacturersTable.id, vendorOrdersTable.manufacturerId),
          )
          .where(eq(vendorOrdersTable.customerOrderId, orderId)),
        loadOrderPayments(orderId),
      ],
    );

    // Items can also be linked to a vendor (manufacturer) directly via
    // products → manufacturer, even when no vendor PO has been generated
    // yet. Fall back to that mapping so the customer copy always shows a
    // vendor when one is known.
    const productIds = Array.from(
      new Set(
        items
          .map((it) => it.productId)
          .filter((v): v is number => typeof v === "number"),
      ),
    );
    const productMfg = productIds.length
      ? await db
          .select({
            productId: productsTable.id,
            manufacturerName: manufacturersTable.name,
          })
          .from(productsTable)
          .leftJoin(
            manufacturersTable,
            eq(manufacturersTable.id, productsTable.manufacturerId),
          )
          .where(inArray(productsTable.id, productIds))
      : [];
    const productVendorById = new Map<number, string | null>();
    for (const row of productMfg) {
      productVendorById.set(row.productId, row.manufacturerName);
    }

    const vendorByVoId = new Map<number, string | null>();
    for (const v of vos) {
      vendorByVoId.set(v.vo.id, v.mfg?.name ?? null);
    }

    const pdfItems: PdfCustomerOrderItem[] = items.map((it) => ({
      department: it.department,
      description: it.description,
      variantNameSnapshot: it.variantNameSnapshot,
      fabricNameSnapshot: it.fabricNameSnapshot,
      productSkuSnapshot: it.productSkuSnapshot,
      variantSkuSnapshot: it.variantSkuSnapshot,
      quantity: it.quantity,
      unitPrice: Number(it.unitPrice),
      amount: Number(it.amount),
      vendorName:
        (it.vendorOrderId != null
          ? (vendorByVoId.get(it.vendorOrderId) ?? null)
          : null) ??
        (it.productId != null
          ? (productVendorById.get(it.productId) ?? null)
          : null),
    }));

    const pdfPayments: PdfCustomerOrderPayment[] = payments.map((p) => ({
      receivedAt: p.receivedAt,
      paymentMethod: p.paymentMethod,
      status: p.status,
      amount: p.amount,
      cardLast4: p.cardLast4,
      cardType: p.cardType,
      transactionId: p.transactionId,
    }));

    // Customer info: prefer the linked customer record; fall back to
    // walk-in fields captured on the order itself for in-store orders
    // without a customer row.
    const fullName = orderRow.customer
      ? nameOf(orderRow.customer.firstName, orderRow.customer.lastName)
      : (o.walkInName?.trim() || null);
    const phone =
      orderRow.customer?.phone ??
      shippingAddr?.phone ??
      billingAddr?.phone ??
      o.walkInPhone ??
      null;
    const addrSrc = shippingAddr ?? billingAddr ?? null;

    try {
      const buf = await generateCustomerOrderPdf({
        orderNumber: o.orderNumber,
        placedAt: o.placedAt.toISOString(),
        salespersonName: o.salespersonName,
        customerName: fullName,
        customerPhone: phone,
        customerAddress: addrSrc
          ? {
              street1: addrSrc.street1,
              street2: addrSrc.street2,
              city: addrSrc.city,
              state: addrSrc.state,
              zip: addrSrc.zip,
            }
          : null,
        items: pdfItems,
        subtotal: Number(o.subtotal),
        taxAmount: Number(o.taxAmount),
        deliveryAmount: Number(o.deliveryAmount),
        total: Number(o.total),
        depositAmount: Number(o.depositAmount),
        balanceDue: Number(o.balanceDue),
        specialInstructions: o.specialInstructions,
        payments: pdfPayments,
        merchandiseReceived: o.merchandiseReceived,
        copy,
      });
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${o.orderNumber}-${copy}.pdf"`,
      );
      // Don't let the browser cache stale copies — payments / status can
      // change between prints and the agent must always see the latest.
      res.setHeader("Cache-Control", "no-store");
      res.end(buf);
    } catch (err) {
      logger.error(
        { err, orderId, copy },
        "Customer order PDF render failed",
      );
      res.status(500).json({ error: "Failed to render PDF" });
    }
  },
);

export default router;
