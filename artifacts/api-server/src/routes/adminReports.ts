import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, gte, lte, notInArray, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  usersTable,
  productsTable,
  manufacturersTable,
  categoriesTable,
} from "@workspace/db";
import {
  AdminReportsSalesSummaryQueryParams,
  AdminReportsSalesByAgentQueryParams,
  AdminReportsSalesByManufacturerQueryParams,
  AdminReportsSalesByCategoryQueryParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

const EXCLUDED_STATUSES = ["canceled", "refunded"];

type ResolvedRange = {
  dateFrom: Date;
  dateTo: Date;
  includeCanceled: boolean;
};

function resolveRange(query: {
  dateFrom?: string;
  dateTo?: string;
  includeCanceled?: boolean;
}): ResolvedRange | { error: string } {
  const now = new Date();
  let dateTo = now;
  if (query.dateTo) {
    const d = new Date(query.dateTo);
    if (Number.isNaN(d.getTime())) return { error: "Invalid dateTo" };
    dateTo = d;
  }
  let dateFrom = new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (query.dateFrom) {
    const d = new Date(query.dateFrom);
    if (Number.isNaN(d.getTime())) return { error: "Invalid dateFrom" };
    dateFrom = d;
  }
  if (dateFrom > dateTo) return { error: "dateFrom must be <= dateTo" };
  return { dateFrom, dateTo, includeCanceled: query.includeCanceled === true };
}

function rangeFilter(range: ResolvedRange) {
  const conds = [
    gte(ordersTable.placedAt, range.dateFrom),
    lte(ordersTable.placedAt, range.dateTo),
  ];
  if (!range.includeCanceled) {
    conds.push(notInArray(ordersTable.status, EXCLUDED_STATUSES));
  }
  return and(...conds);
}

function rangePayload(range: ResolvedRange) {
  return {
    dateFrom: range.dateFrom.toISOString(),
    dateTo: range.dateTo.toISOString(),
    includeCanceled: range.includeCanceled,
  };
}

// CSV escape: wrap every field in quotes, escape inner quotes by doubling.
// Also defuse spreadsheet formula injection by prefixing values that begin
// with `=`, `+`, `-`, `@`, tab, or carriage return with a single quote so
// Excel/Google Sheets render them as text instead of executing them.
function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '""';
  let s = String(v);
  if (s.length > 0 && /^[=+\-@\t\r]/.test(s)) {
    s = `'${s}`;
  }
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) lines.push(row.map(csvEscape).join(","));
  return lines.join("\n") + "\n";
}

function sendCsv(res: Response, filename: string, csv: string) {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.send(csv);
}

// GET /admin/reports/sales-summary
router.get(
  "/admin/reports/sales-summary",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response) => {
    const parsed = AdminReportsSalesSummaryQueryParams.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query", details: parsed.error.format() });
    }
    const range = resolveRange(parsed.data);
    if ("error" in range) return res.status(400).json({ error: range.error });

    const baseFilter = rangeFilter(range);
    // Agents only see their own orders in the summary numbers.
    const filter =
      req.user?.role === "agent"
        ? and(baseFilter, eq(ordersTable.createdByAgentId, req.user.id))
        : baseFilter;

    const [orderTotals] = await db
      .select({
        orderCount: sql<number>`count(*)::int`,
        grossRevenue: sql<number>`coalesce(sum(${ordersTable.total}), 0)::float8`,
        subtotal: sql<number>`coalesce(sum(${ordersTable.subtotal}), 0)::float8`,
        taxTotal: sql<number>`coalesce(sum(${ordersTable.taxAmount}), 0)::float8`,
        deliveryTotal: sql<number>`coalesce(sum(${ordersTable.deliveryAmount}), 0)::float8`,
      })
      .from(ordersTable)
      .where(filter);

    const [itemTotals] = await db
      .select({
        itemCount: sql<number>`coalesce(sum(${orderItemsTable.quantity}), 0)::int`,
        discountTotal: sql<number>`coalesce(sum(${orderItemsTable.discountAmount}), 0)::float8`,
      })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .where(filter);

    const orderCount = orderTotals?.orderCount ?? 0;
    const grossRevenue = orderTotals?.grossRevenue ?? 0;
    return res.json({
      range: rangePayload(range),
      orderCount,
      itemCount: itemTotals?.itemCount ?? 0,
      grossRevenue,
      subtotal: orderTotals?.subtotal ?? 0,
      taxTotal: orderTotals?.taxTotal ?? 0,
      deliveryTotal: orderTotals?.deliveryTotal ?? 0,
      discountTotal: itemTotals?.discountTotal ?? 0,
      averageOrderValue: orderCount > 0 ? grossRevenue / orderCount : 0,
    });
  },
);

