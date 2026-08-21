import { Router, type IRouter, type Request, type Response } from "express";
import { inArray } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import { AdminQuoteOrderPricingBody } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { loadPricingSettings, computeTax } from "../lib/checkoutPricing";
import {
  loadShippingConfig,
  computeShippingForLines,
  type ShippableRuleLine,
} from "../lib/shippingRules";

const router: IRouter = Router();

router.post(
  "/admin/orders/quote-pricing",
  requireAuth,
  requireRole("admin", "agent"),
  async (req: Request, res: Response): Promise<void> => {
    const parsed = AdminQuoteOrderPricingBody.safeParse(req.body);
    if (!parsed.success) {
      res
        .status(400)
        .json({ error: parsed.error.issues[0]?.message ?? "Invalid body" });
      return;
    }
    const { items, shippingState, shippingZip, shipToStore } = parsed.data;

    let subtotalCents = 0;
    for (const it of items) {
      const lineCents = Math.round(
        (it.quantity * it.unitPrice - (it.discountAmount ?? 0)) * 100,
      );
      subtotalCents += Math.max(0, lineCents);
    }

    const settings = await loadPricingSettings();
    const tax =
      shippingState == null || shippingState.trim() === ""
        ? {
            cents: Math.round(subtotalCents * settings.defaultTaxRate),
            rate: settings.defaultTaxRate,
            jurisdiction: "Store Default Rate",
          }
        : computeTax(subtotalCents, shippingState, shippingZip ?? null, settings);

    const subtotal = subtotalCents / 100;
    const taxAmount = tax.cents / 100;

    // Shipping-rules parity: the admin Shipping page is the single source of
    // truth for shipping cost on EVERY order except ship-to-store, including
    // staff/admin-created ones. Only ship-to-store (manufacturer ships to the
    // Oasis store, no customer-facing delivery) skips the rules engine.
    let deliveryCents = 0;
    if (!shipToStore) {
      const productIds = [
        ...new Set(
          items
            .map((it) => it.productId)
            .filter((id): id is number => id != null),
        ),
      ];
      const productRows = productIds.length
        ? await db
            .select({
              id: productsTable.id,
              categoryId: productsTable.categoryId,
              subCategory: productsTable.subCategory,
              manufacturerId: productsTable.manufacturerId,
              weight: productsTable.weight,
            })
            .from(productsTable)
            .where(inArray(productsTable.id, productIds))
        : [];
      const productById = new Map(productRows.map((p) => [p.id, p]));

      const shippingConfig = await loadShippingConfig();
      const shippingLines: ShippableRuleLine[] = items.map((it, idx) => {
        const p = it.productId != null ? productById.get(it.productId) : null;
        return {
          key: idx,
          productId: it.productId ?? -1,
          categoryId: p?.categoryId ?? null,
          subCategory: p?.subCategory ?? null,
          manufacturerId: p?.manufacturerId ?? null,
          unitPriceCents: Math.round(it.unitPrice * 100),
          quantity: it.quantity,
          weightLbs: p?.weight == null ? null : Number(p.weight),
        };
      });
      const shippingResult = computeShippingForLines(
        shippingConfig,
        shippingLines,
      );
      deliveryCents = shippingResult.totalCents;
    }

    const deliveryAmount = deliveryCents / 100;

    res.json({
      subtotal,
      taxRate: tax.rate,
      taxAmount,
      taxJurisdiction: tax.jurisdiction,
      deliveryAmount,
      total: subtotal + taxAmount + deliveryAmount,
    });
  },
);

export default router;
