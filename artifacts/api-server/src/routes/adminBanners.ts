import { Router, type IRouter, type Request, type Response } from "express";
import { asc, desc, eq } from "drizzle-orm";
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
    displayOrder: row.displayOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function nullDate(value: Date | null | undefined): Date | null {
  return value ?? null;
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
    const [created] = await db
      .insert(siteNotificationsTable)
      .values({
        title: parsed.data.title.trim(),
        messageText: parsed.data.messageText.trim(),
        type: parsed.data.type,
        startDate: start,
        endDate: end,
        isActive: parsed.data.isActive ?? true,
        displayOrder: parsed.data.displayOrder ?? 0,
      })
      .returning();
    if (!created) {
      res.status(500).json({ error: "Insert returned no row" });
      return;
    }
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
    const [updated] = await db
      .update(siteNotificationsTable)
      .set({
        title: body.data.title.trim(),
        messageText: body.data.messageText.trim(),
        type: body.data.type,
        startDate: start,
        endDate: end,
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
    const [deleted] = await db
      .delete(siteNotificationsTable)
      .where(eq(siteNotificationsTable.id, params.data.id))
      .returning({ id: siteNotificationsTable.id });
    if (!deleted) {
      res.status(404).json({ error: "Banner not found" });
      return;
    }
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
    const [updated] = await db
      .update(siteNotificationsTable)
      .set({ isActive: body.data.isActive })
      .where(eq(siteNotificationsTable.id, params.data.id))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Banner not found" });
      return;
    }
    res.json(bannerToPayload(updated));
  },
);

export default router;
