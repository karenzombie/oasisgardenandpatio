import { Router, type IRouter, type Request, type Response } from "express";
import { and, gte, lte, sql } from "drizzle-orm";
import { db, analyticsEventsTable } from "@workspace/db";
import {
  TrackAnalyticsEventBody,
  AdminReportsVisitorFunnelQueryParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const ALLOWED_EVENT_TYPES = new Set([
  "visit",
  "auth_prompt",
  "signup_completed",
  "login_completed",
]);

function clientIp(req: Request): string | null {
  const xff = req.headers["x-forwarded-for"];
  if (typeof xff === "string" && xff.length > 0) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? null;
}

// POST /api/analytics/track  (public — anyone, including anon visitors, may call)
router.post(
  "/analytics/track",
  async (req: Request, res: Response) => {
    const parsed = TrackAnalyticsEventBody.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid event", details: parsed.error.format() });
    }
    const { eventType, anonymousId, path, reason, referrer } = parsed.data;
    if (!ALLOWED_EVENT_TYPES.has(eventType)) {
      return res.status(400).json({ error: "Unknown eventType" });
    }
    try {
      const ua = req.headers["user-agent"];
      await db.insert(analyticsEventsTable).values({
        eventType,
        anonymousId: anonymousId ?? null,
        userId: req.session?.userId ?? null,
        path: path ?? null,
        reason: reason ?? null,
        referrer: referrer ?? null,
        ipAddress: clientIp(req),
        userAgent: typeof ua === "string" ? ua : null,
      });
      return res.status(204).end();
    } catch (err) {
      logger.warn({ err, eventType }, "Failed to write analytics_events row");
      // Never fail loudly to a tracker — frontend should not retry storms.
      return res.status(204).end();
    }
  },
);

// GET /api/admin/reports/visitor-funnel  (admin only)
router.get(
  "/admin/reports/visitor-funnel",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response) => {
    const parsed = AdminReportsVisitorFunnelQueryParams.safeParse(req.query);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ error: "Invalid query", details: parsed.error.format() });
    }
    const now = new Date();
    let dateTo = now;
    if (parsed.data.dateTo) {
      const d = new Date(parsed.data.dateTo);
      if (Number.isNaN(d.getTime()))
        return res.status(400).json({ error: "Invalid dateTo" });
      dateTo = d;
    }
    let dateFrom = new Date(dateTo.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (parsed.data.dateFrom) {
      const d = new Date(parsed.data.dateFrom);
      if (Number.isNaN(d.getTime()))
        return res.status(400).json({ error: "Invalid dateFrom" });
      dateFrom = d;
    }
    if (dateFrom > dateTo) {
      return res.status(400).json({ error: "dateFrom must be <= dateTo" });
    }

    const rangeFilter = and(
      gte(analyticsEventsTable.createdAt, dateFrom),
      lte(analyticsEventsTable.createdAt, dateTo),
    );

    // Per-day distinct visitors / prompted / completed.
    const dailyRows = await db
      .select({
        day: sql<string>`date_trunc('day', ${analyticsEventsTable.createdAt})::date::text`,
        visitors: sql<number>`count(distinct ${analyticsEventsTable.anonymousId}) filter (where ${analyticsEventsTable.eventType} = 'visit')::int`,
        prompted: sql<number>`count(distinct ${analyticsEventsTable.anonymousId}) filter (where ${analyticsEventsTable.eventType} = 'auth_prompt')::int`,
        completed: sql<number>`count(distinct ${analyticsEventsTable.anonymousId}) filter (where ${analyticsEventsTable.eventType} in ('signup_completed','login_completed'))::int`,
        signups: sql<number>`count(distinct ${analyticsEventsTable.anonymousId}) filter (where ${analyticsEventsTable.eventType} = 'signup_completed')::int`,
        logins: sql<number>`count(distinct ${analyticsEventsTable.anonymousId}) filter (where ${analyticsEventsTable.eventType} = 'login_completed')::int`,
      })
      .from(analyticsEventsTable)
      .where(rangeFilter)
      .groupBy(sql`date_trunc('day', ${analyticsEventsTable.createdAt})::date`)
      .orderBy(sql`date_trunc('day', ${analyticsEventsTable.createdAt})::date desc`);

    const rows = dailyRows.map((r) => {
      const abandoned = Math.max(0, r.prompted - r.completed);
      return {
        day: r.day,
        visitors: r.visitors,
        prompted: r.prompted,
        completed: r.completed,
        signups: r.signups,
        logins: r.logins,
        abandoned,
      };
    });

    const totals = rows.reduce(
      (acc, r) => ({
        visitors: acc.visitors + r.visitors,
        prompted: acc.prompted + r.prompted,
        completed: acc.completed + r.completed,
        signups: acc.signups + r.signups,
        logins: acc.logins + r.logins,
        abandoned: acc.abandoned + r.abandoned,
      }),
      {
        visitors: 0,
        prompted: 0,
        completed: 0,
        signups: 0,
        logins: 0,
        abandoned: 0,
      },
    );

    return res.json({
      range: {
        dateFrom: dateFrom.toISOString(),
        dateTo: dateTo.toISOString(),
      },
      totals,
      rows,
    });
  },
);

export default router;
