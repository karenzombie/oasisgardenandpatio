import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  db,
  ordersTable,
  customersTable,
  usersTable,
  orderItemsTable,
  addressesTable,
} from "@workspace/db";
import { AdminListLocalDeliveriesQueryParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { loadOrderPdfArgs } from "./adminOrders";
import {
  generateDeliveryManifestSummaryPdf,
  type DeliveryManifestRow,
} from "../lib/deliveryManifestPdf";
import { generateMergedDeliveryCopiesPdf } from "../lib/customerOrderPdf";
import { deliveryTimeWindowLabel } from "../lib/deliveryTimeWindows";
import { logger } from "../lib/logger";

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

const ManifestQuery = z.object({
  orderIds: z
    .string()
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => Number(s)),
    )
    .refine(
      (arr) => arr.length > 0 && arr.every((n) => Number.isInteger(n) && n > 0),
      { message: "orderIds must be a comma-separated list of positive integers" },
    ),
});

// Loads the orders for a manifest, in Brief 6 Section 3F sort order
// (scheduled date, then scheduled time window, NULLS LAST) — regardless of
// the order the client passed orderIds in, so both manifest documents are
// always consistently sorted.
async function loadManifestOrders(orderIds: number[]) {
  const rows = await db
    .select({
      order: ordersTable,
      customer: customersTable,
      shippingAddress: addressesTable,
    })
    .from(ordersTable)
    .leftJoin(customersTable, eq(customersTable.id, ordersTable.customerId))
    .leftJoin(
      addressesTable,
      eq(addressesTable.id, ordersTable.shippingAddressId),
    )
    .where(inArray(ordersTable.id, orderIds))
    .orderBy(
      sql`${ordersTable.scheduledDeliveryDate} ASC NULLS LAST`,
      sql`${ordersTable.scheduledDeliveryTime} ASC NULLS LAST`,
    );
  return rows;
}

router.get(
  "/admin/deliveries/manifest-summary",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ManifestQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid orderIds" });
      return;
    }
    const rows = await loadManifestOrders(parsed.data.orderIds);
    const manifestRows: DeliveryManifestRow[] = rows.map((r) => ({
      orderNumber: r.order.orderNumber,
      customerName: r.customer
        ? nameOf(r.customer.firstName, r.customer.lastName)
        : (r.order.walkInName?.trim() || null),
      shippingAddress: r.shippingAddress
        ? {
            recipientName: r.shippingAddress.recipientName,
            street1: r.shippingAddress.street1,
            street2: r.shippingAddress.street2,
            city: r.shippingAddress.city,
            state: r.shippingAddress.state,
            zip: r.shippingAddress.zip,
            country: r.shippingAddress.country,
          }
        : null,
      scheduledDeliveryDate: r.order.scheduledDeliveryDate,
      scheduledDeliveryTimeLabel: deliveryTimeWindowLabel(
        r.order.scheduledDeliveryTime,
      ),
      total: Number(r.order.total),
    }));

    try {
      const buf = await generateDeliveryManifestSummaryPdf(manifestRows);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="delivery-manifest-summary.pdf"`,
      );
      res.setHeader("Cache-Control", "no-store");
      res.end(buf);
    } catch (err) {
      logger.error({ err }, "Delivery manifest summary PDF render failed");
      res.status(500).json({ error: "Failed to render PDF" });
    }
  },
);

router.get(
  "/admin/deliveries/manifest-copies",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = ManifestQuery.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid orderIds" });
      return;
    }
    const rows = await loadManifestOrders(parsed.data.orderIds);

    const scopedAgentId =
      req.user?.role === "agent" ? req.user.id : undefined;
    const argsList = [];
    for (const r of rows) {
      const args = await loadOrderPdfArgs(r.order.id, "delivery", scopedAgentId);
      if (args) argsList.push(args);
    }
    if (argsList.length === 0) {
      res.status(404).json({ error: "No orders found" });
      return;
    }

    try {
      const buf = await generateMergedDeliveryCopiesPdf(argsList);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="delivery-copies-merged.pdf"`,
      );
      res.setHeader("Cache-Control", "no-store");
      res.end(buf);
    } catch (err) {
      logger.error({ err }, "Merged delivery copies PDF render failed");
      res.status(500).json({ error: "Failed to render PDF" });
    }
  },
);

export default router;
