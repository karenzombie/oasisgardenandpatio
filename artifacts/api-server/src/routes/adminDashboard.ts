import { Router, type IRouter, type Request, type Response } from "express";
import { and, countDistinct, eq, gte, notInArray, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  productsTable,
  customersTable,
  vendorOrdersTable,
} from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

const OPEN_ORDER_EXCLUDED = ["completed", "canceled", "refunded"];

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "in_production",
  "ready_for_store_delivery",
  "carrier_delivery_update",
  "out_for_local_delivery",
  "delivered",
  "completed",
  "canceled",
  "refunded",
] as const;

async function loadOrdersByStatus(): Promise<Record<(typeof ORDER_STATUSES)[number], number>> {
  const rows = await db
    .select({ status: ordersTable.status, count: sql<number>`count(*)::int` })
    .from(ordersTable)
    .groupBy(ordersTable.status);

  const counts = Object.fromEntries(
    ORDER_STATUSES.map((status) => [status, 0]),
  ) as Record<(typeof ORDER_STATUSES)[number], number>;

  for (const row of rows) {
    if ((ORDER_STATUSES as readonly string[]).includes(row.status)) {
      counts[row.status as (typeof ORDER_STATUSES)[number]] = row.count;
    }
  }

  return counts;
}

router.get(
  "/admin/dashboard/stats",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const [openOrders, activeProducts, totalCustomers, pendingVendorOrders, ordersByStatus] =
      await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(ordersTable)
          .where(notInArray(ordersTable.status, OPEN_ORDER_EXCLUDED))
          .then((r) => r[0]?.count ?? 0),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(productsTable)
          .where(eq(productsTable.isActive, true))
          .then((r) => r[0]?.count ?? 0),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(customersTable)
          .then((r) => r[0]?.count ?? 0),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(vendorOrdersTable)
          .where(eq(vendorOrdersTable.status, "pending"))
          .then((r) => r[0]?.count ?? 0),
        loadOrdersByStatus(),
      ]);

    res.json({
      openOrders,
      activeProducts,
      totalCustomers,
      pendingVendorOrders,
      ordersByStatus,
    });
  },
);

router.get(
  "/admin/agent/dashboard/stats",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.session?.userId ?? null;
    if (!userId) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }

    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const [myOpenOrders, myOrdersThisWeek, customersHelped] =
      await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.createdByAgentId, userId),
              notInArray(ordersTable.status, OPEN_ORDER_EXCLUDED),
            ),
          )
          .then((r) => r[0]?.count ?? 0),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(ordersTable)
          .where(
            and(
              eq(ordersTable.createdByAgentId, userId),
              gte(ordersTable.createdAt, startOfWeek),
            ),
          )
          .then((r) => r[0]?.count ?? 0),
        db
          .select({ count: countDistinct(ordersTable.customerId) })
          .from(ordersTable)
          .where(eq(ordersTable.createdByAgentId, userId))
          .then((r) => r[0]?.count ?? 0),
      ]);

    res.json({ myOpenOrders, myOrdersThisWeek, customersHelped });
  },
);

export default router;
