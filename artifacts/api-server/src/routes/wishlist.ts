import { Router, type IRouter, type Request, type Response } from "express";
import { aliasedTable } from "drizzle-orm/alias";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import {
  db,
  wishlistItemsTable,
  wishlistsTable,
  wishlistStatusHistoryTable,
  productsTable,
  productImagesTable,
  manufacturersTable,
  categoriesTable,
  finishesTable,
  fabricsTable,
  productVariantsTable,
  usersTable,
  customersTable,
} from "@workspace/db";
import {
  GetWishlistResponse,
  AddWishlistItemBody,
  MergeWishlistBody,
  RemoveWishlistItemBody,
} from "@workspace/api-zod";
import { optionalAuth, requireAuth } from "../middlewares/requireAuth";
import { toPublicImageUrl } from "../lib/imageUrl";
import { getOrCreateCustomer } from "./account";
import { sendWishlistDisclosureEmail } from "../lib/email";
import { generateWishlistNumber } from "../lib/wishlistNumber";
import { getBaseUrl } from "../lib/baseUrl";
import { logger } from "../lib/logger";

// Wishlist parent record (Brief 7, Step 5): created the first time a
// signed-in customer ever saves a wishlist item. One row per customer,
// holding the shared WISH-XXXXXXXX-XXXX reference number. Safe to call
// unconditionally — `onConflictDoNothing` handles the race where two
// first-ever saves land concurrently for the same customer. Returns the
// wishlist's id so callers can log status-history events against it
// (Brief 07B, Step 2B).
async function ensureWishlistParent(customerId: number): Promise<number> {
  await db
    .insert(wishlistsTable)
    .values({ customerId, wishlistNumber: generateWishlistNumber() })
    .onConflictDoNothing({ target: wishlistsTable.customerId });

  const [row] = await db
    .select({ id: wishlistsTable.id })
    .from(wishlistsTable)
    .where(eq(wishlistsTable.customerId, customerId))
    .limit(1);
  return row!.id;
}

// Fires the one-time wishlist disclosure email (Brief 7, Step 4) the first
// time a signed-in customer ever saves a wishlist item. Best-effort: email
// failures are logged, never surfaced to the caller or allowed to fail the
// wishlist save itself.
async function maybeSendWishlistDisclosureEmail(
  customerId: number,
  wasFirstSaveEver: boolean,
  productName: string,
): Promise<void> {
  if (!wasFirstSaveEver) return;

  const [customer] = await db
    .select({
      email: usersTable.email,
      firstName: usersTable.firstName,
      marketingOptOut: customersTable.marketingOptOut,
    })
    .from(customersTable)
    .leftJoin(usersTable, eq(usersTable.id, customersTable.userId))
    .where(eq(customersTable.id, customerId))
    .limit(1);

  if (!customer || !customer.email || customer.marketingOptOut) return;

  try {
    const baseUrl = getBaseUrl();
    const accountSettingsUrl = `${baseUrl}/account`;
    await sendWishlistDisclosureEmail({
      to: customer.email,
      firstName: customer.firstName,
      productName,
      accountSettingsUrl,
    });
  } catch (err) {
    logger.error(
      { err, customerId },
      "Failed to send wishlist disclosure email",
    );
  }
}

const router: IRouter = Router();

// Postgres unique-violation SQLSTATE. Used to map a lost insert race on the
// guest partial unique index to the deterministic 409/replace flow.
function isUniqueViolation(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "23505"
  );
}

type WishlistScope = { userId: number } | { deviceToken: string };

// Load a wishlist for either a signed-in user (by userId) or a guest device
// (by deviceToken, where user_id IS NULL). Returns the GetWishlistResponse
// shape including each row's saved configuration ids and resolved names.
async function loadWishlist(scope: WishlistScope) {
  const ownerWhere =
    "userId" in scope
      ? eq(wishlistItemsTable.userId, scope.userId)
      : and(
          eq(wishlistItemsTable.deviceToken, scope.deviceToken),
          isNull(wishlistItemsTable.userId),
        );

  // Alias finishesTable twice: once for the frame finish, once for the tile.
  const frameFinishes = aliasedTable(finishesTable, "frame_finishes");
  const tileFinishes = aliasedTable(finishesTable, "tile_finishes");

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
      msrp: productsTable.msrp,
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
      selectedFinishId: wishlistItemsTable.selectedFinishId,
      selectedFabricId: wishlistItemsTable.selectedFabricId,
      selectedTableTopTileId: wishlistItemsTable.selectedTableTopTileId,
      // Resolved selection names — mirrors cart.ts join pattern.
      finishName: frameFinishes.name,
      fabricName: fabricsTable.name,
      fabricItemNumber: fabricsTable.itemNumber,
      tileName: tileFinishes.name,
      variantLabel: wishlistItemsTable.variantLabel,
      // Real variant SKU — null when no variant was selected.
      variantSku: productVariantsTable.variantSku,
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
    .leftJoin(
      fabricsTable,
      eq(fabricsTable.id, wishlistItemsTable.selectedFabricId),
    )
    .leftJoin(
      frameFinishes,
      eq(frameFinishes.id, wishlistItemsTable.selectedFinishId),
    )
    .leftJoin(
      tileFinishes,
      eq(tileFinishes.id, wishlistItemsTable.selectedTableTopTileId),
    )
    .leftJoin(
      productVariantsTable,
      eq(productVariantsTable.id, wishlistItemsTable.variantId),
    )
    .where(and(ownerWhere, eq(productsTable.isActive, true)))
    .orderBy(desc(wishlistItemsTable.createdAt));

  return GetWishlistResponse.parse({
    items: rows.map((r) => ({
      ...r,
      // Resolve to the real variant SKU when a variant was chosen; fall back
      // to the product SKU for products with no size selection.
      sku: r.variantSku ?? r.sku,
      primaryImageUrl: toPublicImageUrl(r.primaryImageUrl),
      createdAt:
        r.createdAt instanceof Date
          ? r.createdAt.toISOString()
          : String(r.createdAt),
    })),
  });
}

