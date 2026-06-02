import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, desc, eq, inArray, or, sql } from "drizzle-orm";
import {
  db,
  customersTable,
  addressesTable,
  ordersTable,
  orderItemsTable,
  productsTable,
  fabricsTable,
  finishesTable,
} from "@workspace/db";
import {
  CreateAccountAddressBody,
  ListAccountAddressesResponse,
  ListAccountOrdersResponse,
  GetAccountOrderResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { toPublicImageUrl } from "../lib/imageUrl";

const router: IRouter = Router();

async function getOrCreateCustomer(userId: number) {
  const [existing] = await db
    .select()
    .from(customersTable)
    .where(eq(customersTable.userId, userId))
    .limit(1);
  if (existing) return existing;

  const [user] = await db
    .select()
    .from((await import("@workspace/db")).usersTable)
    .where(
      eq(
        (await import("@workspace/db")).usersTable.id,
        userId,
      ),
    )
    .limit(1);
  if (!user) throw new Error("User not found");

  const [created] = await db
    .insert(customersTable)
    .values({
      userId: user.id,
      email: user.email,
      firstName: user.firstName ?? "",
      lastName: user.lastName ?? "",
      customerType: "residential",
    })
    .returning();
  return created;
}

function serializeAddress(a: typeof addressesTable.$inferSelect) {
  return {
    id: a.id,
    type: a.type,
    recipientName: a.recipientName,
    street1: a.street1,
    street2: a.street2,
    city: a.city,
    state: a.state,
    zip: a.zip,
    country: a.country,
    phone: a.phone,
    isDefault: a.isDefault,
  };
}

async function loadAddresses(userId: number) {
  const customer = await getOrCreateCustomer(userId);
  const rows = await db
    .select()
    .from(addressesTable)
    .where(
      and(
        eq(addressesTable.customerId, customer.id),
        eq(addressesTable.archived, false),
      ),
    )
    .orderBy(desc(addressesTable.isDefault), desc(addressesTable.id));
  return ListAccountAddressesResponse.parse({
    addresses: rows.map(serializeAddress),
  });
}

async function isAddressReferencedByOrders(addressId: number) {
  const [referenced] = await db
    .select({ id: ordersTable.id })
    .from(ordersTable)
    .where(
      or(
        eq(ordersTable.shippingAddressId, addressId),
        eq(ordersTable.billingAddressId, addressId),
      ),
    )
    .limit(1);
  return Boolean(referenced);
}

router.get(
  "/account/addresses",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    res.json(await loadAddresses(req.user!.id));
  },
);

router.post(
  "/account/addresses",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = CreateAccountAddressBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    const customer = await getOrCreateCustomer(req.user!.id);

    await db.transaction(async (tx) => {
      if (data.isDefault) {
        await tx
          .update(addressesTable)
          .set({ isDefault: false })
          .where(eq(addressesTable.customerId, customer.id));
      }
      await tx.insert(addressesTable).values({
        customerId: customer.id,
        type: data.type ?? "shipping",
        recipientName: data.recipientName ?? null,
        street1: data.street1,
        street2: data.street2 ?? null,
        city: data.city,
        state: data.state,
        zip: data.zip,
        country: data.country ?? "US",
        phone: data.phone ?? null,
        isDefault: data.isDefault ?? false,
      });
    });

    res.json(await loadAddresses(req.user!.id));
  },
);

