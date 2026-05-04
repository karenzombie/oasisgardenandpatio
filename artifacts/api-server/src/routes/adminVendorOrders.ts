import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import {
  db,
  vendorOrdersTable,
  vendorOrderSendsTable,
  ordersTable,
  orderItemsTable,
  manufacturersTable,
  productsTable,
  customersTable,
  usersTable,
  inventoryReceiptsTable,
  inventoryAdjustmentsTable,
  inventoryLocationsTable,
  inventoryTable,
  type VendorOrder,
  type OrderItem,
} from "@workspace/db";
import {
  AdminListVendorOrdersQueryParams,
  AdminGetVendorOrderParams,
  AdminUpdateVendorOrderParams,
  AdminUpdateVendorOrderBody,
  AdminDeleteVendorOrderParams,
  AdminGenerateVendorOrdersParams,
  AdminGenerateVendorOrdersBody,
  AdminSendVendorOrderParams,
  AdminSendVendorOrderBody,
  AdminUpdateVendorOrderStatusParams,
  AdminUpdateVendorOrderStatusBody,
  AdminReceiveVendorOrderParams,
  AdminReceiveVendorOrderBody,
  AdminCancelVendorOrderParams,
  AdminCancelVendorOrderBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordAudit } from "../lib/audit";
import { recordHistory } from "../lib/history";
import { sendVendorOrderEmail } from "../lib/vendorOrderEmail";

const router: IRouter = Router();
const DEFAULT_LIMIT = 50;

// Vendor order status machine:
//   pending -> sent -> acknowledged -> fulfilled -> received (terminal)
//   any non-received -> canceled (terminal)
// /status only handles acknowledged + fulfilled. Sending is via /send,
// receiving via /receive, and cancellation via /cancel — each has bespoke
// side effects (timestamps, sends row, inventory_receipts, item un-assign).
const ALLOWED_STATUS_TRANSITIONS: Record<string, Set<string>> = {
  pending: new Set(["sent", "canceled"]),
  sent: new Set(["acknowledged", "fulfilled", "received", "canceled"]),
  acknowledged: new Set(["fulfilled", "received", "canceled"]),
  fulfilled: new Set(["received", "canceled"]),
  received: new Set(),
  canceled: new Set(),
};
const TERMINAL_STATUSES = new Set(["received", "canceled"]);

function nameOf(first: string | null, last: string | null): string | null {
  const v = [first, last].filter(Boolean).join(" ").trim();
  return v.length === 0 ? null : v;
}

function itemToPayload(it: OrderItem) {
  return {
    id: it.id,
    productId: it.productId,
    productSkuSnapshot: it.productSkuSnapshot,
    variantSkuSnapshot: it.variantSkuSnapshot,
    variantNameSnapshot: it.variantNameSnapshot,
    fabricNameSnapshot: it.fabricNameSnapshot,
    description: it.description,
    quantity: it.quantity,
    unitPrice: Number(it.unitPrice),
    amount: Number(it.amount),
    notes: it.notes,
  };
}