// Key used to dedupe identical configurations of the same product. Treats
// missing selections as null so two rows match only when product + all three
// selection ids are identical.
function configKey(o: {
  productId: number;
  selectedFinishId: number | null;
  selectedFabricId: number | null;
  selectedTableTopTileId: number | null;
  variantId?: number | null;
}): string {
  return [
    o.productId,
    o.selectedFinishId ?? "",
    o.selectedFabricId ?? "",
    o.selectedTableTopTileId ?? "",
    o.variantId ?? "",
  ].join(":");
}

router.get(
  "/wishlist",
  optionalAuth,
  async (req: Request, res: Response): Promise<void> => {
    if (req.user) {
      res.json(await loadWishlist({ userId: req.user.id }));
      return;
    }
    const deviceToken =
      typeof req.query.deviceToken === "string" ? req.query.deviceToken : "";
    if (!deviceToken) {
      res.json(GetWishlistResponse.parse({ items: [] }));
      return;
    }
    res.json(await loadWishlist({ deviceToken }));
  },
);

router.post(
  "/wishlist",
  optionalAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AddWishlistItemBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const {
      productId,
      deviceToken,
      selectedFinishId,
      selectedFabricId,
      selectedTableTopTileId,
      variantLabel,
      variantId,
      replaceExisting,
    } = parsed.data;

    // Wishlist may hold non-purchasable products (e.g. most O.W. Lee items),
    // so only require the product to be active — not available online.
    const [product] = await db
      .select({ id: productsTable.id, name: productsTable.name })
      .from(productsTable)
      .where(
        and(eq(productsTable.id, productId), eq(productsTable.isActive, true)),
      )
      .limit(1);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }

    const config = {
      selectedFinishId: selectedFinishId ?? null,
      selectedFabricId: selectedFabricId ?? null,
      selectedTableTopTileId: selectedTableTopTileId ?? null,
      variantLabel: variantLabel ?? null,
      variantId: variantId ?? null,
    };

    // Signed-in users may save multiple configurations of the same product.
    // We only skip an insert when an identical configuration already exists.
    if (req.user) {
      const existing = await db
        .select({
          id: wishlistItemsTable.id,
          selectedFinishId: wishlistItemsTable.selectedFinishId,
          selectedFabricId: wishlistItemsTable.selectedFabricId,
          selectedTableTopTileId: wishlistItemsTable.selectedTableTopTileId,
          variantId: wishlistItemsTable.variantId,
        })
        .from(wishlistItemsTable)
        .where(
          and(
            eq(wishlistItemsTable.userId, req.user.id),
            eq(wishlistItemsTable.productId, productId),
          ),
        );
      const targetKey = configKey({ productId, ...config });
      const dup = existing.some(
        (e) => configKey({ productId, ...e }) === targetKey,
      );
      if (!dup) {
        const customer = await getOrCreateCustomer(req.user.id);

        // "First save ever" per Brief 7 Step 4: zero existing wishlist_items
        // rows for this customer_id at the moment of insert. Checked before
        // the insert below, scoped to customerId (not userId) so it reflects
        // the customer-account-level rule the brief specifies.
        const [{ value: existingCount }] = await db
          .select({ value: count() })
          .from(wishlistItemsTable)
          .where(eq(wishlistItemsTable.customerId, customer.id));
        const wasFirstSaveEver = existingCount === 0;

        await db.insert(wishlistItemsTable).values({
          userId: req.user.id,
          customerId: customer.id,
          productId,
          ...config,
        });

        const wishlistId = await ensureWishlistParent(customer.id);

        // Brief 07B, Step 2B: log the item_added event. Customer-triggered,
        // so staffUserId stays null.
        await db.insert(wishlistStatusHistoryTable).values({
          wishlistId,
          eventType: "item_added",
          productId,
        });

        await maybeSendWishlistDisclosureEmail(
          customer.id,
          wasFirstSaveEver,
          product.name,
        );
      }
      res.json(await loadWishlist({ userId: req.user.id }));
      return;
    }

    // Guests must identify themselves with a device token.
    if (!deviceToken) {
      res.status(400).json({ error: "deviceToken is required for guests" });
      return;
    }

    // One configuration per product per device. If a row already exists,
    // either overwrite it (replaceExisting) or signal a conflict so the
    // client can prompt the guest to sign in / create an account / replace.
    const [existingGuest] = await db
      .select({ id: wishlistItemsTable.id })
      .from(wishlistItemsTable)
      .where(
        and(
          eq(wishlistItemsTable.deviceToken, deviceToken),
          eq(wishlistItemsTable.productId, productId),
          isNull(wishlistItemsTable.userId),
        ),
      )
      .limit(1);

    if (existingGuest) {
      if (!replaceExisting) {
        res.status(409).json({
          error: "A saved configuration already exists for this product",
        });
        return;
      }
      await db
        .update(wishlistItemsTable)
        .set(config)
        .where(eq(wishlistItemsTable.id, existingGuest.id));
      res.json(await loadWishlist({ deviceToken }));
      return;
    }

    try {
      await db
        .insert(wishlistItemsTable)
        .values({ deviceToken, productId, ...config });
    } catch (err) {
      // Concurrent add of the same product on the same device races past the
      // pre-check above and hits the partial unique index
      // (device_token, product_id) WHERE user_id IS NULL. Map that to the same
      // conflict/replace flow instead of leaking a 500.
      if (isUniqueViolation(err)) {
        if (!replaceExisting) {
          res.status(409).json({
            error: "A saved configuration already exists for this product",
          });
          return;
        }
        await db
          .update(wishlistItemsTable)
          .set(config)
          .where(
            and(
              eq(wishlistItemsTable.deviceToken, deviceToken),
              eq(wishlistItemsTable.productId, productId),
              isNull(wishlistItemsTable.userId),
            ),
          );
      } else {
        throw err;
      }
    }

    res.json(await loadWishlist({ deviceToken }));
  },
);

