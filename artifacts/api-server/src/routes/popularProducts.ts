import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  productsTable,
  productImagesTable,
  manufacturersTable,
  categoriesTable,
} from "@workspace/db";
import { GetPopularProductResponse } from "@workspace/api-zod";
import { toPublicImageUrl } from "../lib/imageUrl";
import { computeStartingPrices } from "../lib/startingPrices";

const router: IRouter = Router();

const REFRESH_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const SCORING_WINDOW_DAYS = 90;
const ORDER_WEIGHT = 3;
const WISHLIST_WEIGHT = 1;

type CachedPopular = {
  product: unknown;
  refreshedAt: string;
};

let cache: CachedPopular | null = null;
let cacheExpiresAt = 0;
let inFlight: Promise<CachedPopular> | null = null;

async function computePopularProduct(req: Request): Promise<CachedPopular> {
  const since = new Date(
    Date.now() - SCORING_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  );

  // Use raw qualified column references inside the correlated subqueries to
  // avoid `column "id" is ambiguous` — drizzle's column interpolation drops
  // the table prefix in these subselects.
  const scored = await db.execute<{ product_id: number; score: number }>(sql`
    SELECT
      p.id AS product_id,
      (
        COALESCE((
          SELECT SUM(oi.quantity)::int
          FROM order_items oi
          INNER JOIN orders o ON o.id = oi.order_id
          WHERE oi.product_id = p.id
            AND o.placed_at >= ${since}
            AND o.status <> 'cancelled'
        ), 0) * ${ORDER_WEIGHT}
        +
        COALESCE((
          SELECT COUNT(*)::int
          FROM wishlist_items wi
          WHERE wi.product_id = p.id
            AND wi.created_at >= ${since}
        ), 0) * ${WISHLIST_WEIGHT}
      )::int AS score
    FROM products p
    WHERE p.is_active = true
      AND p.available_online = true
    ORDER BY score DESC, p.id ASC
    LIMIT 1
  `);

  let chosenId: number | null = null;
  const top = scored.rows[0];
  if (top && Number(top.score) > 0) {
    chosenId = Number(top.product_id);
  }

  // Fallback when there's no purchase / wishlist signal yet: pick the most
  // recently created active, online product so the homepage tile is never
  // empty on a cold install.
  if (chosenId === null) {
    const [fallback] = await db
      .select({ id: productsTable.id })
      .from(productsTable)
      .where(
        and(
          eq(productsTable.isActive, true),
          eq(productsTable.availableOnline, true),
        ),
      )
      .orderBy(sql`${productsTable.featured} DESC, ${productsTable.id} DESC`)
      .limit(1);
    chosenId = fallback?.id ?? null;
  }

  let product: unknown = null;
  if (chosenId !== null) {
    const [row] = await db
      .select({
        id: productsTable.id,
        name: productsTable.name,
        slug: productsTable.slug,
        sku: productsTable.sku,
        manufacturerName: manufacturersTable.name,
        categoryName: categoriesTable.name,
        price: productsTable.price,
        salePrice: productsTable.salePrice,
        showPriceOnline: productsTable.showPriceOnline,
        availableOnline: productsTable.availableOnline,
        primaryImageUrl: sql<string | null>`(
          select ${productImagesTable.url}
          from ${productImagesTable}
          where ${productImagesTable.productId} = ${productsTable.id}
          order by ${productImagesTable.isPrimary} desc, ${productImagesTable.displayOrder} asc, ${productImagesTable.id} asc
          limit 1
        )`,
      })
      .from(productsTable)
      .leftJoin(
        manufacturersTable,
        eq(manufacturersTable.id, productsTable.manufacturerId),
      )
      .leftJoin(
        categoriesTable,
        eq(categoriesTable.id, productsTable.categoryId),
      )
      .where(eq(productsTable.id, chosenId))
      .limit(1);

    if (row) {
      const starting = (await computeStartingPrices([row.id])).get(row.id);
      product = {
        ...row,
        manufacturerName: row.manufacturerName ?? "",
        categoryName: row.categoryName ?? "",
        primaryImageUrl: toPublicImageUrl(row.primaryImageUrl),
        priceVaries: starting?.priceVaries ?? false,
        startingPrice: starting?.startingPrice ?? null,
        startingSalePrice: starting?.startingSalePrice ?? null,
      };
    }
  }

  const result: CachedPopular = {
    product,
    refreshedAt: new Date().toISOString(),
  };
  req.log?.info(
    { productId: chosenId, windowDays: SCORING_WINDOW_DAYS },
    "popular product refreshed",
  );
  return result;
}

router.get(
  "/products/popular",
  async (req: Request, res: Response): Promise<void> => {
    const now = Date.now();
    if (cache && now < cacheExpiresAt) {
      res.json(GetPopularProductResponse.parse(cache));
      return;
    }

    // Coalesce concurrent refreshes so a thundering herd hits the DB once.
    if (!inFlight) {
      inFlight = computePopularProduct(req)
        .then((fresh) => {
          cache = fresh;
          cacheExpiresAt = Date.now() + REFRESH_INTERVAL_MS;
          return fresh;
        })
        .finally(() => {
          inFlight = null;
        });
    }

    try {
      const fresh = await inFlight;
      res.json(GetPopularProductResponse.parse(fresh));
    } catch (err) {
      req.log?.error({ err }, "failed to compute popular product");
      // Serve a stale cache if we still have one rather than 500-ing the homepage.
      if (cache) {
        res.json(GetPopularProductResponse.parse(cache));
        return;
      }
      res.status(500).json({ error: "Could not load popular product" });
    }
  },
);

export default router;
