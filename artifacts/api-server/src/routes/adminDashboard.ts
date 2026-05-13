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

router.get(
  "/admin/dashboard/stats",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const [openOrders, activeProducts, totalCustomers, pendingVendorOrders] =
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
      ]);

    res.json({ openOrders, activeProducts, totalCustomers, pendingVendorOrders });
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