router.patch(
  "/account/addresses/:addressId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const addressId = Number(req.params.addressId);
    if (!Number.isInteger(addressId) || addressId <= 0) {
      res.status(400).json({ error: "Invalid addressId" });
      return;
    }
    const parsed = CreateAccountAddressBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    const customer = await getOrCreateCustomer(req.user!.id);

    const [existing] = await db
      .select()
      .from(addressesTable)
      .where(
        and(
          eq(addressesTable.id, addressId),
          eq(addressesTable.customerId, customer.id),
          eq(addressesTable.archived, false),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    const referenced = await isAddressReferencedByOrders(addressId);
    const nextIsDefault = data.isDefault ?? existing.isDefault;
    const nextValues = {
      customerId: customer.id,
      type: data.type ?? existing.type,
      recipientName: data.recipientName ?? null,
      street1: data.street1,
      street2: data.street2 ?? null,
      city: data.city,
      state: data.state,
      zip: data.zip,
      country: data.country ?? "US",
      phone: data.phone ?? null,
      isDefault: nextIsDefault,
    };

    await db.transaction(async (tx) => {
      if (nextIsDefault) {
        await tx
          .update(addressesTable)
          .set({ isDefault: false })
          .where(eq(addressesTable.customerId, customer.id));
      }
      if (referenced) {
        // Clone-on-edit: keep the original row intact for order history,
        // archive it from the customer's address book, and insert a new
        // active row with the updated values.
        await tx
          .update(addressesTable)
          .set({ archived: true, isDefault: false })
          .where(eq(addressesTable.id, addressId));
        await tx.insert(addressesTable).values(nextValues);
      } else {
        await tx
          .update(addressesTable)
          .set(nextValues)
          .where(eq(addressesTable.id, addressId));
      }
    });

    res.json(await loadAddresses(req.user!.id));
  },
);

router.delete(
  "/account/addresses/:addressId",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const addressId = Number(req.params.addressId);
    if (!Number.isInteger(addressId) || addressId <= 0) {
      res.status(400).json({ error: "Invalid addressId" });
      return;
    }
    const customer = await getOrCreateCustomer(req.user!.id);

    const [existing] = await db
      .select()
      .from(addressesTable)
      .where(
        and(
          eq(addressesTable.id, addressId),
          eq(addressesTable.customerId, customer.id),
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    const referenced = await isAddressReferencedByOrders(addressId);
    if (referenced) {
      // Soft-delete: keep the row attached to its order(s) but hide it
      // from the customer's address book.
      await db
        .update(addressesTable)
        .set({ archived: true, isDefault: false })
        .where(eq(addressesTable.id, addressId));
    } else {
      await db
        .delete(addressesTable)
        .where(eq(addressesTable.id, addressId));
    }

    res.json(await loadAddresses(req.user!.id));
  },
);

router.get(
  "/account/orders",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const customer = await getOrCreateCustomer(req.user!.id);
    const rows = await db
      .select({
        orderNumber: ordersTable.orderNumber,
        placedAt: ordersTable.placedAt,
        status: ordersTable.status,
        total: ordersTable.total,
        itemCount: sql<number>`(
          select coalesce(sum(${orderItemsTable.quantity}), 0)::int
          from ${orderItemsTable}
          where ${orderItemsTable.orderId} = ${ordersTable.id}
        )`,
      })
      .from(ordersTable)
      .where(eq(ordersTable.customerId, customer.id))
      .orderBy(desc(ordersTable.placedAt));

    res.json(
      ListAccountOrdersResponse.parse({
        orders: rows.map((r) => ({
          orderNumber: r.orderNumber,
          placedAt:
            r.placedAt instanceof Date
              ? r.placedAt.toISOString()
              : String(r.placedAt),
          status: r.status,
          total: String(r.total),
          itemCount: r.itemCount,
        })),
      }),
    );
  },
);

router.get(
  "/account/orders/:orderNumber",
  async (req: Request, res: Response): Promise<void> => {
    const orderNumber = String(req.params.orderNumber);
    // Authenticated customers can fetch any of their own orders. Guests can
    // only fetch orders that the current session itself just placed (recorded
    // in `req.session.guestOrders` by /checkout). This is what powers the
    // post-checkout confirmation page for guests.
    const guestOrderNumbers = req.session.guestOrders ?? [];
    const isGuestSelfFetch =
      !req.session.userId && guestOrderNumbers.includes(orderNumber);
    if (!req.session.userId && !isGuestSelfFetch) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const orderWhere = req.session.userId
      ? and(
          eq(ordersTable.orderNumber, orderNumber),
          eq(
            ordersTable.customerId,
            (await getOrCreateCustomer(req.session.userId)).id,
          ),
        )
      : eq(ordersTable.orderNumber, orderNumber);
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(orderWhere)
      .limit(1);
    if (!order) {
      res.status(404).json({ error: "Order not found" });
      return;
    }

    const items = await db
      .select({
        id: orderItemsTable.id,
        productId: orderItemsTable.productId,
        slug: productsTable.slug,
        description: orderItemsTable.description,
        productSku: orderItemsTable.productSkuSnapshot,
        unitPrice: orderItemsTable.unitPrice,
        quantity: orderItemsTable.quantity,
        amount: orderItemsTable.amount,
        finishName: orderItemsTable.variantNameSnapshot,
        fabricName: orderItemsTable.fabricNameSnapshot,
        fabricItemNumber: orderItemsTable.fabricItemNumberSnapshot,
        swatchImageUrl: fabricsTable.swatchImageUrl,
        manufacturerId: productsTable.manufacturerId,
      })
      .from(orderItemsTable)
      .leftJoin(
        productsTable,
        eq(productsTable.id, orderItemsTable.productId),
      )
      .leftJoin(fabricsTable, eq(fabricsTable.id, orderItemsTable.fabricId))
      .where(eq(orderItemsTable.orderId, order.id))
      .orderBy(orderItemsTable.id);

    // Resolve finish swatch images. Finishes are a separate catalog entity; the
    // order item only snapshots the finish name, so match by manufacturer + name
    // (case-insensitive). Build one lookup keyed by "manufacturerId::lowername".
    const finishKeys = items
      .filter((i) => i.manufacturerId != null && i.finishName)
      .map((i) => ({ mfr: i.manufacturerId as number, name: i.finishName as string }));
    const finishSwatchByKey = new Map<string, string>();
    if (finishKeys.length > 0) {
      const mfrIds = Array.from(new Set(finishKeys.map((k) => k.mfr)));
      const finishRows = await db
        .select({
          manufacturerId: finishesTable.manufacturerId,
          name: finishesTable.name,
          imageUrl: finishesTable.imageUrl,
        })
        .from(finishesTable)
        .where(
          and(
            inArray(finishesTable.manufacturerId, mfrIds),
            eq(finishesTable.isActive, true),
          ),
        )
        .orderBy(asc(finishesTable.displayOrder), asc(finishesTable.id));
      for (const f of finishRows) {
        if (!f.imageUrl) continue;
        const key = `${f.manufacturerId}::${f.name.trim().toLowerCase()}`;
        if (!finishSwatchByKey.has(key)) finishSwatchByKey.set(key, f.imageUrl);
      }
    }
    const finishSwatchFor = (
      mfr: number | null,
      name: string | null,
    ): string | null =>
      mfr != null && name
        ? finishSwatchByKey.get(`${mfr}::${name.trim().toLowerCase()}`) ?? null
        : null;

    let shippingAddress = null;
    if (order.shippingAddressId) {
      const [a] = await db
        .select()
        .from(addressesTable)
        .where(eq(addressesTable.id, order.shippingAddressId))
        .limit(1);
      if (a) shippingAddress = serializeAddress(a);
    }
    let billingAddress = null;
    if (order.billingAddressId) {
      const [a] = await db
        .select()
        .from(addressesTable)
        .where(eq(addressesTable.id, order.billingAddressId))
        .limit(1);
      if (a) billingAddress = serializeAddress(a);
    }

    res.json(
      GetAccountOrderResponse.parse({
        orderNumber: order.orderNumber,
        placedAt:
          order.placedAt instanceof Date
            ? order.placedAt.toISOString()
            : String(order.placedAt),
        status: order.status,
        subtotal: String(order.subtotal),
        deliveryAmount: String(order.deliveryAmount),
        taxAmount: String(order.taxAmount),
        total: String(order.total),
        shippingMethod: order.shippingMethod,
        specialInstructions: order.specialInstructions,
        shippingAddress,
        billingAddress,
        items: items.map((i) => ({
          id: i.id,
          productId: i.productId,
          slug: i.slug,
          description: i.description,
          productSku: i.productSku,
          unitPrice: String(i.unitPrice),
          quantity: i.quantity,
          amount: String(i.amount),
          finishName: i.finishName,
          fabricName: i.fabricName,
          fabricItemNumber: i.fabricItemNumber,
          swatchImageUrl: toPublicImageUrl(i.swatchImageUrl),
          finishSwatchImageUrl: toPublicImageUrl(
            finishSwatchFor(i.manufacturerId, i.finishName),
          ),
        })),
      }),
    );
  },
);

export default router;
export { getOrCreateCustomer };
