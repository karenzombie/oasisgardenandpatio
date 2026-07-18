import { Router, type IRouter, type Request, type Response } from "express";
import { resolveTgPoleVariantName } from "../lib/tgReplacementPartsMap.js";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
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
import {
  processAuthnetCharge,
  type AuthnetChargeResult,
} from "../lib/authorizeNet";

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
      if (data.billingAddressId) {
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

    // ── Pre-tx: read-only setup ────────────────────────────────────────────
    // No DB writes happen before the transaction. Guest customer creation and
    // all new-address INSERTs are deferred until AFTER the charge succeeds,
    // inside the atomic transaction, so a decline leaves no orphaned rows.

    // For authenticated users, resolve the customer record now (idempotent).
    let authedCustomer: Customer | null = null;
    if (!isGuest) {
      authedCustomer = await getOrCreateCustomer(req.session.userId!);
    }

    // Shipping address: if the customer chose a saved address, read it now to
    // extract state/zip for tax computation. New-address INSERTs are deferred.
    let savedShippingAddressId: number | null = null;
    let shippingState: string | null = null;
    let shippingZip: string | null = null;

    if (data.shippingAddressId) {
      const [existing] = await db
        .select()
        .from(addressesTable)
        .where(
          and(
            eq(addressesTable.id, data.shippingAddressId),
            eq(addressesTable.customerId, authedCustomer!.id),
          ),
        )
        .limit(1);
      if (!existing) {
        res.status(400).json({ error: "Shipping address not found" });
        return;
      }
      savedShippingAddressId = existing.id;
      shippingState = existing.state;
      shippingZip = existing.zip;
    } else if (data.shippingAddress) {
      // New address submitted — extract state/zip for tax now; INSERT deferred.
      shippingState = data.shippingAddress.state;
      shippingZip = data.shippingAddress.zip;
    } else {
      res.status(400).json({ error: "Shipping address is required" });
      return;
    }

    // Billing address: if the customer chose a saved address, read it now.
    // New-billing-address INSERTs are deferred.
    // billingZip is resolved here (before the charge) for AVS.
    let savedBillingAddressId: number | null = null;
    let billingZip: string | null = null;
    if (data.billingSameAsShipping !== false) {
      // Billing equals shipping — AVS ZIP is the same as the shipping ZIP.
      billingZip = shippingZip;
    } else {
      if (data.billingAddressId) {
        const [existing] = await db
          .select()
          .from(addressesTable)
          .where(
            and(
              eq(addressesTable.id, data.billingAddressId),
              eq(addressesTable.customerId, authedCustomer!.id),
            ),
          )
          .limit(1);
        if (!existing) {
          res.status(400).json({ error: "Billing address not found" });
          return;
        }
        savedBillingAddressId = existing.id;
        billingZip = existing.zip;
      } else if (data.billingAddress) {
        // New inline billing address — ZIP available from request body.
        billingZip = data.billingAddress.zip;
      }
      // If neither is present (malformed request), billingZip stays null and
      // we omit billTo entirely rather than send an empty string to the gateway.
    }

    const pricingSettings = await loadPricingSettings();
    const shippingConfig = await loadShippingConfig();

    // Order number is generated before the charge so the same number appears
    // on both the gateway transaction record and the order row.
    const orderNumber = generateOrderNumber();
    const cartLookup = cartLookupFor(req);

    // ── Single transaction: lock → validate → charge → write-all → clear ──
    //
    // chargeResult is hoisted outside the transaction so the outer catch can
    // inspect it even after a rollback (it is a plain JS variable, not a DB
    // row, and is unaffected by the transaction rollback).
    let chargeResult: AuthnetChargeResult | null = null;

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
    type TxSuccess = {
      orderId: number;
      totalCents: number;
      isHeld: boolean;
      finalCustomer: Customer;
    };
    let txOutcome: TxSuccess | { error: string; status: number };

    try {
      txOutcome = await db.transaction(async (tx) => {
        // Set READ COMMITTED explicitly — do not rely on the DB-server default,
        // which may differ between dev (heliumdb) and prod (neondb). Under READ
        // COMMITTED, a concurrent request that was blocked on the FOR UPDATE
        // lock re-reads an empty cart after we commit, returning "Cart is empty"
        // without ever reaching the gateway.
        await tx.execute(sql`SET TRANSACTION ISOLATION LEVEL READ COMMITTED`);

        const cartWhere =
          cartLookup.kind === "user"
            ? eq(cartsTable.userId, cartLookup.userId)
            : and(
                eq(cartsTable.sessionId, cartLookup.sessionId),
                isNull(cartsTable.userId),
              );

        // Lock the cart FOR UPDATE and hold it through the charge and all
        // writes. A concurrent duplicate request blocks here; after we commit
        // (cart cleared), it re-reads and finds the cart empty, returning 400
        // without calling the gateway. This is the double-submit guard.
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
            selectedModelCode: cartItemsTable.selectedModelCode,
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

        // ── Call the gateway (FOR UPDATE lock is held) ────────────────────
        // AbortSignal.timeout caps the gateway fetch at 30 s so a hung call
        // cannot hold the cart lock indefinitely.
        chargeResult = await processAuthnetCharge({
          amountCents: totalCents,
          dataDescriptor: data.paymentToken!.dataDescriptor,
          dataValue: data.paymentToken!.dataValue,
          orderNumber,
          customerEmail: isGuest ? data.guestContact!.email : authedCustomer!.email,
          billingZip: billingZip ?? undefined,
          signal: AbortSignal.timeout(30_000),
        });

        if (!chargeResult.success && !chargeResult.heldForReview) {
          // Network / timeout errors: we do not know whether Authorize.net
          // captured money. Log a CRITICAL breadcrumb (cart id, amount,
          // timestamp) so staff can reconcile if a customer later disputes.
          // Pino writes to stdout — NOT part of the DB transaction — and is
          // not affected by the rollback that follows this throw.
          if (chargeResult.rawResponse == null && chargeResult.notConfigured !== true) {
            req.log?.error(
              {
                cartId: cart.id,
                amountCents: totalCents,
                timestamp: new Date().toISOString(),
                errorMessage: chargeResult.errorMessage,
              },
              "Gateway fetch failed during checkout — capture state unknown, manual reconciliation may be required",
            );
          }
          // Throw to force the transaction to roll back. Nothing has been
          // written to the DB. Cart stays intact; customer can retry.
          throw new Error(chargeResult.errorMessage ?? "Payment gateway declined");
        }

        // ── Charge approved (code 1) or held for review (code 4) ─────────
        // All DB writes happen AFTER the charge, inside this transaction.
        // If any write below fails, the transaction rolls back. The card
        // may already have been captured — the outer catch handles that case.

        // Create guest customer row (deferred until charge approved/held so
        // a decline leaves no orphaned rows).
        let finalCustomer: Customer;
        if (isGuest) {
          const [created] = await tx
            .insert(customersTable)
            .values({
              userId: null,
              email: data.guestContact!.email.trim().toLowerCase(),
              firstName: data.guestContact!.firstName.trim(),
              lastName: data.guestContact!.lastName.trim(),
              phone: data.guestContact!.phone.trim(),
              customerType: "residential",
            })
            .returning();
          finalCustomer = created;
        } else {
          finalCustomer = authedCustomer!;
        }

        // Create new shipping address (deferred until charge approved/held).
        let shippingAddressId = savedShippingAddressId;
        if (shippingAddressId == null) {
          const a = data.shippingAddress!;
          const [created] = await tx
            .insert(addressesTable)
            .values({
              customerId: finalCustomer.id,
              type: "shipping",
              recipientName:
                a.recipientName ??
                (isGuest
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
        }

        // Create new billing address (deferred until charge approved/held).
        let billingAddressId: number | null =
          data.billingSameAsShipping !== false ? shippingAddressId : savedBillingAddressId;
        if (
          data.billingSameAsShipping === false &&
          billingAddressId == null &&
          data.billingAddress
        ) {
          const a = data.billingAddress;
          const [created] = await tx
            .insert(addressesTable)
            .values({
              customerId: finalCustomer.id,
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

        const isHeld = chargeResult.heldForReview === true;

        const [order] = await tx
          .insert(ordersTable)
          .values({
            orderNumber,
            customerId: finalCustomer.id,
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
              // For TG replacement pole lines the variant name carries a [MODEL]
              // placeholder; substitute the real model name before persisting.
              description: l.variantName?.includes("[MODEL]")
                ? resolveTgPoleVariantName(l.variantName, l.selectedModelCode)
                : l.name,
              parentOrderItemId,
              quantity: l.quantity,
              unitPrice: String(l.unitPrice),
              amount: moneyFromCents(lineCents[i]),
              variantId: l.variantId,
              fabricId: l.fabricId,
              finishId: l.finishId,
              finialId: l.finialId,
              variantSkuSnapshot: stripVentSuffix(l.variantSku),
              variantNameSnapshot: resolveTgPoleVariantName(
                l.variantName ?? "",
                l.selectedModelCode,
              ) || null,
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

        // Record the payment.
        // Approval (code 1): status='completed', balance zeroed below.
        // Held for review (code 4): status='pending'. recomputeOrderTotals only
        // aggregates completed payments, so balanceDue stays at the full total
        // until staff flip this row to 'completed' after the hold resolves.
        await tx.insert(paymentsTable).values({
          orderId: order.id,
          paymentMethod: "credit_card",
          amount: moneyFromCents(totalCents),
          transactionId: chargeResult.transId ?? null,
          avsResponse: chargeResult.avsResponse ?? null,
          cvvResponse: chargeResult.cvvResponse ?? null,
          cardLast4: chargeResult.cardLast4 ?? null,
          cardType: chargeResult.cardType ?? null,
          status: isHeld ? "pending" : "completed",
          rawResponse: chargeResult.rawResponse as Record<string, unknown> | null ?? null,
          receivedAt: new Date(),
        });

        if (!isHeld) {
          // Approval: zero the balance immediately. Full payment received.
          await tx
            .update(ordersTable)
            .set({
              depositAmount: moneyFromCents(totalCents),
              balanceDue: moneyFromCents(0),
            })
            .where(eq(ordersTable.id, order.id));
        }
        // Held: leave balanceDue at the full total. The pending payment row
        // is not counted by recomputeOrderTotals until staff mark it completed.

        // Clear the cart. Held orders clear it too — this prevents the customer
        // from re-submitting the same items and accumulating multiple held orders.
        await tx
          .delete(cartItemsTable)
          .where(eq(cartItemsTable.cartId, cart.id));

        return { orderId: order.id, totalCents, isHeld, finalCustomer };
      });
    } catch (err) {
      // The transaction has rolled back. Determine what happened.
      // TypeScript's control-flow analysis does not track assignments made
      // inside async callbacks (db.transaction), so chargeResult may appear
      // as type null here. Cast explicitly to recover the runtime type.
      const cr = chargeResult as AuthnetChargeResult | null;
      if (cr?.success === true || cr?.heldForReview === true) {
        // The gateway captured money but a subsequent DB write failed.
        // The card has been charged but no order exists. Log CRITICAL so staff
        // can reconcile. Pino writes to stdout — NOT inside the rolled-back
        // transaction — and is unaffected by the rollback.
        req.log?.error(
          { err, orderNumber, transId: cr.transId },
          "CRITICAL: order creation failed after successful charge — manual reconciliation required",
        );
        res.status(500).json({
          error:
            "Your payment went through, but we hit an error saving your order. Please contact us right away with this reference: " +
            orderNumber +
            ". Please do not resubmit your order.",
        });
      } else {
        // Charge was not made, or the gateway declined. No money was captured.
        // Cart stays intact; the customer can try again.
        req.log?.error({ err }, "checkout failed");
        const isServerSide =
          cr?.notConfigured === true || cr?.rawResponse == null;
        const userMessage = isServerSide
          ? "Something interrupted your payment and we can't confirm whether it went through. Please don't try again. Contact us at (661) 255-9909 or sales@oasisgardenandpatio.com during store hours and we'll confirm your order before any charge."
          : (cr?.errorMessage ??
            "Your card was not approved. Please try a different card or contact your bank.");
        res.status(isServerSide ? 503 : 402).json({
          error: userMessage,
          paymentDeclined: !isServerSide && cr != null,
          paymentUnavailable: isServerSide,
        });
      }
      return;
    }

    // Check for preflight validation errors returned (not thrown) from the
    // transaction callback. These are cart/input issues, not payment issues.
    if ("error" in txOutcome) {
      res.status(txOutcome.status).json({ error: txOutcome.error });
      return;
    }

    const { orderId, totalCents, isHeld, finalCustomer } = txOutcome;

    // Remember this order on the session so the guest can land on the order
    // confirmation page without an account.
    if (isGuest) {
      const existing = req.session.guestOrders ?? [];
      req.session.guestOrders = [orderNumber, ...existing].slice(0, 25);
    }

    // Post-commit: vendor PO generation.
    // Runs ONLY on approval (code 1) — payment is confirmed so items can be
    // ordered from vendors. Held orders (code 4) do NOT generate a PO; payment
    // is not confirmed so nothing should look "in process" to vendors.
    // Best-effort: a PO failure must never roll back the paid order.
    if (!isHeld) {
      void db
        .transaction(async (tx) => {
          await autoGenerateVendorOrders(tx, orderId, null, null);
        })
        .catch((vendorErr) => {
          req.log?.error(
            { err: vendorErr, orderNumber, orderId },
            "Vendor PO generation failed after checkout — staff must create the PO manually",
          );
        });
    }

    // Post-commit: fire-and-forget transactional emails.
    // Approval (code 1): customer confirmation email + staff notification.
    // Held (code 4): staff notification ONLY. No customer email — the on-screen
    //   message ("order received, payment under review, we'll contact you") is
    //   the sole customer communication. An approval-style email would contradict
    //   the on-screen message. Staff will trigger any customer outreach from
    //   their own UI.
    if (!isHeld) {
      void sendOrderConfirmationEmail(finalCustomer, orderNumber).catch(() => {});
    }
    void sendStoreNewOrderNotification(finalCustomer, orderNumber).catch(() => {});

    res.json(
      PlaceOrderResultSchema.parse({
        orderNumber,
        total: moneyFromCents(totalCents),
        ...(isHeld ? { heldForReview: true } : {}),
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
