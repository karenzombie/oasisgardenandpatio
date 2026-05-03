import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  paymentsTable,
  usersTable,
  type Payment,
} from "@workspace/db";
import {
  AdminListOrderPaymentsParams,
  AdminCreateOrderPaymentParams,
  AdminCreateOrderPaymentBody,
  AdminUpdateOrderPaymentParams,
  AdminUpdateOrderPaymentBody,
  AdminDeleteOrderPaymentParams,
  AdminMarkOrderPaidInFullParams,
  AdminMarkOrderPaidInFullBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordHistory } from "../lib/history";

const router: IRouter = Router();

const ALLOWED_PAYMENT_STATUSES = new Set([
  "completed",
  "pending",
  "refunded",
  "failed",
  "voided",
]);

const ALLOWED_PAYMENT_METHODS = new Set([
  "cash",
  "check",
  "credit_card",
  "debit_card",
  "ach",
  "wire",
  "financing",
  "store_credit",
  "gift_card",
  "other",
]);

function nullify(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  return t.length === 0 ? null : t;
}

function money(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

function paymentToPayload(p: Payment, recordedByEmail: string | null) {
  return {
    id: p.id,
    orderId: p.orderId,
    amount: Number(p.amount),
    paymentMethod: p.paymentMethod,
    status: p.status,
    transactionId: p.transactionId,
    cardLast4: p.cardLast4,
    cardType: p.cardType,
    notes: p.notes,
    receivedAt: p.receivedAt ? p.receivedAt.toISOString() : null,
    recordedByUserId: p.recordedByUserId,
    recordedByEmail,
    createdAt: p.createdAt.toISOString(),
  };
}

export async function loadOrderPayments(orderId: number) {
  const rows = await db
    .select({ p: paymentsTable, u: usersTable })
    .from(paymentsTable)
    .leftJoin(usersTable, eq(usersTable.id, paymentsTable.recordedByUserId))
    .where(eq(paymentsTable.orderId, orderId))
    .orderBy(asc(paymentsTable.createdAt));
  return rows.map((r) => paymentToPayload(r.p, r.u?.email ?? null));
}

function validateCardLast4(v: string | null | undefined): string | null {
  if (v == null) return null;
  const t = v.trim();
  if (t.length === 0) return null;
  if (!/^\d{4}$/.test(t)) {
    return "Card last 4 must be exactly 4 digits";
  }
  return null;
}

function validatePaymentInput(input: {
  amount: number;
  paymentMethod: string;
  status: string;
  cardLast4?: string | null;
}): string | null {
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return "Amount must be greater than zero";
  }
  if (Math.round(input.amount * 100) / 100 !== input.amount) {
    if (Math.abs(input.amount * 100 - Math.round(input.amount * 100)) > 0.001) {
      return "Amount may have at most two decimal places";
    }
  }
  if (!ALLOWED_PAYMENT_METHODS.has(input.paymentMethod)) {
    return `Unsupported payment method: ${input.paymentMethod}`;
  }
  if (!ALLOWED_PAYMENT_STATUSES.has(input.status)) {
    return `Unsupported status: ${input.status}`;
  }
  const cardErr = validateCardLast4(input.cardLast4);
  if (cardErr) return cardErr;
  return null;
}

/**
 * Recompute order.depositAmount = sum of payments with status='completed'
 * and balanceDue = total - depositAmount. Runs inside the caller's tx.
 */
