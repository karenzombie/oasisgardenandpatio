import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  customersTable,
  usersTable,
  orderItemsTable,
} from "@workspace/db";
import { AdminListLocalDeliveriesQueryParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();
const DEFAULT_LIMIT = 50;

function nameOf(first: string | null, last: string | null): string | null {
  const v = [first, last].filter(Boolean).join(" ").trim();
  return v.length === 0 ? null : v;
}

const LOCAL_DELIVERY_STATUSES = [
  "ready_for_store_delivery",
  "out_for_local_delivery",
] as const;

router.get(
  "/admin/deliveries/local",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminListLocalDeliveriesQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const { filter, limit, offset } = parsed.data;
    const cap = Math.min(limit ?? DEFAULT_LIMIT, 200);
    const off = offset ?? 0;

    const conditions = [
      inArray(ordersTable.status, LOCAL_DELIVERY_STATUSES),
      eq(ordersTable.isInternalRestock, false),
    ];
    if (filter === "unscheduled") {
      conditions.push(sql`${ordersTable.scheduledDeliveryDate} IS NULL`);
    }
    const whereExpr = and(...conditions);

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
      .orderBy(
        sql`${ordersTable.scheduledDeliveryDate} ASC NULLS LAST`,
        sql`${ordersTable.scheduledDeliveryTime} ASC NULLS LAST`,
      )
      .limit(cap)
      .offset(off);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(ordersTable)
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
        scheduledDeliveryDate: r.order.scheduledDeliveryDate,
        scheduledDeliveryTime: r.order.scheduledDeliveryTime,
      })),
      total: countRow?.count ?? 0,
    });
  },
);

export default router;
