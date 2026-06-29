import { Router, type IRouter, type Request, type Response } from "express";
import { AdminQuoteOrderPricingBody } from "@workspace/api-zod";
import { requireAuth, requireRole } from "../middlewares/requireAuth";
import { loadPricingSettings, computeTax } from "../lib/checkoutPricing";

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
    const { items, shippingState, shippingZip } = parsed.data;

    let subtotalCents = 0;
    for (const it of items) {
      const lineCents = Math.round(
        (it.quantity * it.unitPrice - (it.discountAmount ?? 0)) * 100,
      );
      subtotalCents += Math.max(0, lineCents);
    }

    const settings = await loadPricingSettings();
    const tax = computeTax(
      subtotalCents,
      shippingState ?? null,
      shippingZip ?? null,
      settings,
    );

    const subtotal = subtotalCents / 100;
    const taxAmount = tax.cents / 100;
    // Staff/in-store orders default to $0 shipping. The rules engine is the
    // single source of truth for external customer ONLINE orders only; staff
    // may enter a manual flat delivery amount in the order builder when needed.
    const deliveryAmount = 0;

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
