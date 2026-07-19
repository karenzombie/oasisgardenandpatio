import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, gt, isNull, lt, ne, or, sql } from "drizzle-orm";
import { db, siteNotificationsTable, type SiteNotification } from "@workspace/db";
import {
  AdminCreateBannerBody,
  AdminUpdateBannerParams,
  AdminUpdateBannerBody,
  AdminDeleteBannerParams,
  AdminSetBannerActiveParams,
  AdminSetBannerActiveBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { recordHistory } from "../lib/history";

const router: IRouter = Router();

function bannerToPayload(row: SiteNotification) {
  return {
    id: row.id,
    title: row.title,
    messageText: row.messageText,
    type: row.type as "popup" | "banner",
    startDate: row.startDate ? row.startDate.toISOString() : null,
    endDate: row.endDate ? row.endDate.toISOString() : null,
    isActive: row.isActive,
    style: row.style,
    displayOrder: row.displayOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function nullDate(value: Date | null | undefined): Date | null {
  return value ?? null;
}

/**
 * Returns true if any other active row of the same type has a window that
 * overlaps the candidate window.  Null start = −∞, null end = +∞.
 * Overlap: aStart < bEnd AND bStart < aEnd (strict <, so touching edges are fine).
 */
async function findOverlappingActive(candidate: {
  type: string;
  startDate: Date | null;
  endDate: Date | null;
  excludeId?: number;
}): Promise<boolean> {
  const { type, startDate, endDate, excludeId } = candidate;

  // candidate_start < row_end  (null candidate_start = −∞ → always true)
  const aStartLtBEnd =
    startDate === null
      ? sql`true`
      : or(
          isNull(siteNotificationsTable.endDate),
          gt(siteNotificationsTable.endDate, startDate),
        );

  // row_start < candidate_end  (null candidate_end = +∞ → always true)
  const bStartLtAEnd =
    endDate === null
      ? sql`true`
      : or(
          isNull(siteNotificationsTable.startDate),
          lt(siteNotificationsTable.startDate, endDate),
        );

  const conditions = [
    eq(siteNotificationsTable.type, type),
    eq(siteNotificationsTable.isActive, true),
    aStartLtBEnd,
    bStartLtAEnd,
    ...(excludeId !== undefined ? [ne(siteNotificationsTable.id, excludeId)] : []),
  ];

  const [conflict] = await db
    .select({ id: siteNotificationsTable.id })
    .from(siteNotificationsTable)
    .where(and(...conditions))
    .limit(1);

  return conflict !== undefined;
}

function overlapErrorMessage(type: string): string {
  return type === "popup"
    ? "Only one pop-up can be live at a time, and this one's active dates overlap a pop-up that's already active. Turn the other one off, or give this pop-up start and end dates that don't overlap it."
    : "Only one banner can be live at a time, and this one's active dates overlap a banner that's already active. Turn the other one off, or give this banner start and end dates that don't overlap it.";
}

router.get(
  "/admin/banners",
  requireAuth,
  requireRole("admin"),
  async (_req: Request, res: Response): Promise<void> => {
    const rows = await db
      .select()
      .from(siteNotificationsTable)
      .orderBy(
        desc(siteNotificationsTable.isActive),
        asc(siteNotificationsTable.displayOrder),
        asc(siteNotificationsTable.id),
      );
    res.json(rows.map(bannerToPayload));
  },
);

router.post(
  "/admin/banners",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminCreateBannerBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const start = nullDate(parsed.data.startDate);
    const end = nullDate(parsed.data.endDate);
    if (start && end && end <= start) {
      res
        .status(400)
        .json({ error: "End date must be after start date" });
      return;
    }
    if (parsed.data.isActive ?? true) {
      const conflict = await findOverlappingActive({
        type: parsed.data.type,
        startDate: start,
        endDate: end,
      });
      if (conflict) {
        res.status(409).json({ error: overlapErrorMessage(parsed.data.type) });
        return;
      }
    }
    const [created] = await db
      .insert(siteNotificationsTable)
      .values({
        title: parsed.data.title.trim(),
        messageText: parsed.data.messageText.trim(),
        type: parsed.data.type,
        startDate: start,
        endDate: end,
        style: parsed.data.style ?? "standard",
        isActive: parsed.data.isActive ?? true,
        displayOrder: parsed.data.displayOrder ?? 0,
      })
      .returning();
    if (!created) {
      res.status(500).json({ error: "Insert returned no row" });
      return;
    }
    await recordHistory(req, {
      entityType: "banner",
      entityId: created.id,
      changeType: "create",
      snapshot: created,
    });
    res.status(201).json(bannerToPayload(created));
  },
);

router.put(
  "/admin/banners/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminUpdateBannerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminUpdateBannerBody.safeParse(req.body);
    if (!body.success) {
      res
        .status(400)
        .json({ error: body.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const start = nullDate(body.data.startDate);
    const end = nullDate(body.data.endDate);
    if (start && end && end <= start) {
      res
        .status(400)
        .json({ error: "End date must be after start date" });
      return;
    }
    const [previous] = await db
      .select()
      .from(siteNotificationsTable)
      .where(eq(siteNotificationsTable.id, params.data.id));
    if (previous?.isActive) {
      const conflict = await findOverlappingActive({
        type: body.data.type,
        startDate: start,
        endDate: end,
        excludeId: params.data.id,
      });
      if (conflict) {
        res.status(409).json({ error: overlapErrorMessage(body.data.type) });
        return;
      }
    }
    const [updated] = await db
      .update(siteNotificationsTable)
      .set({
        title: body.data.title.trim(),
        messageText: body.data.messageText.trim(),
        type: body.data.type,
        startDate: start,
        endDate: end,
        ...(body.data.style !== undefined ? { style: body.data.style } : {}),
        ...(body.data.displayOrder !== undefined
          ? { displayOrder: body.data.displayOrder }
          : {}),
      })
      .where(eq(siteNotificationsTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Banner not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "banner",
      entityId: updated.id,
      changeType: "update",
      snapshot: updated,
      previousSnapshot: previous ?? null,
    });
    res.json(bannerToPayload(updated));
  },
);

router.delete(
  "/admin/banners/:id",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminDeleteBannerParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const [previous] = await db
      .select()
      .from(siteNotificationsTable)
      .where(eq(siteNotificationsTable.id, params.data.id));
    const [deleted] = await db
      .delete(siteNotificationsTable)
      .where(eq(siteNotificationsTable.id, params.data.id))
      .returning({ id: siteNotificationsTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Banner not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "banner",
      entityId: deleted.id,
      changeType: "delete",
      snapshot: previous ?? { id: deleted.id },
      previousSnapshot: previous ?? null,
    });
    res.status(204).send();
  },
);

router.patch(
  "/admin/banners/:id/active",
  requireAuth,
  requireRole("admin"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminSetBannerActiveParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const body = AdminSetBannerActiveBody.safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ error: "Invalid body" });
      return;
    }
    const [previous] = await db
      .select()
      .from(siteNotificationsTable)
      .where(eq(siteNotificationsTable.id, params.data.id));
    if (body.data.isActive) {
      if (!previous) {
        res.status(404).json({ error: "Banner not found" });
        return;
      }
      const conflict = await findOverlappingActive({
        type: previous.type,
        startDate: previous.startDate,
        endDate: previous.endDate,
        excludeId: params.data.id,
      });
      if (conflict) {
        res.status(409).json({ error: overlapErrorMessage(previous.type) });
        return;
      }
    }
    const [updated] = await db
      .update(siteNotificationsTable)
      .set({ isActive: body.data.isActive })
      .where(eq(siteNotificationsTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Banner not found" });
      return;
    }
    await recordHistory(req, {
      entityType: "banner",
      entityId: updated.id,
      changeType: "update",
      snapshot: updated,
      previousSnapshot: previous ?? null,
      notes: `set isActive=${body.data.isActive}`,
    });
    res.json(bannerToPayload(updated));
  },
);

export default router;
