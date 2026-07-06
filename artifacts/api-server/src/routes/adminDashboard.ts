import { Router, type IRouter, type Request, type Response } from "express";
import { and, countDistinct, eq, gte, isNull, notInArray, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  productsTable,
  customersTable,
  usersTable,
  vendorOrdersTable,
  wishlistItemsTable,
  wishlistOutreachLogItemsTable,
  shipmentsTable,
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

async function loadNewCustomersLast48h(): Promise<number> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(usersTable)
    .where(and(eq(usersTable.role, "customer"), gte(usersTable.createdAt, cutoff)));
  return row?.count ?? 0;
}

async function loadWishlistItemsNeedingReachOut(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(wishlistItemsTable)
    .innerJoin(
      customersTable,
      eq(customersTable.id, wishlistItemsTable.customerId),
    )
    .leftJoin(
      wishlistOutreachLogItemsTable,
      eq(
        wishlistOutreachLogItemsTable.wishlistItemId,
        wishlistItemsTable.id,
      ),
    )
    .where(
      and(
        eq(customersTable.marketingOptOut, false),
        isNull(wishlistOutreachLogItemsTable.id),
      ),
    );
  return row?.count ?? 0;
}

async function loadReadyNotScheduled(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "ready_for_store_delivery"),
        isNull(ordersTable.scheduledDeliveryDate),
        eq(ordersTable.isInternalRestock, false),
      ),
    );
  return row?.count ?? 0;
}

const LOCAL_DELIVERY_STATUSES = [
  "ready_for_store_delivery",
  "out_for_local_delivery",
] as const;

async function loadLocalDeliveryToday(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(
      and(
        sql`${ordersTable.status} IN ${LOCAL_DELIVERY_STATUSES}`,
        eq(ordersTable.isInternalRestock, false),
        sql`${ordersTable.scheduledDeliveryDate} = CURRENT_DATE`,
      ),
    );
  return row?.count ?? 0;
}

async function loadLocalDeliveriesThisWeek(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(
      and(
        sql`${ordersTable.status} IN ${LOCAL_DELIVERY_STATUSES}`,
        eq(ordersTable.isInternalRestock, false),
        sql`${ordersTable.scheduledDeliveryDate} >= date_trunc('week', CURRENT_DATE)::date`,
        sql`${ordersTable.scheduledDeliveryDate} < (date_trunc('week', CURRENT_DATE) + interval '7 days')::date`,
      ),
    );
  return row?.count ?? 0;
}

async function loadCarrierDeliveryUpdated(): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(ordersTable)
    .where(
      and(
        eq(ordersTable.status, "carrier_delivery_update"),
        sql`EXISTS (
          SELECT 1 FROM ${shipmentsTable} s2
          WHERE s2.order_id = ${ordersTable.id}
            AND s2.tracking_number IS NOT NULL
        )`,
      ),
    );
  return row?.count ?? 0;
}

router.get(
  "/admin/dashboard/stats",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const [
      openOrders,
      activeProducts,
      totalProducts,
      totalCustomers,
      pendingVendorOrders,
      ordersByStatus,
      newCustomersLast48h,
      wishlistItemsNeedingReachOut,
      readyNotScheduled,
      localDeliveryToday,
      localDeliveriesThisWeek,
      carrierDeliveryUpdated,
      sentToVendor,
      acknowledgedByVendor,
    ] = await Promise.all([
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
        .from(productsTable)
        .then((r) => r[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(usersTable)
        .where(eq(usersTable.role, "customer"))
        .then((r) => r[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.status, "pending"))
        .then((r) => r[0]?.count ?? 0),
      loadOrdersByStatus(),
      loadNewCustomersLast48h(),
      loadWishlistItemsNeedingReachOut(),
      loadReadyNotScheduled(),
      loadLocalDeliveryToday(),
      loadLocalDeliveriesThisWeek(),
      loadCarrierDeliveryUpdated(),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.status, "sent"))
        .then((r) => r[0]?.count ?? 0),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(vendorOrdersTable)
        .where(eq(vendorOrdersTable.status, "acknowledged"))
        .then((r) => r[0]?.count ?? 0),
    ]);

    res.json({
      openOrders,
      activeProducts,
      totalProducts,
      totalCustomers,
      pendingVendorOrders,
      ordersByStatus,
      newCustomersLast48h,
      wishlistItemsNeedingReachOut,
      readyNotScheduled,
      localDeliveryToday,
      localDeliveriesThisWeek,
      carrierDeliveryUpdated,
      sentToVendor,
      acknowledgedByVendor,
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
