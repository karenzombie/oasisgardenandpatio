import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  cartsTable,
  cartItemsTable,
  productsTable,
  productImagesTable,
  manufacturersTable,
  productVariantsTable,
  productFabricOptionsTable,
  fabricsTable,
  finishesTable,
  variantGradePricesTable,
  productFinishPoolsTable,
  productFinishOptionsTable,
} from "@workspace/db";
import {
  GetCartResponse,
  AddCartItemBody,
  UpdateCartItemBody,
} from "@workspace/api-zod";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

/**
 * Resolve which cart owner identity to use for the request. Authenticated
 * customers are keyed by `userId`; guests fall back to the session id (the
 * connect.sid value), which lets the cart persist across page reloads in the
 * same browser without an account.
 */
type CartOwner = { userId: number } | { sessionId: string };

function ownerFor(req: Request): CartOwner {
  if (req.session.userId) return { userId: req.session.userId };
  return { sessionId: req.session.id };
}

/**
 * Express session is configured with `saveUninitialized: false`, which means
 * the session cookie is NOT sent until something is written to `req.session`.
 * Guest carts use `req.session.id` as the cart key, so without this marker
 * the browser would receive a fresh session id on every request and lose
 * its cart between page loads. Setting `guestCart` and forcing a save on the
 * first guest interaction guarantees a stable session id from then on.
 */
async function ensureSessionPersisted(req: Request): Promise<void> {
  if (req.session.userId) return; // authed sessions are already persisted
  if (req.session.guestCart) return;
  req.session.guestCart = true;
  await new Promise<void>((resolve, reject) => {
    req.session.save((err) => (err ? reject(err) : resolve()));
  });
}

async function getOrCreateCart(owner: CartOwner) {
  if ("userId" in owner) {
    const [existing] = await db
      .select()
      .from(cartsTable)
      .where(eq(cartsTable.userId, owner.userId))
      .limit(1);
    if (existing) return existing;
    const [created] = await db
      .insert(cartsTable)
      .values({ userId: owner.userId })
      .returning();
    return created;
  }
  // Guest cart keyed by session id. Only consider rows where userId IS NULL —
  // a session id should never alias an existing user cart.
  const [existing] = await db
    .select()
    .from(cartsTable)
    .where(
      and(
        eq(cartsTable.sessionId, owner.sessionId),
        isNull(cartsTable.userId),
      ),
    )
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(cartsTable)
    .values({ sessionId: owner.sessionId })
    .returning();
  return created;
}

async function loadCart(owner: CartOwner) {
  const cart = await getOrCreateCart(owner);

  const rows = await db
    .select({
      id: cartItemsTable.id,
      productId: productsTable.id,
      name: productsTable.name,
      slug: productsTable.slug,
      sku: productsTable.sku,
      manufacturerName: manufacturersTable.name,
      availableOnline: productsTable.availableOnline,
      unitPrice: cartItemsTable.price,
      quantity: cartItemsTable.quantity,
      variantId: cartItemsTable.variantId,
      variantName: productVariantsTable.variantName,
      finishId: cartItemsTable.finishId,
      finishName: finishesTable.name,
      fabricId: cartItemsTable.fabricId,
      fabricName: fabricsTable.name,
      fabricItemNumber: fabricsTable.itemNumber,
      primaryImageUrl: sql<string | null>`(
        select ${productImagesTable.url}
        from ${productImagesTable}
        where ${productImagesTable.productId} = ${productsTable.id}
          and ${productImagesTable.imageKind} = 'gallery'
        order by ${productImagesTable.isPrimary} desc, ${productImagesTable.displayOrder} asc, ${productImagesTable.id} asc
        limit 1
      )`,
    })
    .from(cartItemsTable)
    .innerJoin(
      productsTable,
      eq(productsTable.id, cartItemsTable.productId),
    )
    .leftJoin(
      manufacturersTable,
      eq(manufacturersTable.id, productsTable.manufacturerId),
    )
    .leftJoin(
      productVariantsTable,
      eq(productVariantsTable.id, cartItemsTable.variantId),
    )
    .leftJoin(fabricsTable, eq(fabricsTable.id, cartItemsTable.fabricId))
    .leftJoin(finishesTable, eq(finishesTable.id, cartItemsTable.finishId))
    .where(eq(cartItemsTable.cartId, cart.id))
    .orderBy(cartItemsTable.id);

  let itemCount = 0;
  let subtotal = 0;
  const items = rows.map((r) => {
    itemCount += r.quantity;
    const line = Number(r.unitPrice) * r.quantity;
    subtotal += line;
    return {
      ...r,
      primaryImageUrl: toPublicImageUrl(r.primaryImageUrl),
      unitPrice: String(r.unitPrice),
      lineTotal: line.toFixed(2),
    };
  });

  return GetCartResponse.parse({
    items,
    itemCount,
    subtotal: subtotal.toFixed(2),
  });
}

