import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq } from "drizzle-orm";
import {
  db,
  cartsTable,
  cartItemsTable,
  ordersTable,
  orderItemsTable,
  orderStatusHistoryTable,
  addressesTable,
  productsTable,
} from "@workspace/db";
import { PlaceOrderResponse as PlaceOrderResultSchema, PlaceOrderBody } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { getOrCreateCustomer } from "./account";

const router: IRouter = Router();

function generateOrderNumber(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `ORD-${ts}-${rand}`;
}

function moneyFromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

function toCents(price: string | number): number {
  // Treat product prices as decimals with 2 places. Round defensively.
  return Math.round(Number(price) * 100);
}

router.post(
  "/checkout",
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    const parsed = PlaceOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    const userId = req.user!.id;

    const customer = await getOrCreateCustomer(userId);

    // Resolve / persist shipping + billing addresses (outside the txn so any
    // validation 4xx returns cleanly without an open transaction).
    let shippingAddressId: number | null = null;
    let shippingState: string | null = null;

    if (data.shippingAddressId) {
      const [existing] = await db
        .select()
        .from(addressesTable)
        .where(
          and(
            eq(addressesTable.id, data.shippingAddressId),
            eq(addressesTable.customerId, customer.id),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(400).json({ error: "Shipping address not found" });
        return;
      }
      shippingAddressId = existing.id;
      shippingState = existing.state;
    } else if (data.shippingAddress) {
      const a = data.shippingAddress;
      const [created] = await db
        .insert(addressesTable)
        .values({
          customerId: customer.id,
          type: "shipping",
          recipientName: a.recipientName ?? null,
          street1: a.street1,
          street2: a.street2 ?? null,
          city: a.city,
          state: a.state,
          zip: a.zip,
          country: a.country ?? "US",
          phone: a.phone ?? null,
          isDefault: false,
        })
        .returning();
      shippingAddressId = created.id;
      shippingState = created.state;
    } else {
      res.status(400).json({ error: "Shipping address is required" });
      return;
    }

    let billingAddressId: number | null = shippingAddressId;
    if (data.billingSameAsShipping === false) {
      if (data.billingAddressId) {
        const [existing] = await db
          .select()
          .from(addressesTable)
          .where(
            and(
              eq(addressesTable.id, data.billingAddressId),
              eq(addressesTable.customerId, customer.id),
            ),
          )
          .limit(1);
        if (!existing) {
          res.status(400).json({ error: "Billing address not found" });
          return;
        }
        billingAddressId = existing.id;
      } else if (data.billingAddress) {
        const a = data.billingAddress;
        const [created] = await db
          .insert(addressesTable)
          .values({
            customerId: customer.id,
            type: "billing",
            recipientName: a.recipientName ?? null,
            street1: a.street1,
            street2: a.street2 ?? null,
            city: a.city,
            state: a.state,
            zip: a.zip,
            country: a.country ?? "US",
            phone: a.phone ?? null,
            isDefault: false,
          })
          .returning();
        billingAddressId = created.id;
      }
    }

    // Placeholder shipping rule: free in CA, flat $50 elsewhere.
    const shippingCents =
      shippingState && shippingState.toUpperCase() === "CA" ? 0 : 5000;
    const taxCents = 0;

    const orderNumber = generateOrderNumber();

    // Read cart + lines, create order, and clear cart inside one transaction
    // with a row lock on the cart record. This prevents the same cart from
    // being checked out twice from concurrent requests (double-click, retry).
    let result: { totalCents: number } | { error: string; status: number };
    try {
      result = await db.transaction(async (tx) => {
        const [cart] = await tx
          .select()
          .from(cartsTable)
          .where(eq(cartsTable.userId, userId))
          .for("update")
          .limit(1);
        if (!cart) return { error: "Cart is empty", status: 400 };

        const lines = await tx
          .select({
            productId: productsTable.id,
            sku: productsTable.sku,
            name: productsTable.name,
            quantity: cartItemsTable.quantity,
            unitPrice: cartItemsTable.price,
            availableOnline: productsTable.availableOnline,
            isActive: productsTable.isActive,
          })
          .from(cartItemsTable)
          .innerJoin(
            productsTable,
            eq(productsTable.id, cartItemsTable.productId),
          )
          .where(eq(cartItemsTable.cartId, cart.id));

        if (lines.length === 0)
          return { error: "Cart is empty", status: 400 };
        if (lines.some((l) => !l.isActive || !l.availableOnline)) {
          return {
            error:
              "One or more items in your cart are no longer available. Please update your cart and try again.",
            status: 400,
          };
        }

        let subtotalCents = 0;
        const lineCents = lines.map((l) => {
          const c = toCents(l.unitPrice) * l.quantity;
          subtotalCents += c;
          return c;
        });
        const totalCents = subtotalCents + shippingCents + taxCents;

        const [order] = await tx
          .insert(ordersTable)
          .values({
            orderNumber,
            customerId: customer.id,
            orderType: "online",
            status: "pending_payment",
            subtotal: moneyFromCents(subtotalCents),
            taxAmount: moneyFromCents(taxCents),
            deliveryAmount: moneyFromCents(shippingCents),
            total: moneyFromCents(totalCents),
            balanceDue: moneyFromCents(totalCents),
            shippingAddressId,
            billingAddressId,
            shippingMethod: data.shippingMethod ?? "standard",
            specialInstructions: data.specialInstructions ?? null,
          })
          .returning();

        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          await tx.insert(orderItemsTable).values({
            orderId: order.id,
            productId: l.productId,
            productSkuSnapshot: l.sku,
            description: l.name,
            quantity: l.quantity,
            unitPrice: String(l.unitPrice),
            amount: moneyFromCents(lineCents[i]),
          });
        }

        await tx.insert(orderStatusHistoryTable).values({
          orderId: order.id,
          fromStatus: null,
          toStatus: "pending_payment",
          note: "Order placed by customer (payment pending)",
        });

        // Clear the cart now that the order exists.
        await tx
          .delete(cartItemsTable)
          .where(eq(cartItemsTable.cartId, cart.id));

        return { totalCents };
      });
    } catch (err) {
      req.log?.error({ err }, "checkout transaction failed");
      res.status(500).json({ error: "Could not place order. Please try again." });
      return;
    }

    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(
      PlaceOrderResultSchema.parse({
        orderNumber,
        total: moneyFromCents(result.totalCents),
      }),
    );
  },
);

export default router;
