import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  cartsTable,
  cartItemsTable,
  productsTable,
  productImagesTable,
  manufacturersTable,
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

    const snapshotPrice =
      product.salePrice && Number(product.salePrice) > 0
        ? product.salePrice
        : product.price;
    if (!snapshotPrice) {
      res.status(400).json({ error: "Product has no price set" });
      return;
    }

    const cart = await getOrCreateCart(req.user!.id);

    // If a line item for this product (no variant/fabric) already exists,
    // increase the quantity instead of inserting a duplicate row.
    const [existing] = await db
      .select()
      .from(cartItemsTable)
      .where(
        and(
          eq(cartItemsTable.cartId, cart.id),
          eq(cartItemsTable.productId, productId),
          sql`${cartItemsTable.variantId} is null`,
          sql`${cartItemsTable.fabricId} is null`,
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(cartItemsTable)
        .set({ quantity: existing.quantity + quantity })
        .where(eq(cartItemsTable.id, existing.id));
    } else {
      await db.insert(cartItemsTable).values({
        cartId: cart.id,
        productId,
        quantity,
        price: snapshotPrice,
      });
    }

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