router.get(
  "/cart",
  async (req: Request, res: Response): Promise<void> => {
    await ensureSessionPersisted(req);
    res.json(await loadCart(ownerFor(req)));
  },
);

router.delete(
  "/cart",
  async (req: Request, res: Response): Promise<void> => {
    await ensureSessionPersisted(req);
    const owner = ownerFor(req);
    const cart = await getOrCreateCart(owner);
    await db.delete(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id));
    res.json(await loadCart(owner));
  },
);

router.post(
  "/cart/items",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AddCartItemBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const productId = parsed.data.productId;
    const quantity = parsed.data.quantity ?? 1;
    const variantId = parsed.data.variantId ?? null;
    const fabricId = parsed.data.fabricId ?? null;
    const finishId = parsed.data.finishId ?? null;
    if (!Number.isInteger(productId) || productId <= 0) {
      res.status(400).json({ error: "Invalid productId" });
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      res.status(400).json({ error: "Quantity must be a positive integer" });
      return;
    }

    const [product] = await db
      .select({
        id: productsTable.id,
        price: productsTable.price,
        salePrice: productsTable.salePrice,
        frameOnlyPrice: productsTable.frameOnlyPrice,
        quoteOnly: productsTable.quoteOnly,
        manufacturerName: manufacturersTable.name,
      })
      .from(productsTable)
      .leftJoin(
        manufacturersTable,
        eq(manufacturersTable.id, productsTable.manufacturerId),
      )
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
    if (product.quoteOnly) {
      res.status(400).json({
        error:
          "This product is sold through a sales agent only and cannot be added to the cart.",
      });
      return;
    }

    // Determine which option groups this product requires.
    const variantCountRow = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(productVariantsTable)
      .where(
        and(
          eq(productVariantsTable.productId, productId),
          eq(productVariantsTable.isActive, true),
        ),
      );
    const requiresVariant = (variantCountRow[0]?.n ?? 0) > 0;

    // Count only ACTIVE fabrics linked to this product so the server matches
    // what the PDP exposes (PDP filters fabricsTable.isActive=true).
    const fabricCountRow = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(productFabricOptionsTable)
      .innerJoin(
        fabricsTable,
        eq(fabricsTable.id, productFabricOptionsTable.fabricId),
      )
      .where(
        and(
          eq(productFabricOptionsTable.productId, productId),
          eq(fabricsTable.isActive, true),
        ),
      );
    const requiresFabric = (fabricCountRow[0]?.n ?? 0) > 0;

    if (requiresVariant && !variantId) {
      res.status(400).json({
        error:
          "Please choose a finish (or other variant) before adding this item to your cart.",
      });
      return;
    }
    if (!requiresVariant && variantId) {
      res
        .status(400)
        .json({ error: "This product does not have variant options." });
      return;
    }
    // A product with fabrics can still be added without a fabric when a
    // frame-only price is configured — the customer explicitly chose to
    // buy just the frame/structure with no cushion/fabric.
    const supportsFrameOnly =
      requiresFabric && product.frameOnlyPrice != null;
    if (requiresFabric && !fabricId && !supportsFrameOnly) {
      res.status(400).json({
        error: "Please choose a fabric before adding this item to your cart.",
      });
      return;
    }
    if (!requiresFabric && fabricId) {
      res
        .status(400)
        .json({ error: "This product does not have fabric options." });
      return;
    }

    let variantPriceAdj = 0;
    // Absolute per-variant line price (e.g. per-size rugs). When set, it
    // replaces base price + priceAdjustment for the snapshot below.
    let variantAbsoluteBase: number | null = null;
    // Grade-mode state. Populated only for grade-priced products (Frankford):
    // when a variant carries per-grade prices, the line price is driven by the
    // selected fabric's grade rather than base price + adjustment.
    let variantNotes: {
      minOrderQty: number | null;
      excludeStripeFabrics: boolean;
    } | null = null;
    let gradePriceMap: Map<string, { msrp: string; salePrice: string }> | null =
      null;
    if (variantId) {
      const [variant] = await db
        .select({
          id: productVariantsTable.id,
          priceAdjustment: productVariantsTable.priceAdjustment,
          msrp: productVariantsTable.msrp,
          salePrice: productVariantsTable.salePrice,
          minOrderQty: productVariantsTable.minOrderQty,
          excludeStripeFabrics: productVariantsTable.excludeStripeFabrics,
        })
        .from(productVariantsTable)
        .where(
          and(
            eq(productVariantsTable.id, variantId),
            eq(productVariantsTable.productId, productId),
            eq(productVariantsTable.isActive, true),
          ),
        )
        .limit(1);
      if (!variant) {
        res
          .status(400)
          .json({ error: "Selected variant is not available for this product." });
        return;
      }
      variantPriceAdj = Number(variant.priceAdjustment ?? 0);
      // Absolute per-variant pricing (e.g. per-size rugs): when the variant
      // carries its own MSRP, the line price is the variant's sale price (or
      // MSRP when there's no sale) and the product base price + priceAdjustment
      // are NOT applied. Legacy variants leave msrp null and keep base + adj.
      if (variant.msrp != null) {
        const vSale = variant.salePrice != null ? Number(variant.salePrice) : 0;
        variantAbsoluteBase = vSale > 0 ? vSale : Number(variant.msrp);
      }
      variantNotes = {
        minOrderQty: variant.minOrderQty ?? null,
        excludeStripeFabrics: variant.excludeStripeFabrics ?? false,
      };

      const gradeRows = await db
        .select({
          grade: variantGradePricesTable.grade,
          msrp: variantGradePricesTable.msrp,
          salePrice: variantGradePricesTable.salePrice,
        })
        .from(variantGradePricesTable)
        .where(eq(variantGradePricesTable.variantId, variantId));
      if (gradeRows.length > 0) {
        gradePriceMap = new Map(
          gradeRows.map((g) => [
            g.grade,
            { msrp: String(g.msrp), salePrice: String(g.salePrice) },
          ]),
        );
      }
    }

    const isGradeMode = gradePriceMap !== null;

    // Grade-priced products always require a fabric (it drives the line price),
    // so the frame-only shortcut allowed above never applies in grade mode.
    if (isGradeMode && !fabricId) {
      res.status(400).json({
        error: "Please choose a fabric before adding this item to your cart.",
      });
      return;
    }

    // Frame finish: in grade mode the finish is required ONLY when the product
    // exposes discrete finish options (pool-expanded mfr finishes or individually
    // picked options). Finish-in-variant products (e.g. Treasure Garden market
    // umbrellas) carry the finish in the chosen variant, so no separate finishId
    // applies — it is rejected if sent. Non-grade products never take a finish.
    if (isGradeMode) {
      // Resolve the product's allowed finish set = pool-expanded mfr finishes
      // UNION individually-picked finish options.
      const poolMfrRows = await db
        .select({ manufacturerId: productFinishPoolsTable.manufacturerId })
        .from(productFinishPoolsTable)
        .where(eq(productFinishPoolsTable.productId, productId));
      const poolMfrIds = poolMfrRows.map((p) => p.manufacturerId);
      const pooledIds = poolMfrIds.length
        ? (
            await db
              .select({ id: finishesTable.id })
              .from(finishesTable)
              .where(
                and(
                  inArray(finishesTable.manufacturerId, poolMfrIds),
                  eq(finishesTable.isActive, true),
                ),
              )
          ).map((f) => f.id)
        : [];
      const optionIds = (
        await db
          .select({ finishId: productFinishOptionsTable.finishId })
          .from(productFinishOptionsTable)
          .where(eq(productFinishOptionsTable.productId, productId))
      ).map((o) => o.finishId);
      const allowedFinishIds = new Set([...pooledIds, ...optionIds]);
      const hasDiscreteFinishes = allowedFinishIds.size > 0;
      if (hasDiscreteFinishes) {
        if (!finishId) {
          res
            .status(400)
            .json({ error: "Please choose a frame finish before adding this item." });
          return;
        }
        if (!allowedFinishIds.has(finishId)) {
          res
            .status(400)
            .json({ error: "Selected frame finish is not offered for this product." });
          return;
        }
      } else if (finishId) {
        res
          .status(400)
          .json({ error: "This product does not have frame finish options." });
        return;
      }
    } else if (finishId) {
      res
        .status(400)
        .json({ error: "This product does not have frame finish options." });
      return;
    }

    // Grade-mode line price (set when the selected fabric's grade maps to a
    // variant grade price). Falls back to base-price math when null.
    let gradeLinePrice: string | null = null;
    if (fabricId) {
      const [option] = await db
        .select({
          id: productFabricOptionsTable.id,
          isStripe: fabricsTable.isStripe,
          grade: fabricsTable.grade,
          fabricManufacturerName: manufacturersTable.name,
        })
        .from(productFabricOptionsTable)
        .innerJoin(
          fabricsTable,
          eq(fabricsTable.id, productFabricOptionsTable.fabricId),
        )
        .leftJoin(
          manufacturersTable,
          eq(manufacturersTable.id, fabricsTable.manufacturerId),
        )
        .where(
          and(
            eq(productFabricOptionsTable.productId, productId),
            eq(productFabricOptionsTable.fabricId, fabricId),
            eq(fabricsTable.isActive, true),
          ),
        )
        .limit(1);
      if (!option) {
        res
          .status(400)
          .json({ error: "Selected fabric is not offered for this product." });
        return;
      }
      // Stripe fabrics must be ordered in even pairs. The incoming quantity must
      // be >= 2 and even; because the upsert below sums quantities, even + even
      // stays even, so a single-umbrella add is rejected up front.
      if (option.isStripe && (quantity < 2 || quantity % 2 !== 0)) {
        res.status(400).json({
          error:
            "Striped fabrics must be ordered in pairs. Please choose an even quantity of 2 or more.",
        });
        return;
      }

      if (isGradeMode) {
        // Frankford grade pricing: the selected fabric's grade picks the price
        // row. Stripe exclusion and min-order-qty come from the variant.
        if (variantNotes?.excludeStripeFabrics && option.isStripe) {
          res.status(400).json({
            error: "Stripe fabrics are not available for this configuration.",
          });
          return;
        }
        const grade = option.grade ?? "";
        const gp = gradePriceMap?.get(grade);
        if (!gp) {
          res.status(400).json({
            error:
              "The selected fabric grade is not available for this configuration.",
          });
          return;
        }
        gradeLinePrice =
          Number(gp.salePrice) > 0 ? gp.salePrice : gp.msrp;
      }
    }

    // Minimum order quantity floor (grade-mode configurations only). The upsert
    // sums quantities, so we only enforce that this single add meets the floor.
    if (
      isGradeMode &&
      variantNotes?.minOrderQty != null &&
      quantity < variantNotes.minOrderQty
    ) {
      res.status(400).json({
        error: `This configuration has a minimum order quantity of ${variantNotes.minOrderQty}.`,
      });
      return;
    }

    let snapshotPrice: string;
    if (gradeLinePrice !== null) {
      // Grade-priced line: price is the full per-grade price (already includes
      // the configuration). No base price or variant adjustment is added.
      snapshotPrice = Number(gradeLinePrice).toFixed(2);
    } else if (variantAbsoluteBase !== null) {
      // Absolute per-variant line (e.g. per-size rug): use the variant's own
      // sale/MSRP price. Base price + variant adjustment are not applied.
      snapshotPrice = variantAbsoluteBase.toFixed(2);
    } else {
      // Frame-only orders use frameOnlyPrice; otherwise fall through to
      // salePrice → price as usual. Variant price adjustments still apply
      // on top of either base.
      const isFrameOnly = supportsFrameOnly && !fabricId;
      let basePriceStr: string | null;
      if (isFrameOnly) {
        basePriceStr = product.frameOnlyPrice;
      } else {
        basePriceStr =
          product.salePrice && Number(product.salePrice) > 0
            ? product.salePrice
            : product.price;
      }
      if (!basePriceStr) {
        res.status(400).json({ error: "Product has no price set" });
        return;
      }
      snapshotPrice = (Number(basePriceStr) + variantPriceAdj).toFixed(2);
    }

    await ensureSessionPersisted(req);
    const owner = ownerFor(req);
    const cart = await getOrCreateCart(owner);

    // Atomic upsert against the partial unique index on
    // (cart_id, product_id, COALESCE(variant_id,0), COALESCE(finish_id,0),
    // COALESCE(fabric_id,0)) so concurrent adds of the same tuple merge into a
    // single row instead of racing into duplicates.
    await db.execute(sql`
      INSERT INTO cart_items (cart_id, product_id, variant_id, finish_id, fabric_id, quantity, price)
      VALUES (
        ${cart.id}, ${productId}, ${variantId}, ${finishId}, ${fabricId},
        ${quantity}, ${snapshotPrice}
      )
      ON CONFLICT (cart_id, product_id, (COALESCE(variant_id, 0)), (COALESCE(finish_id, 0)), (COALESCE(fabric_id, 0)))
      DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
    `);

    res.json(await loadCart(owner));
  },
);

