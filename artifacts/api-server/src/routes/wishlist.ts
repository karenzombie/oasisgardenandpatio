import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  wishlistItemsTable,
  productsTable,
  productImagesTable,
  manufacturersTable,
  categoriesTable,
} from "@workspace/db";
import {
  GetWishlistResponse,
  AddWishlistItemBody,
  SyncWishlistBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

async function loadWishlist(userId: number) {
  const rows = await db
    .select({
      id: wishlistItemsTable.id,
      productId: productsTable.id,
      name: productsTable.name,
      slug: productsTable.slug,
      sku: productsTable.sku,
      manufacturerName: manufacturersTable.name,
      categoryName: categoriesTable.name,
      price: productsTable.price,
      salePrice: productsTable.salePrice,
      showPriceOnline: productsTable.showPriceOnline,
      availableOnline: productsTable.availableOnline,
      quoteOnly: productsTable.quoteOnly,
      primaryImageUrl: sql<string | null>`(
        select ${productImagesTable.url}
        from ${productImagesTable}
        where ${productImagesTable.productId} = ${productsTable.id}
          and ${productImagesTable.imageKind} = 'gallery'
        order by ${productImagesTable.isPrimary} desc, ${productImagesTable.displayOrder} asc, ${productImagesTable.id} asc
        limit 1
      )`,
      createdAt: wishlistItemsTable.createdAt,
    })
    .from(wishlistItemsTable)
    .innerJoin(
      productsTable,
      eq(productsTable.id, wishlistItemsTable.productId),
    )
    .leftJoin(
      manufacturersTable,
      eq(manufacturersTable.id, productsTable.manufacturerId),
    )
    .leftJoin(
      categoriesTable,
      eq(categoriesTable.id, productsTable.categoryId),
    )
    .where(eq(wishlistItemsTable.userId, userId))
    .orderBy(desc(wishlistItemsTable.createdAt));

  return GetWishlistResponse.parse({
    items: rows.map((r) => ({
      ...r,
      primaryImageUrl: toPublicImageUrl(r.primaryImageUrl),
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    })),
  });
}

router.get(
  "/wishlist",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const payload = await loadWishlist(req.user!.id);
    res.json(payload);
  },
);

router.post(
  "/wishlist",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AddWishlistItemBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const { productId } = parsed.data;

    // Confirm the product exists, is active and available online — same
    // visibility rule as PLP/PDP. Don't allow saving hidden products.
    const [product] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.id, productId),
          eq(productsTable.isActive, true),
          eq(productsTable.availableOnline, true),
        ),
      )
      .limit(1);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    await db
      .insert(wishlistItemsTable)
      .values({ userId: req.user!.id, productId })
      .onConflictDoNothing({
        target: [wishlistItemsTable.userId, wishlistItemsTable.productId],
      });

    res.json(await loadWishlist(req.user!.id));
  },
);

// Bulk merge endpoint used by the client immediately after sign-up or login
// to drain the localStorage-held "guest" wishlist into the user's persistent
// wishlist. Existing entries are silently skipped via ON CONFLICT DO NOTHING.
router.post(
  "/wishlist/sync",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = SyncWishlistBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const ids = Array.from(
      new Set(parsed.data.productIds.filter((n) => Number.isInteger(n) && n > 0)),
    );
    if (ids.length === 0) {
      res.json(await loadWishlist(req.user!.id));
      return;
    }

    // Filter to products that are actually visible. Hidden / inactive /
    // archived products silently drop out of the merge.
    const visible = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(
        and(
          inArray(productsTable.id, ids),
          eq(productsTable.isActive, true),
          eq(productsTable.availableOnline, true),
        ),
      );

    if (visible.length > 0) {
      await db
        .insert(wishlistItemsTable)
        .values(visible.map((p) => ({ userId: req.user!.id, productId: p.id })))
        .onConflictDoNothing({
          target: [wishlistItemsTable.userId, wishlistItemsTable.productId],
        });
    }

    res.json(await loadWishlist(req.user!.id));
  },
);

router.delete(
  "/wishlist/:productId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const productId = Number(req.params.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: "Invalid productId" });
      return;
    }
    await db
      .delete(wishlistItemsTable)
      .where(
        and(
          eq(wishlistItemsTable.userId, req.user!.id),
          eq(wishlistItemsTable.productId, productId),
        ),
      );
    res.json(await loadWishlist(req.user!.id));
  },
);

export default router;
