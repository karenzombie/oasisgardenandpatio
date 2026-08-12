import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, ilike, inArray, max, or, sql } from "drizzle-orm";
import { aliasedTable } from "drizzle-orm/alias";
import {
  db,
  wishlistsTable,
  wishlistItemsTable,
  wishlistOutreachLogTable,
  wishlistOutreachLogItemsTable,
  wishlistStatusHistoryTable,
  customersTable,
  productsTable,
  manufacturersTable,
  usersTable,
  finishesTable,
  fabricsTable,
  productVariantsTable,
} from "@workspace/db";
import {
  AdminListWishlistsQueryParams,
  AdminGetWishlistParams,
  AdminPreviewWishlistReachOutEmailBody,
  AdminSendWishlistReachOutEmailBody,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { generateWishlistPdf } from "../lib/wishlistPdf";
import {
  emailLayout,
  renderWishlistReachOutEmailBody,
  sendWishlistReachOutEmail,
} from "../lib/email";
import { getBaseUrl } from "../lib/baseUrl";

const router: IRouter = Router();

function money(n: string | number | null | undefined): number | null {
  if (n === null || n === undefined) return null;
  const v = Number(n);
  return Number.isFinite(v) ? v : null;
}

// Live staff-facing unit price: sale price if present, else MSRP, else null.
// Never reads price_at_save — that column is reserved for a future order
// conversion feature only (Brief 7, Step 5).
function livePrice(product: {
  salePrice: string | null;
  msrp: string | null;
} | null): number | null {
  if (!product) return null;
  return money(product.salePrice) ?? money(product.msrp);
}

router.get(
  "/admin/wishlists",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const query = AdminListWishlistsQueryParams.safeParse(req.query);
    if (!query.success) {
      res.status(400).json({ error: "Invalid query" });
      return;
    }
    const { q, limit, offset } = query.data;

    const searchWhere = q
      ? or(
          ilike(wishlistsTable.wishlistNumber, `%${q}%`),
          ilike(customersTable.email, `%${q}%`),
          ilike(
            sql`${customersTable.firstName} || ' ' || ${customersTable.lastName}`,
            `%${q}%`,
          ),
        )
      : undefined;

    const rows = await db
      .select({
        customerId: wishlistsTable.customerId,
        wishlistNumber: wishlistsTable.wishlistNumber,
        customerFirstName: customersTable.firstName,
        customerLastName: customersTable.lastName,
        customerEmail: customersTable.email,
        marketingOptOut: customersTable.marketingOptOut,
        marketingOptOutAt: customersTable.marketingOptOutAt,
        itemCount: sql<number>`count(${wishlistItemsTable.id})`.as(
          "item_count",
        ),
        mostRecentSaveAt: max(wishlistItemsTable.createdAt),
      })
      .from(wishlistsTable)
      .innerJoin(
        customersTable,
        eq(customersTable.id, wishlistsTable.customerId),
      )
      .innerJoin(
        wishlistItemsTable,
        eq(wishlistItemsTable.customerId, wishlistsTable.customerId),
      )
      .where(searchWhere)
      .groupBy(
        wishlistsTable.customerId,
        wishlistsTable.wishlistNumber,
        customersTable.firstName,
        customersTable.lastName,
        customersTable.email,
        customersTable.marketingOptOut,
        customersTable.marketingOptOutAt,
      )
      .having(sql`count(${wishlistItemsTable.id}) > 0`)
      .orderBy(desc(max(wishlistItemsTable.createdAt)));

    const total = rows.length;
    const page = rows
      .slice(offset ?? 0, (offset ?? 0) + (limit ?? 50))
      .map((r) => ({
        customerId: r.customerId,
        wishlistNumber: r.wishlistNumber,
        customerName: `${r.customerFirstName} ${r.customerLastName}`.trim(),
        customerEmail: r.customerEmail,
        itemCount: Number(r.itemCount),
        mostRecentSaveAt: (r.mostRecentSaveAt instanceof Date
          ? r.mostRecentSaveAt
          : new Date(r.mostRecentSaveAt as unknown as string)
        ).toISOString(),
        marketingOptOut: r.marketingOptOut,
        marketingOptOutAt: r.marketingOptOutAt
          ? r.marketingOptOutAt.toISOString()
          : null,
      }));

    res.json({ rows: page, total });
  },
);

