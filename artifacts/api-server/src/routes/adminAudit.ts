import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, ilike, or, sql } from "drizzle-orm";
import {
  db,
  auditLogTable,
  usersTable,
  type AuditLog,
  type User,
} from "@workspace/db";
import { AdminListAuditLogQueryParams } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();
const DEFAULT_LIMIT = 50;

function toPayload(
  row: AuditLog,
  user: Pick<User, "email"> | null,
) {
  return {
    id: row.id,
    userId: row.userId,
    userEmail: user?.email ?? null,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    changes: row.changes,
    ipAddress: row.ipAddress,
    userAgent: row.userAgent,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get(
  "/admin/audit-log",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminListAuditLogQueryParams.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const { userId, action, entityType, entityId, q, limit, offset } =
      parsed.data;
    const conditions: Array<ReturnType<typeof eq>> = [];
    if (userId !== undefined) conditions.push(eq(auditLogTable.userId, userId));
    if (action) conditions.push(eq(auditLogTable.action, action));
    if (entityType) conditions.push(eq(auditLogTable.entityType, entityType));
    if (entityId !== undefined)
      conditions.push(eq(auditLogTable.entityId, entityId));
    if (q && q.trim()) {
      const needle = `%${q.trim()}%`;
      const orExpr = or(
        ilike(auditLogTable.action, needle),
        ilike(auditLogTable.entityType, needle),
        ilike(usersTable.email, needle),
      );
      if (orExpr) conditions.push(orExpr);
    }
    const whereExpr = conditions.length ? and(...conditions) : undefined;
    const cap = Math.min(limit ?? DEFAULT_LIMIT, 200);
    const off = offset ?? 0;

    const rows = await db
      .select({ entry: auditLogTable, user: usersTable })
      .from(auditLogTable)
      .leftJoin(usersTable, eq(usersTable.id, auditLogTable.userId))
      .where(whereExpr)
      .orderBy(desc(auditLogTable.createdAt))
      .limit(cap)
      .offset(off);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogTable)
      .leftJoin(usersTable, eq(usersTable.id, auditLogTable.userId))
      .where(whereExpr);

    res.json({
      rows: rows.map((r) => toPayload(r.entry, r.user)),
      total: countRow?.count ?? 0,
    });
  },
);

export default router;