// GET /admin/reports/sales-by-agent
router.get(
  "/admin/reports/sales-by-agent",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response) => {
    const parsed = AdminReportsSalesByAgentQueryParams.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query", details: parsed.error.format() });
    }
    const range = resolveRange(parsed.data);
    if ("error" in range) return res.status(400).json({ error: range.error });

    const itemCountSql = sql<number>`(
      select coalesce(sum(${orderItemsTable.quantity}), 0)::int
      from ${orderItemsTable}
      where ${orderItemsTable.orderId} = ${ordersTable.id}
    )`;

    const baseFilter = rangeFilter(range);
    // Agents only see their own row in the by-agent breakdown.
    const filter =
      req.user?.role === "agent"
        ? and(baseFilter, eq(ordersTable.createdByAgentId, req.user.id))
        : baseFilter;

    const rows = await db
      .select({
        agentId: ordersTable.createdByAgentId,
        agentEmail: usersTable.email,
        orderCount: sql<number>`count(*)::int`,
        itemCount: sql<number>`coalesce(sum(${itemCountSql}), 0)::int`,
        grossRevenue: sql<number>`coalesce(sum(${ordersTable.total}), 0)::float8`,
      })
      .from(ordersTable)
      .leftJoin(usersTable, eq(ordersTable.createdByAgentId, usersTable.id))
      .where(filter)
      .groupBy(ordersTable.createdByAgentId, usersTable.email)
      .orderBy(desc(sql`coalesce(sum(${ordersTable.total}), 0)`));

    const enriched = rows.map((r) => ({
      agentId: r.agentId,
      agentEmail: r.agentEmail,
      orderCount: r.orderCount,
      itemCount: r.itemCount,
      grossRevenue: r.grossRevenue,
      averageOrderValue: r.orderCount > 0 ? r.grossRevenue / r.orderCount : 0,
    }));

    if (parsed.data.format === "csv") {
      const csv = toCsv(
        ["Agent ID", "Agent Email", "Orders", "Items", "Gross Collected", "Average Order"],
        enriched.map((r) => [
          r.agentId ?? "",
          r.agentEmail ?? "(unassigned)",
          r.orderCount,
          r.itemCount,
          r.grossRevenue.toFixed(2),
          r.averageOrderValue.toFixed(2),
        ]),
      );
      return sendCsv(res, "sales-by-agent.csv", csv);
    }
    return res.json({ range: rangePayload(range), rows: enriched });
  },
);

// GET /admin/reports/sales-by-manufacturer
router.get(
  "/admin/reports/sales-by-manufacturer",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const parsed = AdminReportsSalesByManufacturerQueryParams.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query", details: parsed.error.format() });
    }
    const range = resolveRange(parsed.data);
    if ("error" in range) return res.status(400).json({ error: range.error });

    const rows = await db
      .select({
        manufacturerId: productsTable.manufacturerId,
        manufacturerName: manufacturersTable.name,
        orderCount: sql<number>`count(distinct ${ordersTable.id})::int`,
        itemCount: sql<number>`coalesce(sum(${orderItemsTable.quantity}), 0)::int`,
        revenue: sql<number>`coalesce(sum(${orderItemsTable.amount} - ${orderItemsTable.discountAmount}), 0)::float8`,
      })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
      .leftJoin(manufacturersTable, eq(productsTable.manufacturerId, manufacturersTable.id))
      .where(rangeFilter(range))
      .groupBy(productsTable.manufacturerId, manufacturersTable.name)
      .orderBy(desc(sql`coalesce(sum(${orderItemsTable.amount} - ${orderItemsTable.discountAmount}), 0)`));

    if (parsed.data.format === "csv") {
      const csv = toCsv(
        ["Manufacturer ID", "Manufacturer", "Orders", "Items", "Product Revenue"],
        rows.map((r) => [
          r.manufacturerId ?? "",
          r.manufacturerName ?? "(no manufacturer)",
          r.orderCount,
          r.itemCount,
          r.revenue.toFixed(2),
        ]),
      );
      return sendCsv(res, "sales-by-manufacturer.csv", csv);
    }
    return res.json({ range: rangePayload(range), rows });
  },
);

// GET /admin/reports/sales-by-category
router.get(
  "/admin/reports/sales-by-category",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const parsed = AdminReportsSalesByCategoryQueryParams.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ error: "Invalid query", details: parsed.error.format() });
    }
    const range = resolveRange(parsed.data);
    if ("error" in range) return res.status(400).json({ error: range.error });

    const rows = await db
      .select({
        categoryId: productsTable.categoryId,
        categoryName: categoriesTable.name,
        orderCount: sql<number>`count(distinct ${ordersTable.id})::int`,
        itemCount: sql<number>`coalesce(sum(${orderItemsTable.quantity}), 0)::int`,
        revenue: sql<number>`coalesce(sum(${orderItemsTable.amount} - ${orderItemsTable.discountAmount}), 0)::float8`,
      })
      .from(orderItemsTable)
      .innerJoin(ordersTable, eq(orderItemsTable.orderId, ordersTable.id))
      .leftJoin(productsTable, eq(orderItemsTable.productId, productsTable.id))
      .leftJoin(categoriesTable, eq(productsTable.categoryId, categoriesTable.id))
      .where(rangeFilter(range))
      .groupBy(productsTable.categoryId, categoriesTable.name)
      .orderBy(desc(sql`coalesce(sum(${orderItemsTable.amount} - ${orderItemsTable.discountAmount}), 0)`));

    if (parsed.data.format === "csv") {
      const csv = toCsv(
        ["Category ID", "Category", "Orders", "Items", "Product Revenue"],
        rows.map((r) => [
          r.categoryId ?? "",
          r.categoryName ?? "(uncategorized)",
          r.orderCount,
          r.itemCount,
          r.revenue.toFixed(2),
        ]),
      );
      return sendCsv(res, "sales-by-category.csv", csv);
    }
    return res.json({ range: rangePayload(range), rows });
  },
);

export default router;