type WishlistStatusEventType =
  | "item_added"
  | "reach_out_sent"
  | "opt_out"
  | "opt_in";

async function loadWishlistStatusHistory(wishlistId: number) {
  const rows = await db
    .select({
      id: wishlistStatusHistoryTable.id,
      eventType: wishlistStatusHistoryTable.eventType,
      createdAt: wishlistStatusHistoryTable.createdAt,
      outreachLogId: wishlistStatusHistoryTable.outreachLogId,
      productName: productsTable.name,
      staffEmail: usersTable.email,
    })
    .from(wishlistStatusHistoryTable)
    .leftJoin(
      productsTable,
      eq(productsTable.id, wishlistStatusHistoryTable.productId),
    )
    .leftJoin(
      usersTable,
      eq(usersTable.id, wishlistStatusHistoryTable.staffUserId),
    )
    .where(eq(wishlistStatusHistoryTable.wishlistId, wishlistId))
    .orderBy(desc(wishlistStatusHistoryTable.createdAt));

  const outreachLogIds = Array.from(
    new Set(
      rows
        .filter(
          (r) => r.eventType === "reach_out_sent" && r.outreachLogId != null,
        )
        .map((r) => r.outreachLogId as number),
    ),
  );

  const itemNamesByLogId = new Map<number, string[]>();
  if (outreachLogIds.length > 0) {
    const itemRows = await db
      .select({
        outreachLogId: wishlistOutreachLogItemsTable.outreachLogId,
        id: wishlistOutreachLogItemsTable.id,
        productName: productsTable.name,
      })
      .from(wishlistOutreachLogItemsTable)
      .innerJoin(
        wishlistItemsTable,
        eq(wishlistItemsTable.id, wishlistOutreachLogItemsTable.wishlistItemId),
      )
      .leftJoin(
        productsTable,
        eq(productsTable.id, wishlistItemsTable.productId),
      )
      .where(inArray(wishlistOutreachLogItemsTable.outreachLogId, outreachLogIds))
      .orderBy(wishlistOutreachLogItemsTable.id);
    for (const r of itemRows) {
      const name = r.productName ?? "(product no longer available)";
      const list = itemNamesByLogId.get(r.outreachLogId) ?? [];
      list.push(name);
      itemNamesByLogId.set(r.outreachLogId, list);
    }
  }

  return rows.map((r) => {
    const isReachOut = r.eventType === "reach_out_sent";
    const itemNames = isReachOut
      ? (itemNamesByLogId.get(r.outreachLogId ?? -1) ?? [])
      : null;
    return {
      id: r.id,
      eventType: r.eventType as WishlistStatusEventType,
      createdAt: r.createdAt.toISOString(),
      staffEmail: r.staffEmail ?? null,
      productName: r.eventType === "item_added" ? (r.productName ?? null) : null,
      itemCount: isReachOut ? (itemNames?.length ?? 0) : null,
      itemNames,
    };
  });
}

