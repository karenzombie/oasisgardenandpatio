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
    const shippingConfig = await loadShippingConfig();
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
        // Tied accessory lines (e.g. top covers) may have available_online=false
        // and are valid as child items attached to a base. Standalone items that
        // are inquiry-only should not reach checkout.
        if (lines.some((l) => !l.availableOnline && l.parentCartItemId == null)) {
          return {
            error:
              "One or more items in your cart are available by inquiry only and cannot be purchased online. Please contact us or update your cart.",
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

        // Load add-on lines for each cart item (e.g. Marella privacy walls).
        // Each add-on carries a per-unit price snapshot; its line amount is
        // unitPrice * parent-line quantity. Add-on amounts are part of the
        // order subtotal but are stored on order_item_addons, NOT folded into
        // the parent order_items.amount (which stays base * qty).
        const cartItemIds = lines.map((l) => l.cartItemId);
        const addonLines = cartItemIds.length
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
        const addonsByCartItem = new Map<number, typeof addonLines>();
        for (const a of addonLines) {
          const list = addonsByCartItem.get(a.cartItemId) ?? [];
          list.push(a);
          addonsByCartItem.set(a.cartItemId, list);
        }

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
        const shipping = computeShippingForLines(
          shippingConfig,
          shippingEngineLines,
        );
        const tax = computeTax(
          subtotalCents,
          shippingState,
          shippingZip,
          pricingSettings,
        );
        const shippingCents = shipping.totalCents;
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

        // Insert base lines before their tied accessory lines (top covers) so a
        // cover's parent order_item already exists when we link it. cartItemId →
        // orderItemId lets the cover record point at its base via
        // parent_order_item_id (mirrors the cart's parent_cart_item_id tie).
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
            // Snapshot the chosen finish (variant) + frame finish + fabric so
            // order history and vendor POs survive catalog changes.
            variantId: l.variantId,
            fabricId: l.fabricId,
            finishId: l.finishId,
            finialId: l.finialId,
            // Order/PO SKU = base + finish only; the wind vent (kept in the
            // variant name snapshot) is not part of the orderable SKU.
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

          // Persist immutable add-on snapshots for this line. The total count =
          // the add-on's per-parent-unit quantity (e.g. 2 half-curtain pairs
          // when two walls are chosen) times the parent-line quantity. Amount =
          // unitPrice * that total count; gradeSnapshot records the canopy grade
          // used for per_grade add-ons (null for flat-priced add-ons).
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

          // Record this line's order_item id so any tied accessory line (top
          // cover) inserted later can link to it via parent_order_item_id.
          orderItemIdByCartItemId.set(l.cartItemId, orderItem.id);
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

    // Fire-and-forget transactional emails. Errors are caught and logged
    // inside each helper — a transient email failure must never fail the
    // checkout response.
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
