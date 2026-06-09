import { Router, type IRouter, type Request, type Response } from "express";
import { inArray } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import { AdminQuoteOrderPricingBody } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import {
  loadPricingSettings,
  computeShipping,
  computeTax,
  type ShippableLine,
} from "../lib/checkoutPricing";

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

    // Pre-load product weights for any items that reference a product.
    const productIds = Array.from(
      new Set(
        items
          .map((i) => i.productId)
          .filter((v): v is number => typeof v === "number"),
      ),
    );
    const productWeights = new Map<number, number | null>();
    if (productIds.length > 0) {
      const rows = await db
        .select({
          id: productsTable.id,
          weight: productsTable.weight,
        })
        .from(productsTable)
        .where(inArray(productsTable.id, productIds));
      for (const r of rows) {
        productWeights.set(r.id, r.weight == null ? null : Number(r.weight));
      }
    }

    let subtotalCents = 0;
    const shippableLines: ShippableLine[] = [];
    for (const it of items) {
      const lineCents = Math.round(
        (it.quantity * it.unitPrice - (it.discountAmount ?? 0)) * 100,
      );
      subtotalCents += Math.max(0, lineCents);
      const w =
        it.productId != null ? (productWeights.get(it.productId) ?? null) : null;
      shippableLines.push({ weightLbs: w, quantity: it.quantity });
    }

    const settings = await loadPricingSettings();
    const shipping = computeShipping(
      subtotalCents,
      shippingState ?? null,
      shippableLines,
      settings,
      shipToStore ?? false,
    );
    const tax = computeTax(
      subtotalCents,
      shippingState ?? null,
      shippingZip ?? null,
      settings,
    );

    const subtotal = subtotalCents / 100;
    const taxAmount = tax.cents / 100;
    const deliveryAmount = shipping.cents / 100;

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