router.patch(
  "/cart/items/:itemId",
  async (req: Request, res: Response): Promise<void> => {
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      res.status(400).json({ error: "Invalid itemId" });
      return;
    }
    const parsed = UpdateCartItemBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    if (!Number.isInteger(parsed.data.quantity) || parsed.data.quantity < 1) {
      res.status(400).json({ error: "Quantity must be a positive integer" });
      return;
    }

    await ensureSessionPersisted(req);
    const owner = ownerFor(req);
    const cart = await getOrCreateCart(owner);

    // Look up the item's fabric (if any) so we can enforce the stripe pair rule
    // on quantity changes, not just on add-to-cart. Also pull the variant's
    // minimum order quantity to keep the grade-mode floor enforced on edits.
    const [existing] = await db
      .select({
        isStripe: fabricsTable.isStripe,
        minOrderQty: productVariantsTable.minOrderQty,
      })
      .from(cartItemsTable)
      .leftJoin(fabricsTable, eq(fabricsTable.id, cartItemsTable.fabricId))
      .leftJoin(
        productVariantsTable,
        eq(productVariantsTable.id, cartItemsTable.variantId),
      )
      .where(
        and(eq(cartItemsTable.id, itemId), eq(cartItemsTable.cartId, cart.id)),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Cart item not found" });
      return;
    }
    if (
      existing.isStripe &&
      (parsed.data.quantity < 2 || parsed.data.quantity % 2 !== 0)
    ) {
      res.status(400).json({
        error:
          "Striped fabrics must be ordered in pairs. Please choose an even quantity of 2 or more.",
      });
      return;
    }
    if (
      existing.minOrderQty != null &&
      parsed.data.quantity < existing.minOrderQty
    ) {
      res.status(400).json({
        error: `This configuration has a minimum order quantity of ${existing.minOrderQty}.`,
      });
      return;
    }

    const result = await db
      .update(cartItemsTable)
      .set({ quantity: parsed.data.quantity })
      .where(
        and(
          eq(cartItemsTable.id, itemId),
          eq(cartItemsTable.cartId, cart.id),
        ),
      )
      .returning({ id: cartItemsTable.id });

    if (result.length === 0) {
      res.status(404).json({ error: "Cart item not found" });
      return;
    }

    res.json(await loadCart(owner));
  },
);

router.delete(
  "/cart/items/:itemId",
  async (req: Request, res: Response): Promise<void> => {
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      res.status(400).json({ error: "Invalid itemId" });
      return;
    }
    await ensureSessionPersisted(req);
    const owner = ownerFor(req);
    const cart = await getOrCreateCart(owner);
    await db
      .delete(cartItemsTable)
      .where(
        and(
          eq(cartItemsTable.id, itemId),
          eq(cartItemsTable.cartId, cart.id),
        ),
      );
    res.json(await loadCart(owner));
  },
);

export default router;
