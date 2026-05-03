import { Router, type IRouter, type Request, type Response } from "express";
import { and, desc, eq, or, sql } from "drizzle-orm";
import {
  db,
  customersTable,
  addressesTable,
  ordersTable,
  orderItemsTable,
  productsTable,
} from "@workspace/db";
import {
  CreateAccountAddressBody,
  ListAccountAddressesResponse,
  ListAccountOrdersResponse,
  GetAccountOrderResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";

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
    .where(eq(addressesTable.customerId, customer.id))
    .orderBy(desc(addressesTable.isDefault), desc(addressesTable.id));
  return ListAccountAddressesResponse.parse({
    addresses: rows.map(serializeAddress),
  });
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
        ),
      )
      .limit(1);
    if (!existing) {
      res.status(404).json({ error: "Address not found" });
      return;
    }

    await db.transaction(async (tx) => {
      if (data.isDefault) {
        await tx
          .update(addressesTable)
          .set({ isDefault: false })
          .where(eq(addressesTable.customerId, customer.id));
      }
      await tx
        .update(addressesTable)
        .set({
          type: data.type ?? existing.type,
          recipientName: data.recipientName ?? null,
          street1: data.street1,
          street2: data.street2 ?? null,
          city: data.city,
          state: data.state,
          zip: data.zip,
          country: data.country ?? "US",
          phone: data.phone ?? null,
          isDefault: data.isDefault ?? existing.isDefault,
        })
        .where(eq(addressesTable.id, addressId));
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
    if (referenced) {
      res.status(409).json({
        error:
          "This address is attached to one or more past orders and cannot be deleted. You can edit it or set a different default instead.",
      });
      return;
    }

    await db
      .delete(addressesTable)
      .where(eq(addressesTable.id, addressId));

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
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const customer = await getOrCreateCustomer(req.user!.id);
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(
        and(
          eq(ordersTable.orderNumber, String(req.params.orderNumber)),
          eq(ordersTable.customerId, customer.id),
        ),
      )
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
      })
      .from(orderItemsTable)
      .leftJoin(
        productsTable,
        eq(productsTable.id, orderItemsTable.productId),
      )
      .where(eq(orderItemsTable.orderId, order.id))
      .orderBy(orderItemsTable.id);

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
        })),
      }),
    );
  },
);

export default router;
export { getOrCreateCustomer };