async function recomputeOrderTotals(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  orderId: number,
): Promise<{ depositAmount: number; balanceDue: number; total: number }> {
  const [order] = await tx
    .select({ total: ordersTable.total })
    .from(ordersTable)
    .where(eq(ordersTable.id, orderId))
    .for("update")
    .limit(1);
  if (!order) {
    throw new Error("Order not found during totals recompute");
  }
  const [agg] = await tx
    .select({
      paid: sql<string>`coalesce(sum(${paymentsTable.amount}), 0)`,
    })
    .from(paymentsTable)
    .where(
      and(
        eq(paymentsTable.orderId, orderId),
        eq(paymentsTable.status, "completed"),
      ),
    );
  const total = Number(order.total);
  const paid = Number(agg?.paid ?? 0);
  const balance = Math.max(0, Math.round((total - paid) * 100) / 100);
  await tx
    .update(ordersTable)
    .set({ depositAmount: money(paid), balanceDue: money(balance) })
    .where(eq(ordersTable.id, orderId));
  return { depositAmount: paid, balanceDue: balance, total };
}

async function respondWithDetail(
  res: Response,
  orderId: number,
  status: number,
): Promise<void> {
  const { loadOrderDetail } = await import("./adminOrders");
  const detail = await loadOrderDetail(orderId);
  if (!detail) {
    res.status(404).json({ error: "Order not found" });
    return;
  }
  res.status(status).json(detail);
}

router.get(
  "/admin/orders/:id/payments",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminListOrderPaymentsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [order] = await db
      .select({ id: ordersTable.id })
      .from(ordersTable)
      .where(eq(ordersTable.id, params.data.id))
      .limit(1);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    res.json(await loadOrderPayments(params.data.id));
  },
);

router.post(
  "/admin/orders/:id/payments",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminCreateOrderPaymentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminCreateOrderPaymentBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const orderId = params.data.id;
    const status = body.data.status?.trim() || "completed";
    const validationError = validatePaymentInput({
      amount: body.data.amount,
      paymentMethod: body.data.paymentMethod,
      status,
      cardLast4: body.data.cardLast4,
    });
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const userId = req.session?.userId ?? null;
    const created = await db.transaction(async (tx) => {
      const [order] = await tx
        .select({ id: ordersTable.id })
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .for("update")
        .limit(1);
      if (!order) return null;
      const [row] = await tx
        .insert(paymentsTable)
        .values({
          orderId,
          amount: money(body.data.amount),
          paymentMethod: body.data.paymentMethod,
          status,
          transactionId: nullify(body.data.transactionId),
          cardLast4: nullify(body.data.cardLast4),
          cardType: nullify(body.data.cardType),
          notes: nullify(body.data.notes),
          receivedAt: body.data.receivedAt ?? new Date(),
          recordedByUserId: userId,
        })
        .returning();
      if (!row) throw new Error("Insert returned no row");
      await recomputeOrderTotals(tx, orderId);
      return row;
    });
    if (!created) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "order",
      entityId: orderId,
      changeType: "update",
      snapshot: created,
      notes: `payment.create id=${created.id} amount=${money(body.data.amount)} method=${body.data.paymentMethod} status=${status}`,
    });
    await respondWithDetail(res, orderId, 201);
  },
);