// Merge a guest device's wishlist into the signed-in user's wishlist. Called
// automatically by the client's auth success handler after sign-in/sign-up.
router.post(
  "/wishlist/merge",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = MergeWishlistBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const { deviceToken } = parsed.data;
    const userId = req.user!.id;

    const guestRows = await db
      .select({
        id: wishlistItemsTable.id,
        productId: wishlistItemsTable.productId,
        selectedFinishId: wishlistItemsTable.selectedFinishId,
        selectedFabricId: wishlistItemsTable.selectedFabricId,
        selectedTableTopTileId: wishlistItemsTable.selectedTableTopTileId,
        variantId: wishlistItemsTable.variantId,
      })
      .from(wishlistItemsTable)
      .where(
        and(
          eq(wishlistItemsTable.deviceToken, deviceToken),
          isNull(wishlistItemsTable.userId),
        ),
      );

    if (guestRows.length > 0) {
      const existing = await db
        .select({
          productId: wishlistItemsTable.productId,
          selectedFinishId: wishlistItemsTable.selectedFinishId,
          selectedFabricId: wishlistItemsTable.selectedFabricId,
          selectedTableTopTileId: wishlistItemsTable.selectedTableTopTileId,
          variantId: wishlistItemsTable.variantId,
        })
        .from(wishlistItemsTable)
        .where(eq(wishlistItemsTable.userId, userId));
      const existingKeys = new Set(existing.map((e) => configKey(e)));

      for (const row of guestRows) {
        if (existingKeys.has(configKey(row))) {
          // Identical config already saved for this user — drop the orphan
          // guest row instead of leaving it stranded.
          await db
            .delete(wishlistItemsTable)
            .where(eq(wishlistItemsTable.id, row.id));
        } else {
          await db
            .update(wishlistItemsTable)
            .set({ userId, deviceToken: null })
            .where(eq(wishlistItemsTable.id, row.id));
          existingKeys.add(configKey(row));
        }
      }
    }

    res.json(await loadWishlist({ userId }));
  },
);

router.delete(
  "/wishlist/:id",
  optionalAuth,
  async (req: Request, res: Response): Promise<void> => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }

    if (req.user) {
      const deleted = await db
        .delete(wishlistItemsTable)
        .where(
          and(
            eq(wishlistItemsTable.id, id),
            eq(wishlistItemsTable.userId, req.user.id),
          ),
        )
        .returning({ id: wishlistItemsTable.id });
      if (deleted.length === 0) {
        res.status(404).json({ error: "Wishlist item not found" });
        return;
      }
      res.json(await loadWishlist({ userId: req.user.id }));
      return;
    }

    const parsed = RemoveWishlistItemBody.safeParse(req.body ?? {});
    const deviceToken = parsed.success ? parsed.data.deviceToken : null;
    if (!deviceToken) {
      res.status(400).json({ error: "deviceToken is required for guests" });
      return;
    }
    const deleted = await db
      .delete(wishlistItemsTable)
      .where(
        and(
          eq(wishlistItemsTable.id, id),
          eq(wishlistItemsTable.deviceToken, deviceToken),
          isNull(wishlistItemsTable.userId),
        ),
      )
      .returning({ id: wishlistItemsTable.id });
    if (deleted.length === 0) {
      res.status(404).json({ error: "Wishlist item not found" });
      return;
    }
    res.json(await loadWishlist({ deviceToken }));
  },
);

export default router;
