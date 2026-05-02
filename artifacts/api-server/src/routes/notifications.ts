import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, notificationsTable, type Notification } from "@workspace/db";
import {
  StaffListNotificationsQueryParams,
  StaffMarkNotificationReadParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();
const DEFAULT_LIMIT = 25;

function toPayload(row: Notification) {
  return {
    id: row.id,
    type: row.type,
    message: row.message,
    linkUrl: row.linkUrl,
    isRead: row.isRead,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt ? row.readAt.toISOString() : null,
  };
}

router.get(
  "/staff/notifications",
  requireAuth,
  requireRole("agent", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = StaffListNotificationsQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const userId = req.session.userId!;
    const { unreadOnly, limit } = parsed.data;
    const conditions = [eq(notificationsTable.userId, userId)];
    if (unreadOnly) conditions.push(eq(notificationsTable.isRead, false));
    const rows = await db
      .select()
      .from(notificationsTable)
      .where(and(...conditions))
      .orderBy(desc(notificationsTable.createdAt))
      .limit(Math.min(limit ?? DEFAULT_LIMIT, 100));
    res.json(rows.map(toPayload));
  },
);

router.get(
  "/staff/notifications/unread-count",
  requireAuth,
  requireRole("agent", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId!;
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(notificationsTable)
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.isRead, false),
        ),
      );
    res.json({ unread: row?.count ?? 0 });
  },
);

router.post(
  "/staff/notifications/:id/read",
  requireAuth,
  requireRole("agent", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = StaffMarkNotificationReadParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const userId = req.session.userId!;
    const [updated] = await db
      .update(notificationsTable)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.id, params.data.id),
          eq(notificationsTable.userId, userId),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(toPayload(updated));
  },
);

router.post(
  "/staff/notifications/read-all",
  requireAuth,
  requireRole("agent", "admin"),
  async (req: Request, res: Response): Promise<void> => {
    const userId = req.session.userId!;
    const updated = await db
      .update(notificationsTable)
      .set({ isRead: true, readAt: new Date() })
      .where(
        and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.isRead, false),
        ),
      )
      .returning({ id: notificationsTable.id });
    res.json({ updated: updated.length });
  },
);

export default router;
