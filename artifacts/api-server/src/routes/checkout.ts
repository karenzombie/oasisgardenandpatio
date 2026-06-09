import { Router, type IRouter, type Request, type Response } from "express";
import { and, eq, isNull } from "drizzle-orm";
import {
  db,
  cartsTable,
  cartItemsTable,
  customersTable,
  ordersTable,
  orderItemsTable,
  orderStatusHistoryTable,
  addressesTable,
  productsTable,
  fabricsTable,
  productVariantsTable,
  finishesTable,
  variantGradePricesTable,
  manufacturersTable,
  type Customer,
} from "@workspace/db";
import {
  PlaceOrderResponse as PlaceOrderResultSchema,
  PlaceOrderBody,
  QuoteCheckoutBody,
  QuoteCheckoutResponse,
} from "@workspace/api-zod";
import { getOrCreateCustomer } from "./account";
import { autoGenerateVendorOrders } from "../lib/autoGenerateVendorOrders";
import {
  loadPricingSettings,
  computeShipping,
  computeTax,
} from "../lib/checkoutPricing";

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

/**
 * Resolve which cart this checkout request is operating against. Authenticated
 * users use their userId-keyed cart; guests use the session id-keyed cart that
 * cart.ts also reads/writes.
 */
type CartLookup =
  | { kind: "user"; userId: number }
  | { kind: "guest"; sessionId: string };

function cartLookupFor(req: Request): CartLookup {
  if (req.session.userId) return { kind: "user", userId: req.session.userId };
  return { kind: "guest", sessionId: req.session.id };
}

async function loadCartForCheckout(lookup: CartLookup) {
  if (lookup.kind === "user") {
    const [cart] = await db
      .select()
      .from(cartsTable)
      .where(eq(cartsTable.userId, lookup.userId))
      .limit(1);
    return cart ?? null;
  }
  const [cart] = await db
    .select()
    .from(cartsTable)
    .where(
      and(
        eq(cartsTable.sessionId, lookup.sessionId),
        isNull(cartsTable.userId),
      ),
    )
    .limit(1);
  return cart ?? null;
}

/**
 * Create a brand-new customer row for a guest checkout. Guest customers have
 * `userId = null` and store the contact info collected on the checkout form so
 * staff can follow up about delivery and payment.
 */
async function createGuestCustomer(input: {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
}): Promise<Customer> {
  const [created] = await db
    .insert(customersTable)
    .values({
      userId: null,
      email: input.email.trim().toLowerCase(),
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      phone: input.phone.trim(),
      customerType: "residential",
    })
    .returning();
  return created;
}