// VO numbers share the customer-order numbering style: VO-YYYY-NNNNN, scoped by year.
// We take a transaction-scoped advisory lock keyed on (a constant tag, year) so
// concurrent generate calls serialize through the SELECT max + INSERT without
// risking duplicate numbers.
const VO_NUMBER_LOCK_TAG = 0x564f; // 'VO'
export async function nextVendorOrderNumber(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
): Promise<string> {
  const year = new Date().getUTCFullYear();
  await tx.execute(sql`SELECT pg_advisory_xact_lock(${VO_NUMBER_LOCK_TAG}, ${year})`);
  const prefix = `VO-${year}-`;
  const [row] = await tx
    .select({
      max: sql<string | null>`max(${vendorOrdersTable.vendorOrderNumber})`,
    })
    .from(vendorOrdersTable)
    .where(ilike(vendorOrdersTable.vendorOrderNumber, `${prefix}%`));
  const last = row?.max ?? null;
  let next = 1;
  if (last) {
    const m = last.match(/^VO-\d{4}-(\d+)$/);
    if (m && m[1]) next = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${String(next).padStart(5, "0")}`;
}

router.get(
  "/admin/vendor-orders",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminListVendorOrdersQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const { bucket, status, manufacturerId, customerOrderId, q, limit, offset } =
      parsed.data;
    const conditions: Array<ReturnType<typeof eq>> = [];
    if (status) conditions.push(eq(vendorOrdersTable.status, status));
    if (manufacturerId !== undefined)
      conditions.push(eq(vendorOrdersTable.manufacturerId, manufacturerId));
    if (customerOrderId !== undefined)
      conditions.push(eq(vendorOrdersTable.customerOrderId, customerOrderId));
    if (bucket === "needs_action") {
      conditions.push(eq(vendorOrdersTable.status, "pending"));
    } else if (bucket === "sent") {
      conditions.push(sql`${vendorOrdersTable.status} <> 'pending'`);
    }
    if (q && q.trim()) {
      const needle = `%${q.trim()}%`;
      const orExpr = or(
        ilike(vendorOrdersTable.vendorOrderNumber, needle),
        ilike(ordersTable.orderNumber, needle),
      );
      if (orExpr) conditions.push(orExpr);
    }
    const whereExpr = conditions.length ? and(...conditions) : undefined;
    const cap = Math.min(limit ?? DEFAULT_LIMIT, 200);
    const off = offset ?? 0;

    const rows = await db
      .select({
        vo: vendorOrdersTable,
        mfg: manufacturersTable,
        order: ordersTable,
        itemCount: sql<number>`(
          SELECT count(*)::int
          FROM ${orderItemsTable}
          WHERE ${orderItemsTable.vendorOrderId} = ${vendorOrdersTable.id}
        )`,
      })
      .from(vendorOrdersTable)
      .leftJoin(
        manufacturersTable,
        eq(manufacturersTable.id, vendorOrdersTable.manufacturerId),
      )
      .leftJoin(ordersTable, eq(ordersTable.id, vendorOrdersTable.customerOrderId))
      .where(whereExpr)
      .orderBy(desc(vendorOrdersTable.createdAt))
      .limit(cap)
      .offset(off);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(vendorOrdersTable)
      .leftJoin(ordersTable, eq(ordersTable.id, vendorOrdersTable.customerOrderId))
      .where(whereExpr);

    res.json({
      rows: rows.map((r) => ({
        id: r.vo.id,
        vendorOrderNumber: r.vo.vendorOrderNumber,
        status: r.vo.status,
        manufacturerId: r.vo.manufacturerId,
        manufacturerName: r.mfg?.name ?? null,
        customerOrderId: r.vo.customerOrderId,
        customerOrderNumber: r.order?.orderNumber ?? null,
        notes: r.vo.notes,
        vendorEstimatedDeliveryDate: r.vo.vendorEstimatedDeliveryDate
          ? r.vo.vendorEstimatedDeliveryDate.toISOString()
          : null,
        sentAt: r.vo.sentAt ? r.vo.sentAt.toISOString() : null,
        acknowledgedAt: r.vo.acknowledgedAt
          ? r.vo.acknowledgedAt.toISOString()
          : null,
        fulfilledAt: r.vo.fulfilledAt ? r.vo.fulfilledAt.toISOString() : null,
        receivedAt: r.vo.receivedAt ? r.vo.receivedAt.toISOString() : null,
        itemsReceived: r.vo.itemsReceived,
        itemCount: r.itemCount,
        createdAt: r.vo.createdAt.toISOString(),
      })),
      total: countRow?.count ?? 0,
    });
  },
);

async function loadVendorOrderDetail(id: number) {
  const [row] = await db
    .select({
      vo: vendorOrdersTable,
      mfg: manufacturersTable,
      order: ordersTable,
      customer: customersTable,
      creator: usersTable,
    })
    .from(vendorOrdersTable)
    .leftJoin(
      manufacturersTable,
      eq(manufacturersTable.id, vendorOrdersTable.manufacturerId),
    )
    .leftJoin(ordersTable, eq(ordersTable.id, vendorOrdersTable.customerOrderId))
    .leftJoin(customersTable, eq(customersTable.id, ordersTable.customerId))
    .leftJoin(usersTable, eq(usersTable.id, vendorOrdersTable.createdByUserId))
    .where(eq(vendorOrdersTable.id, id))
    .limit(1);
  if (!row) return null;
  const { vo, mfg, order, customer, creator } = row;

  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.vendorOrderId, id))
    .orderBy(asc(orderItemsTable.id));

  const sends = await db
    .select({ s: vendorOrderSendsTable, sender: usersTable })
    .from(vendorOrderSendsTable)
    .leftJoin(usersTable, eq(usersTable.id, vendorOrderSendsTable.sentByUserId))
    .where(eq(vendorOrderSendsTable.vendorOrderId, id))
    .orderBy(desc(vendorOrderSendsTable.sentAt));

  const [receiver] = vo.receivedByUserId
    ? await db
        .select({ email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, vo.receivedByUserId))
        .limit(1)
    : [];

  return {
    id: vo.id,
    vendorOrderNumber: vo.vendorOrderNumber,
    status: vo.status,
    notes: vo.notes,
    vendorEstimatedDeliveryDate: vo.vendorEstimatedDeliveryDate
      ? vo.vendorEstimatedDeliveryDate.toISOString()
      : null,
    sentAt: vo.sentAt ? vo.sentAt.toISOString() : null,
    acknowledgedAt: vo.acknowledgedAt
      ? vo.acknowledgedAt.toISOString()
      : null,
    fulfilledAt: vo.fulfilledAt ? vo.fulfilledAt.toISOString() : null,
    receivedAt: vo.receivedAt ? vo.receivedAt.toISOString() : null,
    receivedByUserId: vo.receivedByUserId,
    receivedByEmail: receiver?.email ?? null,
    itemsReceived: vo.itemsReceived,
    createdByUserId: vo.createdByUserId,
    createdByEmail: creator?.email ?? null,
    createdAt: vo.createdAt.toISOString(),
    updatedAt: vo.updatedAt.toISOString(),
    manufacturerId: vo.manufacturerId,
    manufacturerName: mfg?.name ?? null,
    manufacturerOrderEmail: mfg?.orderEmail ?? null,
    customerOrderId: vo.customerOrderId,
    customerOrderNumber: order?.orderNumber ?? null,
    customerOrderStatus: order?.status ?? null,
    customerName: customer
      ? nameOf(customer.firstName, customer.lastName)
      : null,
    items: items.map(itemToPayload),
    sends: sends.map((row) => ({
      id: row.s.id,
      sentByUserId: row.s.sentByUserId,
      sentByEmail: row.sender?.email ?? null,
      sentAt: row.s.sentAt.toISOString(),
      sentToEmail: row.s.sentToEmail,
      isResend: row.s.isResend,
      resendNote: row.s.resendNote,
      pdfStorageUrl: row.s.pdfStorageUrl,
    })),
  };
}

router.get(
  "/admin/vendor-orders/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const detail = await loadVendorOrderDetail(params.data.id);
    if (!detail) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(detail);
  },
);

router.patch(
  "/admin/vendor-orders/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateVendorOrderBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const updates: Partial<VendorOrder> = {};
    if (body.data.notes !== undefined)
      updates.notes = body.data.notes ?? null;
    if (body.data.vendorEstimatedDeliveryDate !== undefined) {
      updates.vendorEstimatedDeliveryDate = body.data.vendorEstimatedDeliveryDate
        ? new Date(body.data.vendorEstimatedDeliveryDate)
        : null;
    }
    if (Object.keys(updates).length === 0) {
      const detail = await loadVendorOrderDetail(params.data.id);
      if (!detail) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json(detail);
      return;
    }
    const [row] = await db
      .update(vendorOrdersTable)
      .set(updates)
      .where(eq(vendorOrdersTable.id, params.data.id))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    await recordAudit(req, {
      action: "vendor_order.update",
      entityType: "vendor_order",
      entityId: row.id,
      changes: updates,
    });
    await recordHistory(req, {
      entityType: "vendor_order",
      entityId: row.id,
      changeType: "update",
      snapshot: row,
    });
    const detail = await loadVendorOrderDetail(row.id);
    res.json(detail);
  },
);

router.delete(
  "/admin/vendor-orders/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminDeleteVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "not_found" as const };
      if (existing.status !== "pending") {
        return { kind: "not_pending" as const, status: existing.status };
      }
      // Un-assign items, then delete.
      const unassigned = await tx
        .update(orderItemsTable)
        .set({ vendorOrderId: null })
        .where(eq(orderItemsTable.vendorOrderId, existing.id))
        .returning({ id: orderItemsTable.id });
      await tx
        .delete(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, existing.id));
      return {
        kind: "deleted" as const,
        id: existing.id,
        vendorOrderNumber: existing.vendorOrderNumber,
        customerOrderId: existing.customerOrderId,
        unassignedItemCount: unassigned.length,
      };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "not_pending") {
      res.status(409).json({
        error: `Cannot delete vendor order in status '${result.status}' — cancel it instead`,
      });
      return;
    }
    await recordAudit(req, {
      action: "vendor_order.delete",
      entityType: "vendor_order",
      entityId: result.id,
      changes: {
        vendorOrderNumber: result.vendorOrderNumber,
        customerOrderId: result.customerOrderId,
        unassignedItemCount: result.unassignedItemCount,
      },
    });
    await recordHistory(req, {
      entityType: "vendor_order",
      entityId: result.id,
      changeType: "delete",
      snapshot: {
        id: result.id,
        vendorOrderNumber: result.vendorOrderNumber,
        customerOrderId: result.customerOrderId,
        unassignedItemCount: result.unassignedItemCount,
      },
    });
    res.status(204).end();
  },
);

router.post(
  "/admin/orders/:orderId/vendor-orders/generate",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGenerateVendorOrdersParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid orderId" });
      return;
    }
    const body = AdminGenerateVendorOrdersBody.safeParse(req.body ?? {});
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const userId = req.session?.userId ?? null;
    const orderId = params.data.orderId;

    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .for("update")
        .limit(1);
      if (!order) return { kind: "not_found" as const };
      // Don't generate vendor orders for orders that are no longer live.
      if (order.status === "canceled" || order.status === "refunded") {
        return {
          kind: "bad_state" as const,
          status: order.status,
        };
      }
      // Quick in-stock sales are flagged to skip vendor restock orders.
      if (order.skipVendorOrder) {
        return { kind: "skipped" as const };
      }

      // Pull all unassigned items joined to product so we can read the
      // manufacturer. Items without a productId or whose product has no
      // manufacturer are skipped (counted in skippedItemCount).
      const candidates = await tx
        .select({
          item: orderItemsTable,
          manufacturerId: productsTable.manufacturerId,
        })
        .from(orderItemsTable)
        .leftJoin(
          productsTable,
          eq(productsTable.id, orderItemsTable.productId),
        )
        .where(
          and(
            eq(orderItemsTable.orderId, orderId),
            isNull(orderItemsTable.vendorOrderId),
          ),
        );

      const groups = new Map<number, number[]>();
      let skipped = 0;
      for (const c of candidates) {
        if (c.manufacturerId == null) {
          skipped += 1;
          continue;
        }
        const arr = groups.get(c.manufacturerId) ?? [];
        arr.push(c.item.id);
        groups.set(c.manufacturerId, arr);
      }

      const createdSummaries: Array<{
        id: number;
        manufacturerId: number;
        itemCount: number;
      }> = [];
      let assigned = 0;
      for (const [manufacturerId, itemIds] of groups) {
        const number = await nextVendorOrderNumber(tx);
        const [vo] = await tx
          .insert(vendorOrdersTable)
          .values({
            vendorOrderNumber: number,
            customerOrderId: orderId,
            manufacturerId,
            status: "pending",
            notes: body.data.notes ?? null,
            createdByUserId: userId,
          })
          .returning();
        if (!vo) continue;
        await tx
          .update(orderItemsTable)
          .set({ vendorOrderId: vo.id })
          .where(inArray(orderItemsTable.id, itemIds));
        createdSummaries.push({
          id: vo.id,
          manufacturerId,
          itemCount: itemIds.length,
        });
        assigned += itemIds.length;
      }

      return {
        kind: "ok" as const,
        createdSummaries,
        skipped,
        assigned,
      };
    });

    if (result.kind === "not_found") {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (result.kind === "bad_state") {
      res.status(409).json({
        error: `Cannot generate vendor orders for an order in status '${result.status}'`,
      });
      return;
    }
    if (result.kind === "skipped") {
      res.status(409).json({
        error:
          "This order is flagged to skip vendor restock orders (in-stock sale).",
      });
      return;
    }

    // Re-read the just-created vendor orders with manufacturer + customer order
    // info so the response matches AdminVendorOrderSummary exactly.
    const created = result.createdSummaries.length
      ? await db
          .select({
            vo: vendorOrdersTable,
            mfg: manufacturersTable,
            order: ordersTable,
          })
          .from(vendorOrdersTable)
          .leftJoin(
            manufacturersTable,
            eq(manufacturersTable.id, vendorOrdersTable.manufacturerId),
          )
          .leftJoin(
            ordersTable,
            eq(ordersTable.id, vendorOrdersTable.customerOrderId),
          )
          .where(
            inArray(
              vendorOrdersTable.id,
              result.createdSummaries.map((s) => s.id),
            ),
          )
          .orderBy(asc(vendorOrdersTable.id))
      : [];
    const itemCountById = new Map(
      result.createdSummaries.map((s) => [s.id, s.itemCount]),
    );

    if (result.createdSummaries.length > 0) {
      await recordAudit(req, {
        action: "vendor_order.generate",
        entityType: "order",
        entityId: orderId,
        changes: {
          createdIds: result.createdSummaries.map((s) => s.id),
          assignedItemCount: result.assigned,
          skippedItemCount: result.skipped,
        },
      });
    }

    res.json({
      created: created.map((r) => ({
        id: r.vo.id,
        vendorOrderNumber: r.vo.vendorOrderNumber,
        status: r.vo.status,
        manufacturerId: r.vo.manufacturerId,
        manufacturerName: r.mfg?.name ?? null,
        customerOrderId: r.vo.customerOrderId,
        customerOrderNumber: r.order?.orderNumber ?? null,
        notes: r.vo.notes,
        vendorEstimatedDeliveryDate: r.vo.vendorEstimatedDeliveryDate
          ? r.vo.vendorEstimatedDeliveryDate.toISOString()
          : null,
        sentAt: r.vo.sentAt ? r.vo.sentAt.toISOString() : null,
        acknowledgedAt: r.vo.acknowledgedAt
          ? r.vo.acknowledgedAt.toISOString()
          : null,
        fulfilledAt: r.vo.fulfilledAt ? r.vo.fulfilledAt.toISOString() : null,
        receivedAt: r.vo.receivedAt ? r.vo.receivedAt.toISOString() : null,
        itemsReceived: r.vo.itemsReceived,
        itemCount: itemCountById.get(r.vo.id) ?? 0,
        createdAt: r.vo.createdAt.toISOString(),
      })),
      skippedItemCount: result.skipped,
      assignedItemCount: result.assigned,
    });
  },
);

router.post(
  "/admin/vendor-orders/:id/send",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminSendVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminSendVendorOrderBody.safeParse(req.body ?? {});
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const userId = req.session?.userId ?? null;
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "not_found" as const };
      if (TERMINAL_STATUSES.has(existing.status)) {
        return {
          kind: "terminal" as const,
          status: existing.status,
        };
      }
      const isResend = existing.sentAt !== null;
      const updates: Partial<VendorOrder> = {};
      if (existing.status === "pending") updates.status = "sent";
      if (!existing.sentAt) updates.sentAt = new Date();
      if (Object.keys(updates).length > 0) {
        await tx
          .update(vendorOrdersTable)
          .set(updates)
          .where(eq(vendorOrdersTable.id, existing.id));
      }
      await tx.insert(vendorOrderSendsTable).values({
        vendorOrderId: existing.id,
        sentByUserId: userId,
        sentToEmail: body.data.sentToEmail ?? null,
        pdfStorageUrl: body.data.pdfStorageUrl ?? null,
        isResend,
        resendNote: isResend ? (body.data.resendNote ?? null) : null,
      });
      return { kind: "ok" as const, isResend };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "terminal") {
      res.status(400).json({
        error: `Cannot send a vendor order in status '${result.status}'`,
      });
      return;
    }
    await recordAudit(req, {
      action: result.isResend ? "vendor_order.resend" : "vendor_order.send",
      entityType: "vendor_order",
      entityId: params.data.id,
      changes: { sentToEmail: body.data.sentToEmail ?? null },
    });
    const [voRow] = await db
      .select()
      .from(vendorOrdersTable)
      .where(eq(vendorOrdersTable.id, params.data.id));
    if (voRow) {
      await recordHistory(req, {
        entityType: "vendor_order",
        entityId: params.data.id,
        changeType: "update",
        snapshot: voRow,
        notes: result.isResend ? "resent" : "sent",
      });
    }
    const detail = await loadVendorOrderDetail(params.data.id);

    // Resolve the destination email: explicit override from the request body,
    // or fall back to the manufacturer's configured order email.
    const toEmail =
      body.data.sentToEmail?.trim() || detail?.manufacturerOrderEmail || null;

    if (toEmail && detail) {
      try {
        await sendVendorOrderEmail({
          to: toEmail,
          vendorOrderNumber: detail.vendorOrderNumber,
          customerOrderNumber: detail.customerOrderNumber,
          manufacturerName: detail.manufacturerName,
          notes: detail.notes,
          items: detail.items,
        });
        req.log.info(
          { vendorOrderId: params.data.id, to: toEmail },
          "Vendor order email sent",
        );
      } catch (err) {
        // Log but do not fail the request — the send has already been
        // recorded in the DB and status updated. A Resend outage should
        // not roll back the recorded state.
        req.log.error(
          { err, vendorOrderId: params.data.id, to: toEmail },
          "Failed to send vendor order email",
        );
      }
    } else if (!toEmail) {
      req.log.warn(
        { vendorOrderId: params.data.id },
        "Vendor order send recorded but no email address available — set an order email on the manufacturer or enter one in the send dialog",
      );
    }

    res.json(detail);
  },
);

router.post(
  "/admin/vendor-orders/:id/status",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateVendorOrderStatusParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateVendorOrderStatusBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "not_found" as const };
      const allowed = ALLOWED_STATUS_TRANSITIONS[existing.status];
      if (!allowed || !allowed.has(body.data.toStatus)) {
        return {
          kind: "invalid_transition" as const,
          from: existing.status,
          to: body.data.toStatus,
        };
      }
      const updates: Partial<VendorOrder> = { status: body.data.toStatus };
      if (body.data.toStatus === "acknowledged" && !existing.acknowledgedAt) {
        updates.acknowledgedAt = new Date();
      }
      if (body.data.toStatus === "fulfilled" && !existing.fulfilledAt) {
        updates.fulfilledAt = new Date();
      }
      await tx
        .update(vendorOrdersTable)
        .set(updates)
        .where(eq(vendorOrdersTable.id, existing.id));
      return { kind: "ok" as const };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "invalid_transition") {
      res.status(409).json({
        error: `Cannot transition vendor order from '${result.from}' to '${result.to}'`,
      });
      return;
    }
    await recordAudit(req, {
      action: "vendor_order.status_change",
      entityType: "vendor_order",
      entityId: params.data.id,
      changes: { toStatus: body.data.toStatus, note: body.data.note ?? null },
    });
    const [voRow] = await db
      .select()
      .from(vendorOrdersTable)
      .where(eq(vendorOrdersTable.id, params.data.id));
    if (voRow) {
      await recordHistory(req, {
        entityType: "vendor_order",
        entityId: params.data.id,
        changeType: "update",
        snapshot: voRow,
        notes: `status → ${body.data.toStatus}${body.data.note ? `: ${body.data.note}` : ""}`,
      });
    }
    const detail = await loadVendorOrderDetail(params.data.id);
    res.json(detail);
  },
);

router.post(
  "/admin/vendor-orders/:id/receive",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminReceiveVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminReceiveVendorOrderBody.safeParse(req.body ?? {});
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const userId = req.session?.userId ?? null;
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "not_found" as const };
      if (existing.status === "received") {
        return { kind: "noop" as const };
      }
      if (existing.status === "canceled" || existing.status === "pending") {
        return {
          kind: "invalid" as const,
          status: existing.status,
        };
      }

      // Decide whether to bump on-hand inventory. Only restock vendor orders
      // (where the linked customer order is flagged is_internal_restock) put
      // physical stock into our warehouse. Customer orders are direct-ship —
      // the goods never touch our shelves, so receiving the vendor's
      // confirmation MUST NOT inflate on-hand counts.
      let isRestock = false;
      let restockLocationId: number | null = null;
      if (existing.customerOrderId != null) {
        const [parent] = await tx
          .select({ isInternalRestock: ordersTable.isInternalRestock })
          .from(ordersTable)
          .where(eq(ordersTable.id, existing.customerOrderId));
        isRestock = parent?.isInternalRestock === true;
      }
      if (isRestock) {
        const [defaultLoc] = await tx
          .select({ id: inventoryLocationsTable.id })
          .from(inventoryLocationsTable)
          .where(eq(inventoryLocationsTable.isDefault, true));
        if (!defaultLoc) {
          return { kind: "no_default_location" as const };
        }
        restockLocationId = defaultLoc.id;
      }

      const now = new Date();
      await tx
        .update(vendorOrdersTable)
        .set({
          status: "received",
          itemsReceived: true,
          receivedAt: now,
          receivedByUserId: userId,
        })
        .where(eq(vendorOrdersTable.id, existing.id));
      await tx.insert(inventoryReceiptsTable).values({
        vendorOrderId: existing.id,
        receivedByUserId: userId,
        linkedOrderId: existing.customerOrderId,
        locationId: restockLocationId,
        notes: body.data.notes ?? null,
      });

      if (isRestock) {
        // Walk the line items linked to this vendor order and bump on-hand
        // per (productId, variantId, fabricId). Each line gets its own audit
        // row tagged 'vendor_receipt' for traceability.
        const lines = await tx
          .select({
            productId: orderItemsTable.productId,
            variantId: orderItemsTable.variantId,
            fabricId: orderItemsTable.fabricId,
            quantity: orderItemsTable.quantity,
          })
          .from(orderItemsTable)
          .where(eq(orderItemsTable.vendorOrderId, existing.id));

        for (const line of lines) {
          if (line.productId == null || line.quantity <= 0) continue;
          const pid = line.productId;
          const vid = line.variantId;
          const fid = line.fabricId;

          // Get-or-create the inventory row for this exact SKU. NULLS NOT
          // DISTINCT means (pid, NULL, NULL) collides with itself, so flat
          // products don't proliferate rows.
          const variantCond = vid == null
            ? isNull(inventoryTable.variantId)
            : eq(inventoryTable.variantId, vid);
          const fabricCond = fid == null
            ? isNull(inventoryTable.fabricId)
            : eq(inventoryTable.fabricId, fid);
          let [inv] = await tx
            .select()
            .from(inventoryTable)
            .where(
              and(
                eq(inventoryTable.productId, pid),
                variantCond,
                fabricCond,
              ),
            )
            .for("update");
          if (!inv) {
            const [created] = await tx
              .insert(inventoryTable)
              .values({
                productId: pid,
                variantId: vid,
                fabricId: fid,
                onHand: 0,
                onHold: 0,
                reorderThreshold: 0,
              })
              .returning();
            const [locked] = await tx
              .select()
              .from(inventoryTable)
              .where(eq(inventoryTable.id, created!.id))
              .for("update");
            inv = locked!;
          }

          const newOnHand = inv.onHand + line.quantity;
          await tx
            .update(inventoryTable)
            .set({ onHand: newOnHand })
            .where(eq(inventoryTable.id, inv.id));

          await tx.insert(inventoryAdjustmentsTable).values({
            productId: pid,
            variantId: vid,
            fabricId: fid,
            inventoryId: inv.id,
            locationId: restockLocationId,
            adjustmentType: "vendor_receipt",
            quantityChange: line.quantity,
            quantityAfter: newOnHand,
            vendorOrderId: existing.id,
            orderId: existing.customerOrderId,
            performedByUserId: userId,
          });
        }
      }

      return { kind: "received" as const, isRestock };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "invalid") {
      res.status(409).json({
        error: `Cannot mark a '${result.status}' vendor order as received — send it first`,
      });
      return;
    }
    if (result.kind === "no_default_location") {
      res.status(400).json({
        error:
          "Cannot receive restock: no default inventory location is configured. Set one in Inventory → Locations.",
      });
      return;
    }
    if (result.kind === "received") {
      await recordAudit(req, {
        action: "vendor_order.receive",
        entityType: "vendor_order",
        entityId: params.data.id,
        changes: { notes: body.data.notes ?? null },
      });
      const [voRow] = await db
        .select()
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, params.data.id));
      if (voRow) {
        await recordHistory(req, {
          entityType: "vendor_order",
          entityId: params.data.id,
          changeType: "update",
          snapshot: voRow,
          notes: `received${body.data.notes ? `: ${body.data.notes}` : ""}`,
        });
      }
    }
    const detail = await loadVendorOrderDetail(params.data.id);
    res.json(detail);
  },
);

router.post(
  "/admin/vendor-orders/:id/cancel",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminCancelVendorOrderParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminCancelVendorOrderBody.safeParse(req.body ?? {});
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, params.data.id))
        .for("update")
        .limit(1);
      if (!existing) return { kind: "not_found" as const };
      if (existing.status === "canceled") return { kind: "noop" as const };
      if (existing.status === "received") {
        return { kind: "received" as const };
      }
      await tx
        .update(vendorOrdersTable)
        .set({ status: "canceled" })
        .where(eq(vendorOrdersTable.id, existing.id));
      // Un-assign the items so they can be regrouped into a fresh VO.
      await tx
        .update(orderItemsTable)
        .set({ vendorOrderId: null })
        .where(eq(orderItemsTable.vendorOrderId, existing.id));
      return { kind: "canceled" as const };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    if (result.kind === "received") {
      res
        .status(409)
        .json({ error: "Cannot cancel a received vendor order" });
      return;
    }
    if (result.kind === "canceled") {
      await recordAudit(req, {
        action: "vendor_order.cancel",
        entityType: "vendor_order",
        entityId: params.data.id,
        changes: { note: body.data.note ?? null },
      });
      const [voRow] = await db
        .select()
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.id, params.data.id));
      if (voRow) {
        await recordHistory(req, {
          entityType: "vendor_order",
          entityId: params.data.id,
          changeType: "update",
          snapshot: voRow,
          notes: `canceled${body.data.note ? `: ${body.data.note}` : ""}`,
        });
      }
    }
    const detail = await loadVendorOrderDetail(params.data.id);
    res.json(detail);
  },
);

export default router;
