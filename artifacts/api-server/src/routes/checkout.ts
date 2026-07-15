import { Router, type IRouter, type Request, type Response } from "express";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import {
  db,
  cartsTable,
  cartItemsTable,
  cartItemAddonsTable,
  customersTable,
  ordersTable,
  orderItemsTable,
  orderItemAddonsTable,
  orderStatusHistoryTable,
  addressesTable,
  productsTable,
  fabricsTable,
  productVariantsTable,
  finishesTable,
  productFinialOptionsTable,
  variantGradePricesTable,
  productAddonOptionsTable,
  manufacturersTable,
  paymentsTable,
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
  sendOrderConfirmationEmail,
  sendStoreNewOrderNotification,
} from "../lib/orderConfirmationEmail";
import { stripVentSuffix } from "../lib/variantSku";
import { loadPricingSettings, computeTax } from "../lib/checkoutPricing";
import {
  loadShippingConfig,
  computeShippingForLines,
  type ShippableRuleLine,
} from "../lib/shippingRules";
import { processAuthnetCharge } from "../lib/authorizeNet";

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

/**
 * Return the Accept.js sandbox public config (API Login ID + Public Client Key).
 * The transaction key is server-only and must NEVER appear here.
 */
router.get(
  "/checkout/payment-config",
  async (_req: Request, res: Response): Promise<void> => {
    const apiLoginId = process.env["AUTHNET_API_LOGIN_ID"];
    const publicClientKey = process.env["AUTHNET_PUBLIC_CLIENT_KEY"];
    if (!apiLoginId || !publicClientKey) {
      res.status(503).json({ error: "Payment configuration is not available." });
      return;
    }
    const sandbox = process.env["AUTHNET_SANDBOX"] !== "false";
    res.json({ apiLoginId, publicClientKey, sandbox });
  },
);

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

    // Payment token is required for all online orders.
    if (!data.paymentToken) {
      res
        .status(400)
        .json({ error: "Payment information is required to place an order." });
      return;
    }

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
    const shippingConfig = await loadShippingConfig();

    // Order number is generated BEFORE the charge so the same number appears
    // on both the gateway transaction record and the order row.
    const orderNumber = generateOrderNumber();
    const cartLookup = cartLookupFor(req);

    // ── Phase A: Pre-flight transaction ────────────────────────────────────
    // Lock the cart, validate contents, compute the total. No inserts.
    // Returns the data needed to create the order + the totalCents to charge.
    type AddonRow = {
      cartItemId: number;
      addonOptionId: number;
      unitPrice: string;
      quantity: number;
      sku: string;
      name: string;
      pricingMode: string;
      displayOrder: number;
    };
    type PreflightResult = {
      cartId: number;
      lines: Array<{
        cartItemId: number;
        productId: number;
        sku: string;
        name: string;
        categoryId: number | null;
        manufacturerId: number | null;
        subCategory: string | null;
        quantity: number;
        unitPrice: string;
        weight: string | null;
        availableOnline: boolean;
        productPrice: string | null;
        productSalePrice: string | null;
        isActive: boolean;
        quoteOnly: boolean;
        parentCartItemId: number | null;
        fabricIsStripe: boolean | null;
        variantId: number | null;
        fabricId: number | null;
        finishId: number | null;
        finialId: number | null;
        variantSku: string | null;
        variantName: string | null;
        finishCode: string | null;
        finishName: string | null;
        finialCode: string | null;
        finialName: string | null;
        fabricItemNumber: string | null;
        fabricName: string | null;
        fabricGrade: string | null;
        fabricBrand: string | null;
        unitMsrp: string | null;
        variantShippingSurcharge: string | null;
        variantWeight: string | null;
      }>;
      addonsByCartItem: Map<number, AddonRow[]>;
      lineCents: number[];
      subtotalCents: number;
      shippingCents: number;
      taxCents: number;
      totalCents: number;
    };

    let preflight: PreflightResult | { error: string; status: number };
    try {
      preflight = await db.transaction(async (tx) => {
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
            cartItemId: cartItemsTable.id,
            productId: productsTable.id,
            sku: productsTable.sku,
            name: productsTable.name,
            categoryId: productsTable.categoryId,
            manufacturerId: productsTable.manufacturerId,
            subCategory: productsTable.subCategory,
            quantity: cartItemsTable.quantity,
            unitPrice: cartItemsTable.price,
            weight: productsTable.weight,
            availableOnline: productsTable.availableOnline,
            productPrice: productsTable.price,
            productSalePrice: productsTable.salePrice,
            isActive: productsTable.isActive,
            quoteOnly: productsTable.quoteOnly,
            parentCartItemId: cartItemsTable.parentCartItemId,
            fabricIsStripe: fabricsTable.isStripe,
            variantId: cartItemsTable.variantId,
            fabricId: cartItemsTable.fabricId,
            finishId: cartItemsTable.finishId,
            finialId: cartItemsTable.finialId,
            variantSku: productVariantsTable.variantSku,
            variantName: productVariantsTable.variantName,
            finishCode: finishesTable.itemNumber,
            finishName: finishesTable.name,
            finialCode: productFinialOptionsTable.code,
            finialName: productFinialOptionsTable.name,
            fabricItemNumber: fabricsTable.itemNumber,
            fabricName: fabricsTable.name,
            fabricGrade: fabricsTable.grade,
            fabricBrand: manufacturersTable.name,
            unitMsrp: variantGradePricesTable.msrp,
            variantShippingSurcharge: productVariantsTable.shippingSurcharge,
            variantWeight: productVariantsTable.weight,
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
            productFinialOptionsTable,
            eq(productFinialOptionsTable.id, cartItemsTable.finialId),
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
        if (lines.some((l) => !l.isActive || l.quoteOnly)) {
          return {
            error:
              "One or more items in your cart are no longer available. Please update your cart and try again.",
            status: 400,
          };
        }
        if (lines.some((l) => !l.availableOnline && l.parentCartItemId == null)) {
          return {
            error:
              "One or more items in your cart are available by inquiry only and cannot be purchased online. Please contact us or update your cart.",
            status: 400,
          };
        }
        if (
          lines.some(
            (l) =>
              l.parentCartItemId == null &&
              !(
                (l.productPrice != null && Number(l.productPrice) > 0) ||
                (l.productSalePrice != null && Number(l.productSalePrice) > 0)
              ),
          )
        ) {
          return {
            error:
              "One or more items in your cart do not have a price set and cannot be purchased online. Please update your cart and try again.",
            status: 400,
          };
        }
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

        // Load add-on lines.
        const cartItemIds = lines.map((l) => l.cartItemId);
        const addonLines: AddonRow[] = cartItemIds.length
          ? await tx
              .select({
                cartItemId: cartItemAddonsTable.cartItemId,
                addonOptionId: cartItemAddonsTable.addonOptionId,
                unitPrice: cartItemAddonsTable.unitPrice,
                quantity: cartItemAddonsTable.quantity,
                sku: productAddonOptionsTable.sku,
                name: productAddonOptionsTable.name,
                pricingMode: productAddonOptionsTable.pricingMode,
                displayOrder: productAddonOptionsTable.displayOrder,
              })
              .from(cartItemAddonsTable)
              .innerJoin(
                productAddonOptionsTable,
                eq(
                  productAddonOptionsTable.id,
                  cartItemAddonsTable.addonOptionId,
                ),
              )
              .where(inArray(cartItemAddonsTable.cartItemId, cartItemIds))
              .orderBy(
                asc(productAddonOptionsTable.displayOrder),
                asc(cartItemAddonsTable.id),
              )
          : [];
        const addonsByCartItem = new Map<number, AddonRow[]>();
        for (const a of addonLines) {
          const list = addonsByCartItem.get(a.cartItemId) ?? [];
          list.push(a);
          addonsByCartItem.set(a.cartItemId, list);
        }

        // Compute totals.
        let subtotalCents = 0;
        const lineCents = lines.map((l) => {
          const c = toCents(l.unitPrice) * l.quantity;
          subtotalCents += c;
          const lineAddons = addonsByCartItem.get(l.cartItemId) ?? [];
          for (const a of lineAddons) {
            subtotalCents += toCents(a.unitPrice) * a.quantity * l.quantity;
          }
          return c;
        });
        const shippingEngineLines: ShippableRuleLine[] = lines.map((l) => ({
          key: l.cartItemId,
          productId: l.productId,
          categoryId: l.categoryId,
          subCategory: l.subCategory,
          manufacturerId: l.manufacturerId,
          unitPriceCents: toCents(l.unitPrice),
          quantity: l.quantity,
          weightLbs: l.weight == null ? null : Number(l.weight),
        }));
        const shipping = computeShippingForLines(shippingConfig, shippingEngineLines);
        const tax = computeTax(subtotalCents, shippingState, shippingZip, pricingSettings);
        const shippingCents = shipping.totalCents;
        const taxCents = tax.cents;
        const totalCents = subtotalCents + shippingCents + taxCents;

        return {
          cartId: cart.id,
          lines,
          addonsByCartItem,
          lineCents,
          subtotalCents,
          shippingCents,
          taxCents,
          totalCents,
        };
      });
    } catch (err) {
      req.log?.error({ err }, "checkout preflight failed");
      res.status(500).json({ error: "Could not place order. Please try again." });
      return;
    }

    if ("error" in preflight) {
      res.status(preflight.status).json({ error: preflight.error });
      return;
    }

    // ── Charge the gateway ─────────────────────────────────────────────────
    // amountCents is the server-computed total from the pre-flight tx.
    // orderNumber was generated above; it appears on both the gateway record
    // and the order row created on approval.
    const chargeResult = await processAuthnetCharge({
      amountCents: preflight.totalCents,
      dataDescriptor: data.paymentToken.dataDescriptor,
      dataValue: data.paymentToken.dataValue,
      orderNumber,
      customerEmail: customer.email,
    });

    if (!chargeResult.success) {
      // Branch on failure type.
      // notConfigured or no rawResponse (network error) = server-side problem,
      // not the customer's fault. Otherwise = real gateway decline.
      const isServerSide =
        chargeResult.notConfigured === true || chargeResult.rawResponse == null;
      const userMessage = isServerSide
        ? "Payment is temporarily unavailable. Please try again shortly or contact us for assistance."
        : (chargeResult.errorMessage ??
          "Your card was not approved. Please try a different card or contact your bank.");
      res.status(402).json({
        error: userMessage,
        paymentDeclined: !isServerSide,
        paymentUnavailable: isServerSide,
      });
      return;
    }

    // ── Phase B: Order creation transaction (charge approved) ───────────────
    // Insert order, items, add-ons, status history, vendor orders, and the
    // payment row all in one atomic commit. The cart is cleared here too.
    // If this transaction fails after a successful charge, the card has been
    // charged without an order — logged as CRITICAL for manual reconciliation.
    const { cartId, lines, addonsByCartItem, lineCents, subtotalCents, shippingCents, taxCents, totalCents } = preflight;

    let result: { totalCents: number } | { error: string; status: number };
    try {
      result = await db.transaction(async (tx) => {
        // Re-lock the cart as a safety net against concurrent submits that
        // slipped past the pre-flight lock window.
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
          .where(and(cartWhere, eq(cartsTable.id, cartId)))
          .for("update")
          .limit(1);
        if (!cart) {
          req.log?.error(
            { orderNumber, transId: chargeResult.transId },
            "CRITICAL: cart missing after successful charge — manual reconciliation required",
          );
          return {
            error:
              "Your payment was processed but we encountered an error recording your order. Please contact us immediately with reference: " +
              orderNumber,
            status: 500,
          };
        }

        const [order] = await tx
          .insert(ordersTable)
          .values({
            orderNumber,
            customerId: customer.id,
            orderType: "online",
            status: "new_online_order",
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

        const insertOrder = lines
          .map((_, i) => i)
          .sort(
            (a, b) =>
              (lines[a].parentCartItemId == null ? 0 : 1) -
              (lines[b].parentCartItemId == null ? 0 : 1),
          );
        const orderItemIdByCartItemId = new Map<number, number>();
        for (const i of insertOrder) {
          const l = lines[i];
          const parentOrderItemId =
            l.parentCartItemId != null
              ? (orderItemIdByCartItemId.get(l.parentCartItemId) ?? null)
              : null;
          const [orderItem] = await tx
            .insert(orderItemsTable)
            .values({
              orderId: order.id,
              productId: l.productId,
              productSkuSnapshot: l.sku,
              description: l.name,
              parentOrderItemId,
              quantity: l.quantity,
              unitPrice: String(l.unitPrice),
              amount: moneyFromCents(lineCents[i]),
              variantId: l.variantId,
              fabricId: l.fabricId,
              finishId: l.finishId,
              finialId: l.finialId,
              variantSkuSnapshot: stripVentSuffix(l.variantSku),
              variantNameSnapshot: l.variantName,
              finishCodeSnapshot: l.finishCode,
              finishNameSnapshot: l.finishName,
              finialCodeSnapshot: l.finialCode,
              finialNameSnapshot: l.finialName,
              fabricItemNumberSnapshot: l.fabricItemNumber,
              fabricNameSnapshot: l.fabricName,
              fabricBrandSnapshot: l.fabricBrand,
              fabricGradeSnapshot: l.fabricGrade,
              unitMsrpSnapshot: l.unitMsrp != null ? String(l.unitMsrp) : null,
              weightSnapshot:
                l.variantWeight != null
                  ? String(l.variantWeight)
                  : l.weight != null
                    ? String(l.weight)
                    : null,
            })
            .returning();

          const lineAddons = addonsByCartItem.get(l.cartItemId) ?? [];
          if (lineAddons.length > 0) {
            await tx.insert(orderItemAddonsTable).values(
              lineAddons.map((a) => {
                const totalQty = a.quantity * l.quantity;
                return {
                  orderItemId: orderItem.id,
                  addonOptionId: a.addonOptionId,
                  addonSkuSnapshot: a.sku,
                  addonNameSnapshot: a.name,
                  gradeSnapshot:
                    a.pricingMode === "per_grade" ? l.fabricGrade : null,
                  unitMsrpSnapshot: null,
                  unitPriceSnapshot: String(a.unitPrice),
                  quantity: totalQty,
                  amount: moneyFromCents(toCents(a.unitPrice) * totalQty),
                };
              }),
            );
          }

          orderItemIdByCartItemId.set(l.cartItemId, orderItem.id);
        }

        await tx.insert(orderStatusHistoryTable).values({
          orderId: order.id,
          fromStatus: null,
          toStatus: "new_online_order",
          note: isGuest
            ? "Order placed by guest (online)"
            : "Order placed by customer (online)",
        });

        await autoGenerateVendorOrders(tx, order.id, null, null);

        // Record the payment. status='completed' because the gateway approved.
        // rawResponse is stored as-is for dispute / audit purposes.
        await tx.insert(paymentsTable).values({
          orderId: order.id,
          paymentMethod: "credit_card",
          amount: moneyFromCents(totalCents),
          transactionId: chargeResult.transId ?? null,
          avsResponse: chargeResult.avsResponse ?? null,
          cvvResponse: chargeResult.cvvResponse ?? null,
          cardLast4: chargeResult.cardLast4 ?? null,
          cardType: chargeResult.cardType ?? null,
          status: "completed",
          rawResponse: chargeResult.rawResponse as Record<string, unknown> | null ?? null,
          receivedAt: new Date(),
        });

        // Inline balance update: full payment, so depositAmount = total and
        // balanceDue = 0. Mirrors the recomputeOrderTotals logic in
        // adminOrderPayments.ts but applied directly since we know the exact
        // amount and avoid the extra aggregate query.
        await tx
          .update(ordersTable)
          .set({
            depositAmount: moneyFromCents(totalCents),
            balanceDue: moneyFromCents(0),
          })
          .where(eq(ordersTable.id, order.id));

        // Clear the cart now that the order and payment are committed.
        await tx
          .delete(cartItemsTable)
          .where(eq(cartItemsTable.cartId, cart.id));

        return { totalCents };
      });
    } catch (err) {
      // Card HAS been charged but order creation failed. Log CRITICAL so staff
      // can reconcile manually. Return the orderNumber so the customer can
      // reference it when they contact support.
      req.log?.error(
        { err, orderNumber, transId: chargeResult.transId },
        "CRITICAL: order creation failed after successful charge — manual reconciliation required",
      );
      res.status(500).json({
        error:
          "Your payment was processed but we encountered an error recording your order. Please contact us immediately with reference: " +
          orderNumber,
      });
      return;
    }

    if ("error" in result) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    // Remember this order on the session so the guest can land on the order
    // confirmation page without an account.
    if (isGuest) {
      const existing = req.session.guestOrders ?? [];
      req.session.guestOrders = [orderNumber, ...existing].slice(0, 25);
    }

    // Fire-and-forget transactional emails.
    void sendOrderConfirmationEmail(customer, orderNumber).catch(() => {});
    void sendStoreNewOrderNotification(customer, orderNumber).catch(() => {});

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
    let shippingEngineLines: ShippableRuleLine[] = [];
    if (cart) {
      const lines = await db
        .select({
          cartItemId: cartItemsTable.id,
          productId: productsTable.id,
          categoryId: productsTable.categoryId,
          manufacturerId: productsTable.manufacturerId,
          subCategory: productsTable.subCategory,
          quantity: cartItemsTable.quantity,
          unitPrice: cartItemsTable.price,
          weight: productsTable.weight,
        })
        .from(cartItemsTable)
        .innerJoin(
          productsTable,
          eq(productsTable.id, cartItemsTable.productId),
        )
        .leftJoin(
          productVariantsTable,
          eq(productVariantsTable.id, cartItemsTable.variantId),
        )
        .where(eq(cartItemsTable.cartId, cart.id));
      // Fold add-on per-unit prices into the quoted subtotal so the estimate
      // matches what checkout will charge.
      const quoteItemIds = lines.map((l) => l.cartItemId);
      const quoteAddonRows = quoteItemIds.length
        ? await db
            .select({
              cartItemId: cartItemAddonsTable.cartItemId,
              unitPrice: cartItemAddonsTable.unitPrice,
              quantity: cartItemAddonsTable.quantity,
            })
            .from(cartItemAddonsTable)
            .where(inArray(cartItemAddonsTable.cartItemId, quoteItemIds))
        : [];
      const quoteAddonUnitByItem = new Map<number, number>();
      for (const a of quoteAddonRows) {
        quoteAddonUnitByItem.set(
          a.cartItemId,
          (quoteAddonUnitByItem.get(a.cartItemId) ?? 0) +
            toCents(a.unitPrice) * a.quantity,
        );
      }
      for (const l of lines) {
        const addonUnitCents = quoteAddonUnitByItem.get(l.cartItemId) ?? 0;
        subtotalCents += (toCents(l.unitPrice) + addonUnitCents) * l.quantity;
      }
      shippingEngineLines = lines.map((l) => ({
        key: l.cartItemId,
        productId: l.productId,
        categoryId: l.categoryId,
        subCategory: l.subCategory,
        manufacturerId: l.manufacturerId,
        unitPriceCents: toCents(l.unitPrice),
        quantity: l.quantity,
        weightLbs: l.weight == null ? null : Number(l.weight),
      }));
    }

    const settings = await loadPricingSettings();
    const shippingConfig = await loadShippingConfig();
    const state =
      parsed.data.state && parsed.data.state.trim()
        ? parsed.data.state.trim().toUpperCase()
        : null;
    const zip =
      parsed.data.zip && parsed.data.zip.trim() ? parsed.data.zip.trim() : null;
    const shipping = computeShippingForLines(shippingConfig, shippingEngineLines);
    const tax = computeTax(subtotalCents, state, zip, settings);
    const totalCents = subtotalCents + shipping.totalCents + tax.cents;

    const totalWeightLbs = shippingEngineLines.reduce(
      (sum, l) => sum + (l.weightLbs == null ? 0 : l.weightLbs * l.quantity),
      0,
    );

    res.json(
      QuoteCheckoutResponse.parse({
        subtotal: moneyFromCents(subtotalCents),
        shipping: moneyFromCents(shipping.totalCents),
        shippingWeightAmount: moneyFromCents(shipping.weightCents),
        tax: moneyFromCents(tax.cents),
        total: moneyFromCents(totalCents),
        taxRate: tax.rate,
        taxJurisdiction: tax.jurisdiction,
        shippingWeightLbs: totalWeightLbs,
      }),
    );
  },
);

export default router;
