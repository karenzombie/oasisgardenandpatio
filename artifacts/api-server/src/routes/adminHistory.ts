import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, sql } from "drizzle-orm";
import { db, entityHistoryTable } from "@workspace/db";
import { requireAuth, requireRole } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.get(
  "/admin/history",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const entityType =
      typeof req.query.entityType === "string" ? req.query.entityType : null;
    const entityIdRaw = req.query.entityId;
    const entityId =
      typeof entityIdRaw === "string" && entityIdRaw !== ""
        ? Number.parseInt(entityIdRaw, 10)
        : null;
    const userIdRaw = req.query.userId;
    const userId =
      typeof userIdRaw === "string" && userIdRaw !== ""
        ? Number.parseInt(userIdRaw, 10)
        : null;
    const page = Math.max(
      1,
      Number.parseInt(String(req.query.page ?? "1"), 10) || 1,
    );
    const pageSize = Math.min(
      200,
      Math.max(1, Number.parseInt(String(req.query.pageSize ?? "50"), 10) || 50),
    );

    const conds = [];
    if (entityType) conds.push(eq(entityHistoryTable.entityType, entityType));
    if (entityId !== null && Number.isFinite(entityId))
      conds.push(eq(entityHistoryTable.entityId, entityId));
    if (userId !== null && Number.isFinite(userId))
      conds.push(eq(entityHistoryTable.changedByUserId, userId));
    const where = conds.length > 0 ? and(...conds) : undefined;

    const offset = (page - 1) * pageSize;

    const [rows, totalRow] = await Promise.all([
      db
        .select()
        .from(entityHistoryTable)
        .where(where)
        .orderBy(desc(entityHistoryTable.createdAt), desc(entityHistoryTable.id))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ c: sql<number>`COUNT(*)::int` })
        .from(entityHistoryTable)
        .where(where),
    ]);

    res.json({
      rows,
      total: totalRow[0]?.c ?? 0,
      page,
      pageSize,
    });
  },
);

export default router;
