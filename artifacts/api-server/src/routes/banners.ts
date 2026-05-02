import { Router, type IRouter } from "express";
import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import { db, siteNotificationsTable } from "@workspace/db";

const router: IRouter = Router();

const BANNER_TYPES = ["popup", "banner"] as const;
type BannerType = (typeof BANNER_TYPES)[number];

router.get("/banners/active", async (req, res): Promise<void> => {
  const now = new Date();

  const banners = await db
    .select({
      id: siteNotificationsTable.id,
      title: siteNotificationsTable.title,
      messageText: siteNotificationsTable.messageText,
      type: siteNotificationsTable.type,
    })
    .from(siteNotificationsTable)
    .where(
      and(
        eq(siteNotificationsTable.isActive, true),
        or(
          isNull(siteNotificationsTable.startDate),
          lt(siteNotificationsTable.startDate, now),
        ),
        or(
          isNull(siteNotificationsTable.endDate),
          gt(siteNotificationsTable.endDate, now),
        ),
      ),
    )
    .orderBy(
      sql`${siteNotificationsTable.displayOrder} asc`,
      sql`${siteNotificationsTable.id} asc`,
    );

  const result = banners.flatMap((b) => {
    if (!BANNER_TYPES.includes(b.type as BannerType)) {
      req.log.warn(
        { id: b.id, type: b.type },
        "Skipping banner with unrecognized type",
      );
      return [];
    }
    return [{ ...b, type: b.type as BannerType }];
  });

  res.json(result);
});

export default router;