router.post(
  "/admin/orders/:id/payments/mark-paid-in-full",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminMarkOrderPaidInFullParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminMarkOrderPaidInFullBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const orderId = params.data.id;
    if (!ALLOWED_PAYMENT_METHODS.has(body.data.paymentMethod)) {
      res
        .status(400)
        .json({ error: `Unsupported payment method: ${body.data.paymentMethod}` });
      return;
    }
    const cardErr = validateCardLast4(body.data.cardLast4);
    if (cardErr) {
      res.status(400).json({ error: cardErr });
      return;
    }
    const userId = req.session?.userId ?? null;
    const result = await db.transaction(async (tx) => {
      const [order] = await tx
        .select({
          id: ordersTable.id,
          total: ordersTable.total,
          balanceDue: ordersTable.balanceDue,
        })
        .from(ordersTable)
        .where(eq(ordersTable.id, orderId))
        .for("update")
        .limit(1);
      if (!order) return { kind: "not_found" as const };
      const balance = Number(order.balanceDue);
      if (balance <= 0) {
        return { kind: "nothing_due" as const };
      }
      const [row] = await tx
        .insert(paymentsTable)
        .values({
          orderId,
          amount: money(balance),
          paymentMethod: body.data.paymentMethod,
          status: "completed",
          transactionId: nullify(body.data.transactionId),
          cardLast4: nullify(body.data.cardLast4),
          cardType: nullify(body.data.cardType),
          notes: nullify(body.data.notes),
          receivedAt: body.data.receivedAt ?? new Date(),
          recordedByUserId: userId,
        })
        .returning();
      if (!row) throw new Error("Insert returned no row");
      await recomputeOrderTotals(tx, orderId);
      return { kind: "ok" as const, payment: row, amount: balance };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (result.kind === "nothing_due") {
      res.status(400).json({ error: "Order has no remaining balance" });
      return;
    }
    await recordHistory(req, {
      entityType: "order",
      entityId: orderId,
      changeType: "update",
      snapshot: result.payment,
      notes: `payment.mark_paid_in_full id=${result.payment.id} amount=${money(result.amount)} method=${body.data.paymentMethod}`,
    });
    await respondWithDetail(res, orderId, 200);
  },
);

router.put(
  "/admin/orders/:id/payments/:paymentId",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateOrderPaymentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateOrderPaymentBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const orderId = params.data.id;
    const paymentId = params.data.paymentId;
    const status = body.data.status?.trim() || "completed";
    const validationError = validatePaymentInput({
      amount: body.data.amount,
      paymentMethod: body.data.paymentMethod,
      status,
      cardLast4: body.data.cardLast4,
    });
    if (validationError) {
      res.status(400).json({ error: validationError });
      return;
    }
    const result = await db.transaction(async (tx) => {
      const [previous] = await tx
        .select()
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.id, paymentId),
            eq(paymentsTable.orderId, orderId),
          ),
        )
        .for("update")
        .limit(1);
      if (!previous) return { kind: "not_found" as const };
      const [updated] = await tx
        .update(paymentsTable)
        .set({
          amount: money(body.data.amount),
          paymentMethod: body.data.paymentMethod,
          status,
          transactionId: nullify(body.data.transactionId),
          cardLast4: nullify(body.data.cardLast4),
          cardType: nullify(body.data.cardType),
          notes: nullify(body.data.notes),
          receivedAt: body.data.receivedAt ?? previous.receivedAt,
        })
        .where(
          and(
            eq(paymentsTable.id, paymentId),
            eq(paymentsTable.orderId, orderId),
          ),
        )
        .returning();
      if (!updated) return { kind: "not_found" as const };
      await recomputeOrderTotals(tx, orderId);
      return { kind: "ok" as const, previous, updated };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "order",
      entityId: orderId,
      changeType: "update",
      snapshot: result.updated,
      previousSnapshot: result.previous,
      notes: `payment.update id=${paymentId}`,
    });
    await respondWithDetail(res, orderId, 200);
  },
);

router.delete(
  "/admin/orders/:id/payments/:paymentId",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminDeleteOrderPaymentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const orderId = params.data.id;
    const paymentId = params.data.paymentId;
    const result = await db.transaction(async (tx) => {
      const [previous] = await tx
        .select()
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.id, paymentId),
            eq(paymentsTable.orderId, orderId),
          ),
        )
        .for("update")
        .limit(1);
      if (!previous) return { kind: "not_found" as const };
      await tx
        .delete(paymentsTable)
        .where(
          and(
            eq(paymentsTable.id, paymentId),
            eq(paymentsTable.orderId, orderId),
          ),
        );
      await recomputeOrderTotals(tx, orderId);
      return { kind: "ok" as const, previous };
    });
    if (result.kind === "not_found") {
      res.status(404).json({ error: "Payment not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "order",
      entityId: orderId,
      changeType: "delete",
      snapshot: result.previous,
      previousSnapshot: result.previous,
      notes: `payment.delete id=${paymentId}`,
    });
    await respondWithDetail(res, orderId, 200);
  },
);

export default router;