router.post(
  "/checkout",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = PlaceOrderBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const data = parsed.data;
    const isGuest = !req.session.userId;

    // For guests, require contact info + a fresh shipping address (no saved
    // address book). Authenticated users may use saved addresses.
    if (isGuest) {
      if (!data.guestContact) {
        res.status(400).json({
          error:
            "Please provide your contact info (email, name, phone) to place a guest order, or sign in to use a saved profile.",
        });
        return;
      }
      if (data.shippingAddressId) {
        res.status(400).json({
          error: "Guest checkout cannot use a saved address.",
        });
        return;
      }
      if (!data.shippingAddress) {
        res.status(400).json({ error: "Shipping address is required" });
        return;
      }
    }

    const customer: Customer = isGuest
      ? await createGuestCustomer(data.guestContact!)
      : await getOrCreateCustomer(req.session.userId!);

    // Resolve / persist shipping + billing addresses (outside the txn so any
    // validation 4xx returns cleanly without an open transaction).
    let shippingAddressId: number | null = null;
    let shippingState: string | null = null;
    let shippingZip: string | null = null;

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
      shippingZip = existing.zip;
    } else if (data.shippingAddress) {
      const a = data.shippingAddress;
      const [created] = await db
        .insert(addressesTable)
        .values({
          customerId: customer.id,
          type: "shipping",
          recipientName:
            a.recipientName
            ?? (isGuest
              ? `${data.guestContact!.firstName} ${data.guestContact!.lastName}`.trim()
              : null),
          street1: a.street1,
          street2: a.street2 ?? null,
          city: a.city,
          state: a.state,
          zip: a.zip,
          country: a.country ?? "US",
          phone: a.phone ?? (isGuest ? data.guestContact!.phone : null),
          isDefault: false,
        })
        .returning();
      shippingAddressId = created.id;
      shippingState = created.state;
      shippingZip = created.zip;
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

    const pricingSettings = await loadPricingSettings();
    const orderNumber = generateOrderNumber();
    const cartLookup = cartLookupFor(req);

    let result: { totalCents: number } | { error: string; status: number };
    try {
      result = await db.transaction(async (tx) => {
        // SELECT ... FOR UPDATE on the cart row so concurrent submits of the
        // same cart serialise instead of double-charging.
        const cartWhere =
          cartLookup.kind === "user"
            ? eq(cartsTable.userId, cartLookup.userId)
            : and(
                eq(cartsTable.sessionId, cartLookup.sessionId),
                isNull(cartsTable.userId),
              );
        const [cart] = await tx
          .select()
          .from(cartsTable)
          .where(cartWhere)
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
            weight: productsTable.weight,
            availableOnline: productsTable.availableOnline,
            isActive: productsTable.isActive,
            quoteOnly: productsTable.quoteOnly,
            fabricIsStripe: fabricsTable.isStripe,
            variantId: cartItemsTable.variantId,
            fabricId: cartItemsTable.fabricId,
            finishId: cartItemsTable.finishId,
            variantSku: productVariantsTable.variantSku,
            variantName: productVariantsTable.variantName,
            finishCode: finishesTable.itemNumber,
            finishName: finishesTable.name,
            fabricItemNumber: fabricsTable.itemNumber,
            fabricName: fabricsTable.name,
            fabricGrade: fabricsTable.grade,
            fabricBrand: manufacturersTable.name,
            unitMsrp: variantGradePricesTable.msrp,
          })
          .from(cartItemsTable)
          .innerJoin(
            productsTable,
            eq(productsTable.id, cartItemsTable.productId),
          )
          .leftJoin(fabricsTable, eq(fabricsTable.id, cartItemsTable.fabricId))
          .leftJoin(
            manufacturersTable,
            eq(manufacturersTable.id, fabricsTable.manufacturerId),
          )
          .leftJoin(
            productVariantsTable,
            eq(productVariantsTable.id, cartItemsTable.variantId),
          )
          .leftJoin(
            finishesTable,
            eq(finishesTable.id, cartItemsTable.finishId),
          )
          .leftJoin(
            variantGradePricesTable,
            and(
              eq(variantGradePricesTable.variantId, cartItemsTable.variantId),
              eq(variantGradePricesTable.grade, fabricsTable.grade),
            ),
          )
          .where(eq(cartItemsTable.cartId, cart.id));

        if (lines.length === 0)
          return { error: "Cart is empty", status: 400 };
        if (lines.some((l) => !l.isActive || !l.availableOnline || l.quoteOnly)) {
          return {
            error:
              "One or more items in your cart are no longer available. Please update your cart and try again.",
            status: 400,
          };
        }
        // Stripe-fabric umbrellas must be ordered in even pairs (qty 2, 4, 6...).
        if (
          lines.some(
            (l) => l.fabricIsStripe && (l.quantity < 2 || l.quantity % 2 !== 0),
          )
        ) {
          return {
            error:
              "Striped-fabric umbrellas must be ordered in pairs (quantity 2, 4, 6...). Please update the quantity in your cart and try again.",
            status: 400,
          };
        }

        let subtotalCents = 0;
        const lineCents = lines.map((l) => {
          const c = toCents(l.unitPrice) * l.quantity;
          subtotalCents += c;
          return c;
        });
        const shipping = computeShipping(
          subtotalCents,
          shippingState,
          lines.map((l) => ({
            weightLbs: l.weight == null ? null : Number(l.weight),
            quantity: l.quantity,
          })),
          pricingSettings,
          false,
        );
        const tax = computeTax(
          subtotalCents,
          shippingState,
          shippingZip,
          pricingSettings,
        );
        const shippingCents = shipping.cents;
        const taxCents = tax.cents;
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
            shipToStore: false,
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
            // Snapshot the chosen finish (variant) + frame finish + fabric so
            // order history and vendor POs survive catalog changes.
            variantId: l.variantId,
            fabricId: l.fabricId,
            finishId: l.finishId,
            variantSkuSnapshot: l.variantSku,
            variantNameSnapshot: l.variantName,
            finishCodeSnapshot: l.finishCode,
            finishNameSnapshot: l.finishName,
            fabricItemNumberSnapshot: l.fabricItemNumber,
            fabricNameSnapshot: l.fabricName,
            fabricBrandSnapshot: l.fabricBrand,
            fabricGradeSnapshot: l.fabricGrade,
            unitMsrpSnapshot: l.unitMsrp != null ? String(l.unitMsrp) : null,
          });
        }

        await tx.insert(orderStatusHistoryTable).values({
          orderId: order.id,
          fromStatus: null,
          toStatus: "pending_payment",
          note: isGuest
            ? "Order placed by guest (payment pending)"
            : "Order placed by customer (payment pending)",
        });

        // Auto-create pending vendor POs grouped by manufacturer so staff
        // can review/send them from the vendor-orders page. Online orders
        // always ship-to-store (default), so the PO Ship-To stays Oasis.
        await autoGenerateVendorOrders(tx, order.id, null, null);

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

    // Remember this order on the session so the guest can land on the order
    // confirmation page without an account. Cap the list to keep the cookie
    // session payload bounded.
    if (isGuest) {
      const existing = req.session.guestOrders ?? [];
      req.session.guestOrders = [orderNumber, ...existing].slice(0, 25);
    }

    res.json(
      PlaceOrderResultSchema.parse({
        orderNumber,
        total: moneyFromCents(result.totalCents),
      }),
    );
  },
);