async function loadWishlistDetail(customerId: number) {
  const [wishlist] = await db
    .select({
      id: wishlistsTable.id,
      wishlistNumber: wishlistsTable.wishlistNumber,
      createdAt: wishlistsTable.createdAt,
      customerFirstName: customersTable.firstName,
      customerLastName: customersTable.lastName,
      customerEmail: customersTable.email,
      customerPhone: customersTable.phone,
      marketingOptOut: customersTable.marketingOptOut,
      marketingOptOutAt: customersTable.marketingOptOutAt,
    })
    .from(wishlistsTable)
    .innerJoin(
      customersTable,
      eq(customersTable.id, wishlistsTable.customerId),
    )
    .where(eq(wishlistsTable.customerId, customerId))
    .limit(1);

  if (!wishlist) return null;

  const frameFinishes = aliasedTable(finishesTable, "frame_finishes");
  const tileFinishes = aliasedTable(finishesTable, "tile_finishes");

  const itemRows = await db
    .select({
      id: wishlistItemsTable.id,
      productId: wishlistItemsTable.productId,
      variantLabel: wishlistItemsTable.variantLabel,
      quantity: wishlistItemsTable.quantity,
      createdAt: wishlistItemsTable.createdAt,
      productName: productsTable.name,
      productSku: productsTable.sku,
      variantSku: productVariantsTable.variantSku,
      price: productsTable.price,
      salePrice: productsTable.salePrice,
      msrp: productsTable.msrp,
      manufacturerName: manufacturersTable.name,
      finishName: frameFinishes.name,
      fabricName: fabricsTable.name,
      fabricItemNumber: fabricsTable.itemNumber,
      tileName: tileFinishes.name,
    })
    .from(wishlistItemsTable)
    .leftJoin(productsTable, eq(productsTable.id, wishlistItemsTable.productId))
    .leftJoin(
      manufacturersTable,
      eq(manufacturersTable.id, productsTable.manufacturerId),
    )
    .leftJoin(fabricsTable, eq(fabricsTable.id, wishlistItemsTable.selectedFabricId))
    .leftJoin(frameFinishes, eq(frameFinishes.id, wishlistItemsTable.selectedFinishId))
    .leftJoin(tileFinishes, eq(tileFinishes.id, wishlistItemsTable.selectedTableTopTileId))
    .leftJoin(
      productVariantsTable,
      eq(productVariantsTable.id, wishlistItemsTable.variantId),
    )
    .where(eq(wishlistItemsTable.customerId, customerId))
    .orderBy(desc(wishlistItemsTable.createdAt));

  const lastSentByItemId = new Map<number, Date>();
  if (itemRows.length > 0) {
    const lastSentRows = await db
      .select({
        wishlistItemId: wishlistOutreachLogItemsTable.wishlistItemId,
        lastSentAt: max(wishlistOutreachLogTable.sentAt),
      })
      .from(wishlistOutreachLogItemsTable)
      .innerJoin(
        wishlistOutreachLogTable,
        eq(wishlistOutreachLogTable.id, wishlistOutreachLogItemsTable.outreachLogId),
      )
      .where(
        inArray(
          wishlistOutreachLogItemsTable.wishlistItemId,
          itemRows.map((r) => r.id),
        ),
      )
      .groupBy(wishlistOutreachLogItemsTable.wishlistItemId);
    for (const r of lastSentRows) {
      if (r.lastSentAt) lastSentByItemId.set(r.wishlistItemId, r.lastSentAt);
    }
  }

  let subtotal = 0;
  let hasUnpricedItems = false;
  const items = itemRows.map((r) => {
    const unitPrice = livePrice(
      r.productId ? { msrp: r.msrp, salePrice: r.salePrice } : null,
    );
    const amount = unitPrice !== null ? unitPrice * r.quantity : null;
    if (amount === null) hasUnpricedItems = true;
    else subtotal += amount;
    const lastSentAt = lastSentByItemId.get(r.id) ?? null;
    return {
      id: r.id,
      productId: r.productId,
      description: r.productName ?? "(product no longer available)",
      sku: r.variantSku ?? r.productSku ?? null,
      variantLabel: r.variantLabel,
      finishName: r.finishName ?? null,
      fabricName: r.fabricName ?? null,
      fabricItemNumber: r.fabricItemNumber ?? null,
      tileName: r.tileName ?? null,
      quantity: r.quantity,
      unitPrice,
      amount,
      manufacturerName: r.manufacturerName ?? null,
      addedAt: r.createdAt.toISOString(),
      lastReachOutSentAt: lastSentAt ? lastSentAt.toISOString() : null,
    };
  });

  const statusHistory = await loadWishlistStatusHistory(wishlist.id);

  return {
    customerId,
    wishlistNumber: wishlist.wishlistNumber,
    createdAt: wishlist.createdAt.toISOString(),
    customerName: `${wishlist.customerFirstName} ${wishlist.customerLastName}`.trim(),
    customerEmail: wishlist.customerEmail,
    customerPhone: wishlist.customerPhone,
    marketingOptOut: wishlist.marketingOptOut,
    marketingOptOutAt: wishlist.marketingOptOutAt
      ? wishlist.marketingOptOutAt.toISOString()
      : null,
    items,
    subtotal: Math.round(subtotal * 100) / 100,
    hasUnpricedItems,
    statusHistory,
  };
}

