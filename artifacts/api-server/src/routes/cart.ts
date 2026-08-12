import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  db,
  cartsTable,
  cartItemsTable,
  cartItemAddonsTable,
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
  productFinialOptionsTable,
  productAddonOptionsTable,
  productAddonGradePricesTable,
  productStemOptionsTable,
  productCoverOptionsTable,
  productCoverFinishPricesTable,
} from "@workspace/db";
import {
  GetCartResponse,
  AddCartItemBody,
  UpdateCartItemBody,
} from "@workspace/api-zod";
import { toPublicImageUrl } from "../lib/imageUrl";
import {
  loadShippingConfig,
  computeShippingForLines,
  type ShippableRuleLine,
} from "../lib/shippingRules";

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
      categoryId: productsTable.categoryId,
      manufacturerId: productsTable.manufacturerId,
      subCategory: productsTable.subCategory,
      weight: productsTable.weight,
      unitPrice: cartItemsTable.price,
      quantity: cartItemsTable.quantity,
      parentCartItemId: cartItemsTable.parentCartItemId,
      selectedModelCode: cartItemsTable.selectedModelCode,
      variantId: cartItemsTable.variantId,
      variantName: productVariantsTable.variantName,
      finishId: cartItemsTable.finishId,
      finishName: finishesTable.name,
      finialId: cartItemsTable.finialId,
      finialName: productFinialOptionsTable.name,
      fabricId: cartItemsTable.fabricId,
      fabricName: fabricsTable.name,
      fabricItemNumber: fabricsTable.itemNumber,
      fabricIsStripe: sql<boolean>`coalesce(${fabricsTable.isStripe}, false)`,
      variantMinOrderQty: productVariantsTable.minOrderQty,
      finishMinOrderQty: sql<number | null>`(
        select ${productFinishOptionsTable.minOrderQty}
        from ${productFinishOptionsTable}
        where ${productFinishOptionsTable.productId} = ${productsTable.id}
          and ${productFinishOptionsTable.finishId} = ${cartItemsTable.finishId}
        limit 1
      )`,
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
    .leftJoin(
      productFinialOptionsTable,
      eq(productFinialOptionsTable.id, cartItemsTable.finialId),
    )
    .where(eq(cartItemsTable.cartId, cart.id))
    .orderBy(cartItemsTable.id);

  // Fold in add-on lines (e.g. Marella privacy walls). Each add-on carries its
  // own per-unit price snapshot; the line total = (base + sum(addon units)) * qty.
  const itemIds = rows.map((r) => r.id);
  const addonRows = itemIds.length
    ? await db
        .select({
          cartItemId: cartItemAddonsTable.cartItemId,
          addonOptionId: cartItemAddonsTable.addonOptionId,
          unitPrice: cartItemAddonsTable.unitPrice,
          quantity: cartItemAddonsTable.quantity,
          sku: productAddonOptionsTable.sku,
          name: productAddonOptionsTable.name,
          displayOrder: productAddonOptionsTable.displayOrder,
        })
        .from(cartItemAddonsTable)
        .innerJoin(
          productAddonOptionsTable,
          eq(productAddonOptionsTable.id, cartItemAddonsTable.addonOptionId),
        )
        .where(inArray(cartItemAddonsTable.cartItemId, itemIds))
        .orderBy(
          asc(productAddonOptionsTable.displayOrder),
          asc(cartItemAddonsTable.id),
        )
    : [];
  const addonsByItem = new Map<
    number,
    {
      addonOptionId: number;
      unitPrice: string;
      quantity: number;
      sku: string;
      name: string;
    }[]
  >();
  for (const a of addonRows) {
    const list = addonsByItem.get(a.cartItemId) ?? [];
    list.push({
      addonOptionId: a.addonOptionId,
      unitPrice: String(a.unitPrice),
      quantity: a.quantity,
      sku: a.sku,
      name: a.name,
    });
    addonsByItem.set(a.cartItemId, list);
  }

  // Shipping is computed from the staff-managed Shipping rules (the single
  // source of truth). Percentage rules apply to the base unit price × qty
  // (add-ons excluded). Per-line amounts stack; the weight tier adds once.
  const shippingConfig = await loadShippingConfig();
  const shippingLines: ShippableRuleLine[] = rows.map((r) => ({
    key: r.id,
    productId: r.productId,
    categoryId: r.categoryId,
    subCategory: r.subCategory,
    manufacturerId: r.manufacturerId,
    unitPriceCents: Math.round(Number(r.unitPrice) * 100),
    quantity: r.quantity,
    weightLbs: r.weight == null ? null : Number(r.weight),
  }));
  const shippingResult = computeShippingForLines(shippingConfig, shippingLines);

  let itemCount = 0;
  let subtotal = 0;
  const items = rows.map((r) => {
    itemCount += r.quantity;
    const lineAddons = addonsByItem.get(r.id) ?? [];
    const addonUnitSum = lineAddons.reduce(
      (sum, a) => sum + Number(a.unitPrice) * a.quantity,
      0,
    );
    const line = (Number(r.unitPrice) + addonUnitSum) * r.quantity;
    subtotal += line;
    const shipCents = shippingResult.perLineCents.get(r.id) ?? 0;
    // Effective minimum-quantity floor mirrors the update guard: the larger
    // of the variant's minimum and the selected frame finish's minimum. The
    // client stepper uses it so quantities can't be dropped below the floor.
    const variantMin = r.variantMinOrderQty ?? null;
    const finishMin = r.finishMinOrderQty ?? null;
    const minOrderQty =
      variantMin == null && finishMin == null
        ? null
        : Math.max(variantMin ?? 0, finishMin ?? 0);
    const minQtyFromFinish =
      finishMin != null && finishMin >= (variantMin ?? 0);
    return {
      ...r,
      minOrderQty,
      minQtyFromFinish,
      primaryImageUrl: toPublicImageUrl(r.primaryImageUrl),
      unitPrice: String(r.unitPrice),
      lineTotal: line.toFixed(2),
      shippingAmount: (shipCents / 100).toFixed(2),
      parentCartItemId: r.parentCartItemId ?? null,
      // Tied accessory lines (top covers) are grouped under their parent and
      // have their quantity driven by the base, so the customer can't edit it.
      isAccessory: r.parentCartItemId != null,
      quantityLocked: r.parentCartItemId != null,
      addons: lineAddons.map((a) => ({
        addonOptionId: a.addonOptionId,
        sku: a.sku,
        name: a.name,
        unitPrice: a.unitPrice,
        quantity: a.quantity,
        lineAmount: (Number(a.unitPrice) * a.quantity * r.quantity).toFixed(2),
      })),
    };
  });

  return GetCartResponse.parse({
    items,
    itemCount,
    subtotal: subtotal.toFixed(2),
    shipping: (shippingResult.totalCents / 100).toFixed(2),
    shippingWeightAmount: (shippingResult.weightCents / 100).toFixed(2),
    shippingWeightLbs: shippingResult.totalWeightLbs,
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
    await ensureSessionPersisted(req);
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
    const finialId = parsed.data.finialId ?? null;
    // Optional galvanized-base accessories (resolved + validated below).
    const stemProductId = parsed.data.stemProductId ?? null;
    const coverFinishId = parsed.data.coverFinishId ?? null;
    const selectedModelCode = parsed.data.selectedModelCode ?? null;
    // Requested add-on option ids (e.g. Marella privacy walls). Dedup + drop any
    // non-positive ids; validated against the product below.
    const requestedAddonIds = Array.from(
      new Set(
        (parsed.data.addonOptionIds ?? []).filter(
          (id) => Number.isInteger(id) && id > 0,
        ),
      ),
    );
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
        msrp: productsTable.msrp,
        frameOnlyPrice: productsTable.frameOnlyPrice,
        quoteOnly: productsTable.quoteOnly,
        availableOnline: productsTable.availableOnline,
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
        ),
      )
      .limit(1);

    if (!product) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    if (!product.availableOnline) {
      res.status(400).json({
        error:
          "This product is available by inquiry only and cannot be added to the cart. Please contact us for pricing and availability.",
      });
      return;
    }
    if (product.quoteOnly) {
      res.status(400).json({
        error:
          "This product is sold through a sales agent only and cannot be added to the cart.",
      });
      return;
    }
    // Server-side price safety net: a product that is purchasable but has no
    // usable price must never be sellable. Mirrors the PDP's hasPrice logic
    // (price or salePrice non-null and > 0).
    const hasUsablePrice =
      (product.msrp != null && Number(product.msrp) > 0) ||
      (product.salePrice != null && Number(product.salePrice) > 0);
    // Products where pricing lives entirely in variants (absolute per-variant
    // msrp/salePrice) may carry no base product price. Allow the add when a
    // variantId was supplied — the absolute variant price is resolved below and
    // used as the snapshot. If the variant itself has no price, the fallback
    // `basePriceStr` null-check below catches it with a clear 400.
    if (!hasUsablePrice && variantId == null) {
      res.status(400).json({
        error:
          "This product does not have a price set and cannot be added to the cart. Please contact us for pricing and availability.",
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
    let gradePriceMap: Map<string, { msrp: string; salePrice: string | null }> | null =
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
            {
              msrp: String(g.msrp),
              salePrice: g.salePrice != null ? String(g.salePrice) : null,
            },
          ]),
        );
      }
    }

    const isGradeMode = gradePriceMap !== null;

    // Grade-priced frame-only: a reserved "Frame Only" grade row on the
    // configuration (e.g. OW Lee seating) makes the frame + finish purchasable
    // without a fabric, priced from that row. Fabric grades never use this
    // label. Without that row, grade mode always requires a fabric (it drives
    // the line price).
    const frameOnlyGradeRow = gradePriceMap?.get("Frame Only") ?? null;
    if (isGradeMode && !fabricId && !frameOnlyGradeRow) {
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
      // Resolve the product's allowed finish set. Explicit product_finish_options
      // rows are the full and only set when present; the manufacturer's finish
      // pool is used ONLY as a fallback when the product has no explicit options
      // wired, since a pool expands to EVERY active finish for that manufacturer
      // (which may include unrelated finish types from other collections).
      const optionIds = (
        await db
          .select({ finishId: productFinishOptionsTable.finishId })
          .from(productFinishOptionsTable)
          .where(eq(productFinishOptionsTable.productId, productId))
      ).map((o) => o.finishId);

      let pooledIds: number[] = [];
      if (optionIds.length === 0) {
        const poolMfrRows = await db
          .select({ manufacturerId: productFinishPoolsTable.manufacturerId })
          .from(productFinishPoolsTable)
          .where(eq(productFinishPoolsTable.productId, productId));
        const poolMfrIds = poolMfrRows.map((p) => p.manufacturerId);
        pooledIds = poolMfrIds.length
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
      }
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

    // Finial (umbrella pole-cap) selection. Required when the product exposes
    // finial options; rejected when it does not. The selected finial's sale
    // upcharge is folded into the line price below.
    let finialUpchargeSale = 0;
    {
      const finialOptionRows = await db
        .select({
          id: productFinialOptionsTable.id,
          upchargeSale: productFinialOptionsTable.upchargeSale,
        })
        .from(productFinialOptionsTable)
        .where(
          and(
            eq(productFinialOptionsTable.productId, productId),
            eq(productFinialOptionsTable.isActive, true),
          ),
        );
      const allowedFinial = new Map(
        finialOptionRows.map((f) => [f.id, Number(f.upchargeSale)]),
      );
      const hasFinialOptions = allowedFinial.size > 0;
      if (hasFinialOptions) {
        if (!finialId) {
          res
            .status(400)
            .json({ error: "Please choose a finial before adding this item." });
          return;
        }
        if (!allowedFinial.has(finialId)) {
          res
            .status(400)
            .json({ error: "Selected finial is not offered for this product." });
          return;
        }
        finialUpchargeSale = allowedFinial.get(finialId) ?? 0;
      } else if (finialId) {
        res
          .status(400)
          .json({ error: "This product does not have finial options." });
        return;
      }
    }

    // Grade-mode line price (set when the selected fabric's grade maps to a
    // variant grade price). Falls back to base-price math when null.
    let gradeLinePrice: string | null = null;
    // Canopy fabric grade (drives per_grade add-on pricing, e.g. Marella walls).
    let canopyGrade: string | null = null;
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

      canopyGrade = option.grade ?? null;
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
          gp.salePrice != null && Number(gp.salePrice) > 0
            ? gp.salePrice
            : gp.msrp;
      }
    }

    // Minimum order quantity floor. Two independent sources can raise the floor:
    //   1. the variant (grade-mode configurations, e.g. striped fabric), and
    //   2. the selected frame finish (special finishes carry their own minimum).
    // The effective floor is the larger of the two. The upsert sums quantities,
    // so we only enforce that this single add meets the floor.
    let effectiveMinQty: number | null =
      isGradeMode && variantNotes?.minOrderQty != null
        ? variantNotes.minOrderQty
        : null;
    if (finishId) {
      const [finishOpt] = await db
        .select({ minOrderQty: productFinishOptionsTable.minOrderQty })
        .from(productFinishOptionsTable)
        .where(
          and(
            eq(productFinishOptionsTable.productId, productId),
            eq(productFinishOptionsTable.finishId, finishId),
          ),
        )
        .limit(1);
      if (finishOpt?.minOrderQty != null) {
        effectiveMinQty =
          effectiveMinQty == null
            ? finishOpt.minOrderQty
            : Math.max(effectiveMinQty, finishOpt.minOrderQty);
      }
    }
    if (effectiveMinQty != null && quantity < effectiveMinQty) {
      res.status(400).json({
        error: `This configuration has a minimum order quantity of ${effectiveMinQty}.`,
      });
      return;
    }

    // Grade-mode frame-only line: no fabric selected, price from the reserved
    // "Frame Only" grade row (sale when set and > 0, else MSRP).
    if (isGradeMode && !fabricId && frameOnlyGradeRow) {
      gradeLinePrice =
        frameOnlyGradeRow.salePrice != null &&
        Number(frameOnlyGradeRow.salePrice) > 0
          ? frameOnlyGradeRow.salePrice
          : frameOnlyGradeRow.msrp;
    }

    let snapshotPrice: string;
    if (gradeLinePrice !== null) {
      // Grade-priced line: price is the full per-grade price (already includes
      // the configuration). No base price or variant adjustment is added.
      // Explicitly-picked frame finishes may carry a per-product upcharge; add
      // the customer-facing (sale) upcharge so the cart matches the PDP price.
      // Pooled finishes have no option row, so this resolves to 0.
      let finishUpchargeSale = 0;
      if (finishId) {
        const [opt] = await db
          .select({ upchargeSale: productFinishOptionsTable.upchargeSale })
          .from(productFinishOptionsTable)
          .where(
            and(
              eq(productFinishOptionsTable.productId, productId),
              eq(productFinishOptionsTable.finishId, finishId),
            ),
          )
          .limit(1);
        if (opt) finishUpchargeSale = Number(opt.upchargeSale);
      }
      snapshotPrice = (Number(gradeLinePrice) + finishUpchargeSale).toFixed(2);
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
            : product.msrp;
      }
      if (!basePriceStr) {
        res.status(400).json({ error: "Product has no price set" });
        return;
      }
      snapshotPrice = (Number(basePriceStr) + variantPriceAdj).toFixed(2);
    }

    // Fold the selected finial's sale upcharge into every pricing branch so the
    // cart line matches the PDP price.
    if (finialUpchargeSale > 0) {
      snapshotPrice = (Number(snapshotPrice) + finialUpchargeSale).toFixed(2);
    }

    // -----------------------------------------------------------------------
    // Resolve add-ons (e.g. Marella privacy walls). Build the final set of
    // add-on option ids (with enforced pairing) and a per-unit price for each.
    // -----------------------------------------------------------------------
    const resolvedAddons: {
      addonOptionId: number;
      unitPrice: string;
      quantity: number;
    }[] = [];
    if (requestedAddonIds.length > 0) {
      // Load every enabled add-on option for this product so we can validate
      // the request and apply pairing entirely from server-side data.
      const productAddons = await db
        .select({
          id: productAddonOptionsTable.id,
          pricingMode: productAddonOptionsTable.pricingMode,
          flatMsrp: productAddonOptionsTable.flatMsrp,
          flatSalePrice: productAddonOptionsTable.flatSalePrice,
          triggersPairing: productAddonOptionsTable.triggersPairing,
          isPairingTarget: productAddonOptionsTable.isPairingTarget,
        })
        .from(productAddonOptionsTable)
        .where(
          and(
            eq(productAddonOptionsTable.productId, productId),
            eq(productAddonOptionsTable.enabled, true),
          ),
        );
      const addonById = new Map(productAddons.map((a) => [a.id, a]));

      // Every requested id must be an enabled add-on of this product.
      for (const id of requestedAddonIds) {
        if (!addonById.has(id)) {
          res.status(400).json({
            error: "Selected add-on is not offered for this product.",
          });
          return;
        }
      }

      // Enforced pairing: if any selected add-on triggers pairing, every
      // pairing-target add-on is auto-required and added to the line. The
      // catalog requires ONE pairing-target unit (a half-curtain pair) PER
      // triggering wall, so pairCount drives the target add-on's quantity —
      // two walls (FW + SW) yield two HC pairs, not one.
      const finalIds = new Set(requestedAddonIds);
      const pairCount = requestedAddonIds.filter(
        (id) => addonById.get(id)?.triggersPairing,
      ).length;
      if (pairCount > 0) {
        for (const a of productAddons) {
          if (a.isPairingTarget) finalIds.add(a.id);
        }
      }

      // Resolve a per-unit price for each add-on. per_grade tracks the canopy
      // fabric grade; flat uses the flat columns. sale>0 ? sale : msrp.
      let gradePriceByAddon: Map<
        number,
        { msrp: string; salePrice: string }
      > | null = null;
      const perGradeIds = [...finalIds].filter(
        (id) => addonById.get(id)?.pricingMode === "per_grade",
      );
      if (perGradeIds.length > 0) {
        if (!canopyGrade) {
          res.status(400).json({
            error:
              "Please choose a fabric before adding these add-ons; their price depends on the canopy fabric grade.",
          });
          return;
        }
        const gpRows = await db
          .select({
            addonOptionId: productAddonGradePricesTable.addonOptionId,
            grade: productAddonGradePricesTable.grade,
            msrp: productAddonGradePricesTable.msrp,
            salePrice: productAddonGradePricesTable.salePrice,
          })
          .from(productAddonGradePricesTable)
          .where(
            and(
              inArray(productAddonGradePricesTable.addonOptionId, perGradeIds),
              eq(productAddonGradePricesTable.grade, canopyGrade),
            ),
          );
        gradePriceByAddon = new Map(
          gpRows.map((r) => [
            r.addonOptionId,
            { msrp: String(r.msrp), salePrice: String(r.salePrice) },
          ]),
        );
      }

      for (const id of finalIds) {
        const a = addonById.get(id)!;
        let unit: string | null = null;
        if (a.pricingMode === "per_grade") {
          const gp = gradePriceByAddon?.get(id);
          if (!gp) {
            res.status(400).json({
              error:
                "The selected add-on is not available for this fabric grade.",
            });
            return;
          }
          unit = Number(gp.salePrice) > 0 ? gp.salePrice : gp.msrp;
        } else {
          const flatSale = a.flatSalePrice;
          const flatMsrp = a.flatMsrp;
          if (flatSale != null && Number(flatSale) > 0) {
            unit = String(flatSale);
          } else if (flatMsrp != null && Number(flatMsrp) > 0) {
            unit = String(flatMsrp);
          }
          if (unit == null) {
            res
              .status(400)
              .json({ error: "The selected add-on has no price set." });
            return;
          }
        }
        // A pairing target gets one unit per triggering wall; everything else
        // is a single unit per parent-line unit.
        const addonQty = a.isPairingTarget ? Math.max(pairCount, 1) : 1;
        resolvedAddons.push({
          addonOptionId: id,
          unitPrice: unit,
          quantity: addonQty,
        });
      }
    }

    // Signature dedups cart lines that differ only by their add-on set: two
    // otherwise-identical Marella lines (same fabric/finish) with different
    // walls remain separate rows.
    const addonSignature = resolvedAddons
      .map((a) => a.addonOptionId)
      .sort((x, y) => x - y)
      .join(",");

    // -----------------------------------------------------------------------
    // Optional galvanized-base accessories. Each adds a SEPARATE cart line:
    //   - Stem: an independent standalone product line (qty editable).
    //   - Top Cover: a hidden cover product tied 1:1 to the base line (qty
    //     locked, cascade-removed). Price varies by chosen finish.
    // Both are validated against the base product's configured options. The
    // cover finish is folded into the base line's signature so that two bases
    // with different cover finishes stay as distinct base lines (each with its
    // own cover child).
    // -----------------------------------------------------------------------
    let stemLine: { productId: number; price: string } | null = null;
    if (stemProductId != null) {
      if (!Number.isInteger(stemProductId) || stemProductId <= 0) {
        res.status(400).json({ error: "Invalid stemProductId" });
        return;
      }
      const [stem] = await db
        .select({
          id: productsTable.id,
          price: productsTable.price,
          salePrice: productsTable.salePrice,
          msrp: productsTable.msrp,
        })
        .from(productStemOptionsTable)
        .innerJoin(
          productsTable,
          eq(productsTable.id, productStemOptionsTable.stemProductId),
        )
        .where(
          and(
            eq(productStemOptionsTable.baseProductId, productId),
            eq(productStemOptionsTable.stemProductId, stemProductId),
            eq(productsTable.isActive, true),
          ),
        )
        .limit(1);
      if (!stem) {
        res
          .status(400)
          .json({ error: "The selected stem is not offered for this product." });
        return;
      }
      const stemSale =
        stem.salePrice != null && Number(stem.salePrice) > 0
          ? Number(stem.salePrice)
          : null;
      const stemPrice = stemSale ?? (stem.msrp != null ? Number(stem.msrp) : null);
      if (stemPrice == null) {
        res.status(400).json({ error: "The selected stem has no price set." });
        return;
      }
      stemLine = { productId: stemProductId, price: stemPrice.toFixed(2) };
    }

    let coverLine: { productId: number; finishId: number; price: string } | null =
      null;
    if (coverFinishId != null) {
      if (!Number.isInteger(coverFinishId) || coverFinishId <= 0) {
        res.status(400).json({ error: "Invalid coverFinishId" });
        return;
      }
      const [cover] = await db
        .select({ coverProductId: productCoverOptionsTable.coverProductId })
        .from(productCoverOptionsTable)
        .where(eq(productCoverOptionsTable.baseProductId, productId))
        .limit(1);
      if (!cover) {
        res
          .status(400)
          .json({ error: "This product does not offer a top cover." });
        return;
      }
      const [coverPrice] = await db
        .select({
          msrp: productCoverFinishPricesTable.msrp,
          salePrice: productCoverFinishPricesTable.salePrice,
        })
        .from(productCoverFinishPricesTable)
        .where(
          and(
            eq(
              productCoverFinishPricesTable.coverProductId,
              cover.coverProductId,
            ),
            eq(productCoverFinishPricesTable.finishId, coverFinishId),
          ),
        )
        .limit(1);
      if (!coverPrice) {
        res
          .status(400)
          .json({ error: "The selected top cover finish is not offered." });
        return;
      }
      const coverSale =
        Number(coverPrice.salePrice) > 0 ? Number(coverPrice.salePrice) : null;
      const price = coverSale ?? Number(coverPrice.msrp);
      coverLine = {
        productId: cover.coverProductId,
        finishId: coverFinishId,
        price: price.toFixed(2),
      };
    }

    // The base line's signature folds in the chosen cover finish so two adds of
    // the same base with different cover colors remain distinct base lines.
    const baseSignature = [
      addonSignature,
      coverFinishId != null ? `cover:${coverFinishId}` : "",
    ]
      .filter(Boolean)
      .join("|");

    await ensureSessionPersisted(req);
    const owner = ownerFor(req);
    const cart = await getOrCreateCart(owner);

    // Atomic upsert against the unique index on
    // (cart_id, product_id, COALESCE(variant_id,0), COALESCE(finish_id,0),
    // COALESCE(fabric_id,0), addon_signature) so concurrent adds of the same
    // tuple merge into a single row instead of racing into duplicates. The
    // add-on rows are inserted in the same transaction so the line + its
    // add-ons are always consistent.
    await db.transaction(async (tx) => {
      const result = await tx.execute<{ id: number }>(sql`
        INSERT INTO cart_items (cart_id, product_id, variant_id, finish_id, finial_id, fabric_id, quantity, price, addon_signature, selected_model_code)
        VALUES (
          ${cart.id}, ${productId}, ${variantId}, ${finishId}, ${finialId}, ${fabricId},
          ${quantity}, ${snapshotPrice}, ${baseSignature}, ${selectedModelCode}
        )
        ON CONFLICT (cart_id, product_id, (COALESCE(variant_id, 0)), (COALESCE(finish_id, 0)), (COALESCE(fabric_id, 0)), (COALESCE(finial_id, 0)), addon_signature)
        DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
        RETURNING id
      `);
      const cartItemId = result.rows[0]?.id;
      if (cartItemId && resolvedAddons.length > 0) {
        await tx
          .insert(cartItemAddonsTable)
          .values(
            resolvedAddons.map((a) => ({
              cartItemId,
              addonOptionId: a.addonOptionId,
              unitPrice: a.unitPrice,
              quantity: a.quantity,
            })),
          )
          .onConflictDoNothing();
      }

      // Independent stem line — a normal standalone product line. Its quantity
      // matches this base add and can be edited/removed on its own afterwards.
      if (stemLine) {
        await tx.execute(sql`
          INSERT INTO cart_items (cart_id, product_id, variant_id, finish_id, finial_id, fabric_id, quantity, price, addon_signature)
          VALUES (
            ${cart.id}, ${stemLine.productId}, NULL, NULL, NULL, NULL,
            ${quantity}, ${stemLine.price}, ''
          )
          ON CONFLICT (cart_id, product_id, (COALESCE(variant_id, 0)), (COALESCE(finish_id, 0)), (COALESCE(fabric_id, 0)), (COALESCE(finial_id, 0)), addon_signature)
          DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
        `);
      }

      // Top cover line — tied 1:1 to the base line (parent_cart_item_id). Its
      // quantity tracks the base add; it cascade-deletes with the base. Because
      // the base signature folds in the cover finish, this cover row maps to
      // exactly one base line, so the conflict-increment keeps them in lockstep.
      if (coverLine && cartItemId) {
        await tx.execute(sql`
          INSERT INTO cart_items (cart_id, product_id, variant_id, finish_id, finial_id, fabric_id, quantity, price, addon_signature, parent_cart_item_id)
          VALUES (
            ${cart.id}, ${coverLine.productId}, NULL, ${coverLine.finishId}, NULL, NULL,
            ${quantity}, ${coverLine.price}, '', ${cartItemId}
          )
          ON CONFLICT (cart_id, product_id, (COALESCE(variant_id, 0)), (COALESCE(finish_id, 0)), (COALESCE(fabric_id, 0)), (COALESCE(finial_id, 0)), addon_signature)
          DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity, parent_cart_item_id = EXCLUDED.parent_cart_item_id
        `);
      }
    });

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
        productId: cartItemsTable.productId,
        finishId: cartItemsTable.finishId,
        parentCartItemId: cartItemsTable.parentCartItemId,
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
    // Tied accessory lines (top covers) have their quantity driven by the base
    // product, so they can't be edited directly.
    if (existing.parentCartItemId != null) {
      res.status(400).json({
        error:
          "This item's quantity is managed by its base product. Update the base item instead.",
      });
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
    // Effective minimum floor mirrors add-to-cart: the larger of the variant's
    // minimum and the selected frame finish's minimum (special finishes carry
    // their own floor). Enforced on edits too so quantity can't drop below it.
    let editMinQty: number | null = existing.minOrderQty ?? null;
    if (existing.finishId != null) {
      const [finishOpt] = await db
        .select({ minOrderQty: productFinishOptionsTable.minOrderQty })
        .from(productFinishOptionsTable)
        .where(
          and(
            eq(productFinishOptionsTable.productId, existing.productId),
            eq(productFinishOptionsTable.finishId, existing.finishId),
          ),
        )
        .limit(1);
      if (finishOpt?.minOrderQty != null) {
        editMinQty =
          editMinQty == null
            ? finishOpt.minOrderQty
            : Math.max(editMinQty, finishOpt.minOrderQty);
      }
    }
    if (editMinQty != null && parsed.data.quantity < editMinQty) {
      res.status(400).json({
        error: `This configuration has a minimum order quantity of ${editMinQty}.`,
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

    // Keep any tied accessory lines (top covers) in lockstep with the base.
    await db
      .update(cartItemsTable)
      .set({ quantity: parsed.data.quantity })
      .where(
        and(
          eq(cartItemsTable.parentCartItemId, itemId),
          eq(cartItemsTable.cartId, cart.id),
        ),
      );

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
    // Tied accessory lines (top covers) can't be removed on their own — they
    // are removed when the base product is removed (FK cascade). Reject a direct
    // delete so the base/cover quantities can't drift out of lockstep.
    const [target] = await db
      .select({ parentCartItemId: cartItemsTable.parentCartItemId })
      .from(cartItemsTable)
      .where(
        and(eq(cartItemsTable.id, itemId), eq(cartItemsTable.cartId, cart.id)),
      )
      .limit(1);
    if (target?.parentCartItemId != null) {
      res.status(400).json({
        error:
          "This top cover is removed together with its base product. Remove the base item to remove it.",
      });
      return;
    }
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