router.post(
  "/checkout/quote",
  async (req: Request, res: Response): Promise<void> => {
    const parsed = QuoteCheckoutBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }

    const cart = await loadCartForCheckout(cartLookupFor(req));

    let subtotalCents = 0;
    let lineInputs: { weightLbs: number | null; quantity: number }[] = [];
    if (cart) {
      const lines = await db
        .select({
          quantity: cartItemsTable.quantity,
          unitPrice: cartItemsTable.price,
          weight: productsTable.weight,
        })
        .from(cartItemsTable)
        .innerJoin(
          productsTable,
          eq(productsTable.id, cartItemsTable.productId),
        )
        .where(eq(cartItemsTable.cartId, cart.id));
      for (const l of lines) {
        subtotalCents += toCents(l.unitPrice) * l.quantity;
      }
      lineInputs = lines.map((l) => ({
        weightLbs: l.weight == null ? null : Number(l.weight),
        quantity: l.quantity,
      }));
    }

    const settings = await loadPricingSettings();
    const state =
      parsed.data.state && parsed.data.state.trim()
        ? parsed.data.state.trim().toUpperCase()
        : null;
    const zip =
      parsed.data.zip && parsed.data.zip.trim() ? parsed.data.zip.trim() : null;
    const shipping = computeShipping(subtotalCents, state, lineInputs, settings, false);
    const tax = computeTax(subtotalCents, state, zip, settings);
    const totalCents = subtotalCents + shipping.cents + tax.cents;

    res.json(
      QuoteCheckoutResponse.parse({
        subtotal: moneyFromCents(subtotalCents),
        shipping: moneyFromCents(shipping.cents),
        tax: moneyFromCents(tax.cents),
        total: moneyFromCents(totalCents),
        shippingMode: settings.shippingMode,
        freeShippingThresholdMet: shipping.freeShippingApplied,
        taxRate: tax.rate,
        taxJurisdiction: tax.jurisdiction,
        shippingWeightLbs: shipping.weightLbs,
        shippingZone: shipping.zone.zone,
        shippingZoneLabel: shipping.zone.label,
      }),
    );
  },
);

export default router;