router.get(
  "/admin/wishlists/:customerId",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetWishlistParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid customerId" });
      return;
    }
    const detail = await loadWishlistDetail(params.data.customerId);
    if (!detail) {
      res.status(404).json({ error: "Wishlist not found" });
      return;
    }
    res.json(detail);
  },
);

router.get(
  "/admin/wishlists/:customerId/pdf",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetWishlistParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: "Invalid customerId" });
      return;
    }
    const detail = await loadWishlistDetail(params.data.customerId);
    if (!detail) {
      res.status(404).json({ error: "Wishlist not found" });
      return;
    }

    try {
      const buf = await generateWishlistPdf(detail);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${detail.wishlistNumber}-wishlist.pdf"`,
      );
      res.setHeader("Cache-Control", "no-store");
      res.end(buf);
    } catch (err) {
      logger.error(
        { err, customerId: params.data.customerId },
        "Wishlist PDF render failed",
      );
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  },
);

interface ReachOutRecipient {
  email: string;
  firstName: string | null;
  marketingOptOut: boolean;
}

async function loadReachOutRecipient(
  customerId: number,
): Promise<ReachOutRecipient | null> {
  const [row] = await db
    .select({
      email: customersTable.email,
      firstName: customersTable.firstName,
      marketingOptOut: customersTable.marketingOptOut,
    })
    .from(customersTable)
    .where(eq(customersTable.id, customerId))
    .limit(1);
  return row ?? null;
}

// Confirms every requested itemId actually belongs to this customer's
// wishlist, so a stale/tampered client payload can never scope an email
// (or the status-history write) to another customer's items.
async function validateItemIdsBelongToCustomer(
  customerId: number,
  itemIds: number[],
): Promise<boolean> {
  if (itemIds.length === 0) return false;
  const rows = await db
    .select({ id: wishlistItemsTable.id })
    .from(wishlistItemsTable)
    .where(
      and(
        eq(wishlistItemsTable.customerId, customerId),
        inArray(wishlistItemsTable.id, itemIds),
      ),
    );
  return rows.length === new Set(itemIds).size;
}

// Customer-facing pricing rule (Brief 7, Step 6): only include a price when
// the product is visibly priced on the storefront. Distinct from the staff
// UI's livePrice(), which always shows price data regardless of
// show_price_online.
async function loadReachOutItems(customerId: number, itemIds: number[]) {
  const frameFinishes = aliasedTable(finishesTable, "ro_frame_finishes");
  const tileFinishes = aliasedTable(finishesTable, "ro_tile_finishes");

  const rows = await db
    .select({
      productName: productsTable.name,
      variantLabel: wishlistItemsTable.variantLabel,
      price: productsTable.price,
      salePrice: productsTable.salePrice,
      msrp: productsTable.msrp,
      showPriceOnline: productsTable.showPriceOnline,
      finishName: frameFinishes.name,
      fabricName: fabricsTable.name,
      fabricItemNumber: fabricsTable.itemNumber,
      tileName: tileFinishes.name,
    })
    .from(wishlistItemsTable)
    .innerJoin(
      productsTable,
      eq(productsTable.id, wishlistItemsTable.productId),
    )
    .leftJoin(fabricsTable, eq(fabricsTable.id, wishlistItemsTable.selectedFabricId))
    .leftJoin(frameFinishes, eq(frameFinishes.id, wishlistItemsTable.selectedFinishId))
    .leftJoin(tileFinishes, eq(tileFinishes.id, wishlistItemsTable.selectedTableTopTileId))
    .where(
      and(
        eq(wishlistItemsTable.customerId, customerId),
        inArray(wishlistItemsTable.id, itemIds),
      ),
    )
    .orderBy(desc(wishlistItemsTable.createdAt));

  return rows.map((r) => ({
    name: r.productName,
    variantLabel: r.variantLabel,
    finishName: r.finishName ?? null,
    fabricName: r.fabricName ?? null,
    fabricItemNumber: r.fabricItemNumber ?? null,
    tileName: r.tileName ?? null,
    price: r.showPriceOnline
      ? (money(r.salePrice) ?? money(r.msrp))
      : null,
  }));
}

