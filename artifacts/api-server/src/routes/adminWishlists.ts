import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, ilike, max, or, sql } from "drizzle-orm";
import {
  db,
  wishlistsTable,
  wishlistItemsTable,
  customersTable,
  productsTable,
} from "@workspace/db";
import {
  AdminListWishlistsQueryParams,
  AdminGetWishlistParams,
} from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";
import { generateWishlistPdf } from "../lib/wishlistPdf";

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
  price: string | null;
} | null): number | null {
  if (!product) return null;
  return money(product.salePrice) ?? money(product.price);
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

async function loadWishlistDetail(customerId: number) {
  const [wishlist] = await db
    .select({
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

  const itemRows = await db
    .select({
      id: wishlistItemsTable.id,
      productId: wishlistItemsTable.productId,
      variantLabel: wishlistItemsTable.variantLabel,
      quantity: wishlistItemsTable.quantity,
      createdAt: wishlistItemsTable.createdAt,
      productName: productsTable.name,
      productSku: productsTable.sku,
      price: productsTable.price,
      salePrice: productsTable.salePrice,
    })
    .from(wishlistItemsTable)
    .leftJoin(productsTable, eq(productsTable.id, wishlistItemsTable.productId))
    .where(eq(wishlistItemsTable.customerId, customerId))
    .orderBy(desc(wishlistItemsTable.createdAt));

  let subtotal = 0;
  let hasUnpricedItems = false;
  const items = itemRows.map((r) => {
    const unitPrice = livePrice(
      r.productId ? { price: r.price, salePrice: r.salePrice } : null,
    );
    const amount = unitPrice !== null ? unitPrice * r.quantity : null;
    if (amount === null) hasUnpricedItems = true;
    else subtotal += amount;
    return {
      id: r.id,
      productId: r.productId,
      description: r.productName ?? "(product no longer available)",
      sku: r.productSku ?? null,
      variantLabel: r.variantLabel,
      quantity: r.quantity,
      unitPrice,
      amount,
      addedAt: r.createdAt.toISOString(),
    };
  });

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

export default router;
