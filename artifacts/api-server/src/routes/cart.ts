import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
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
} from "@workspace/db";
import {
  GetCartResponse,
  AddCartItemBody,
  UpdateCartItemBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

async function getOrCreateCart(userId: number) {
  const [existing] = await db
    .select()
    .from(cartsTable)
    .where(eq(cartsTable.userId, userId))
    .limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(cartsTable)
    .values({ userId })
    .returning();
  return created;
}

async function loadCart(userId: number) {
  const cart = await getOrCreateCart(userId);

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
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    res.json(await loadCart(req.user!.id));
  },
);

router.delete(
  "/cart",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const cart = await getOrCreateCart(req.user!.id);
    await db.delete(cartItemsTable).where(eq(cartItemsTable.cartId, cart.id));
    res.json(await loadCart(req.user!.id));
  },
);

router.post(
  "/cart/items",
  requireAuth,
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
        quoteOnly: productsTable.quoteOnly,
      })
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
    if (requiresFabric && !fabricId) {
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
    if (variantId) {
      const [variant] = await db
        .select({
          id: productVariantsTable.id,
          priceAdjustment: productVariantsTable.priceAdjustment,
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
    }

    if (fabricId) {
      const [option] = await db
        .select({ id: productFabricOptionsTable.id })
        .from(productFabricOptionsTable)
        .innerJoin(
          fabricsTable,
          eq(fabricsTable.id, productFabricOptionsTable.fabricId),
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
    }

    const basePriceStr =
      product.salePrice && Number(product.salePrice) > 0
        ? product.salePrice
        : product.price;
    if (!basePriceStr) {
      res.status(400).json({ error: "Product has no price set" });
      return;
    }
    const snapshotPrice = (Number(basePriceStr) + variantPriceAdj).toFixed(2);

    const cart = await getOrCreateCart(req.user!.id);

    // Atomic upsert against the partial unique index on
    // (cart_id, product_id, COALESCE(variant_id,0), COALESCE(fabric_id,0)) so
    // concurrent adds of the same tuple merge into a single row instead of
    // racing into duplicates.
    await db.execute(sql`
      INSERT INTO cart_items (cart_id, product_id, variant_id, fabric_id, quantity, price)
      VALUES (
        ${cart.id}, ${productId}, ${variantId}, ${fabricId},
        ${quantity}, ${snapshotPrice}
      )
      ON CONFLICT (cart_id, product_id, (COALESCE(variant_id, 0)), (COALESCE(fabric_id, 0)))
      DO UPDATE SET quantity = cart_items.quantity + EXCLUDED.quantity
    `);

    res.json(await loadCart(req.user!.id));
  },
);

router.patch(
  "/cart/items/:itemId",
  requireAuth,
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

    const cart = await getOrCreateCart(req.user!.id);
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

    res.json(await loadCart(req.user!.id));
  },
);

router.delete(
  "/cart/items/:itemId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const itemId = Number(req.params.itemId);
    if (!Number.isInteger(itemId) || itemId <= 0) {
      res.status(400).json({ error: "Invalid itemId" });
      return;
    }
    const cart = await getOrCreateCart(req.user!.id);
    await db
      .delete(cartItemsTable)
      .where(
        and(
          eq(cartItemsTable.id, itemId),
          eq(cartItemsTable.cartId, cart.id),
        ),
      );
    res.json(await loadCart(req.user!.id));
  },
);

export default router;