router.post(
  "/admin/wishlists/:customerId/reach-out-email/preview",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetWishlistParams.safeParse(req.params);
    const body = AdminPreviewWishlistReachOutEmailBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const recipient = await loadReachOutRecipient(params.data.customerId);
    if (!recipient) {
      res.status(404).json({ error: "Wishlist not found" });
      return;
    }
    const validItems = await validateItemIdsBelongToCustomer(
      params.data.customerId,
      body.data.itemIds,
    );
    if (!validItems) {
      res.status(400).json({ error: "Invalid item selection" });
      return;
    }
    const items = await loadReachOutItems(
      params.data.customerId,
      body.data.itemIds,
    );
    const html = emailLayout(
      "Your Wishlist",
      renderWishlistReachOutEmailBody({
        firstName: recipient.firstName,
        items,
        personalNote: body.data.personalNote,
        accountSettingsUrl: `${getBaseUrl()}/account`,
      }),
    );
    res.json({ html });
  },
);

router.post(
  "/admin/wishlists/:customerId/reach-out-email/send",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const params = AdminGetWishlistParams.safeParse(req.params);
    const body = AdminSendWishlistReachOutEmailBody.safeParse(req.body);
    if (!params.success || !body.success) {
      res.status(400).json({ error: "Invalid request" });
      return;
    }
    const { customerId } = params.data;
    const recipient = await loadReachOutRecipient(customerId);
    if (!recipient) {
      res.status(404).json({ error: "Wishlist not found" });
      return;
    }
    if (recipient.marketingOptOut) {
      res
        .status(409)
        .json({ error: "Customer has opted out of marketing contact" });
      return;
    }

    const { itemIds } = body.data;
    const validItems = await validateItemIdsBelongToCustomer(
      customerId,
      itemIds,
    );
    if (!validItems) {
      res.status(400).json({ error: "Invalid item selection" });
      return;
    }

    const [wishlistRow] = await db
      .select({ id: wishlistsTable.id })
      .from(wishlistsTable)
      .where(eq(wishlistsTable.customerId, customerId))
      .limit(1);
    if (!wishlistRow) {
      res.status(404).json({ error: "Wishlist not found" });
      return;
    }

    const items = await loadReachOutItems(customerId, itemIds);
    const personalNote = body.data.personalNote?.trim() || null;

    try {
      await sendWishlistReachOutEmail({
        to: recipient.email,
        firstName: recipient.firstName,
        items,
        personalNote,
        accountSettingsUrl: `${getBaseUrl()}/account`,
      });
    } catch (err) {
      logger.error(
        { err, customerId },
        "Failed to send wishlist reach-out email",
      );
      res.status(500).json({ error: "Failed to send email" });
      return;
    }

    const [logRow] = await db
      .insert(wishlistOutreachLogTable)
      .values({
        customerId,
        sentByStaffId: req.user!.id,
        personalNote,
      })
      .returning({
        id: wishlistOutreachLogTable.id,
        sentAt: wishlistOutreachLogTable.sentAt,
      });

    const outreachLogId = logRow!.id;
    await db.insert(wishlistOutreachLogItemsTable).values(
      itemIds.map((wishlistItemId) => ({
        outreachLogId,
        wishlistItemId,
      })),
    );
    await db.insert(wishlistStatusHistoryTable).values({
      wishlistId: wishlistRow.id,
      eventType: "reach_out_sent",
      outreachLogId,
      staffUserId: req.user!.id,
    });

    res.json({
      customerEmail: recipient.email,
      sentAt: (logRow?.sentAt ?? new Date()).toISOString(),
      itemIds,
    });
  },
);

export default router;
