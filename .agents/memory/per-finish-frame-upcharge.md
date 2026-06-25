---
name: Per-finish frame upcharge pricing
description: How Frankford-style per-(product,finish) frame upcharges are stored, derived, and applied across PDP/cart.
---

# Per-finish frame UPCHARGE pricing

A frame finish can add a fixed amount on top of a grade-priced product. The
upcharge lives on `product_finish_options` (the EXPLICIT pick rows) as
`upcharge_msrp` + `upcharge_sale` (both numeric(10,2) NOT NULL DEFAULT 0).
Pooled finishes have no option row, so they always resolve to 0.

**Sale upcharge is derived, server is source of truth.** On every finishes
save, the server recomputes `upcharge_sale` from the manufacturer's NEW
`manufacturers.sale_discount_rate` (percent units — 10 means 10% off, NOT 0.10;
nullable → 0% so sale == msrp). Never trust a client-sent sale upcharge.

**Why integer-cents math matters:** `upcharge_sale = ceil(upcharge_msrp * (1 -
rate/100))` rounding UP to the cent. Naive float math (`Math.ceil(sale*100)`)
overcharges by a stray cent — e.g. 0.07 @ 0% became 0.08 because 0.07 is
0.07000…1 in binary. Use cents × basis-points: `cents = round(msrp*100)`,
`rateBp = round(rate*100)`, `saleCents = ceil(cents*(10000-rateBp)/10000)`.
Lives in `computeUpchargeSale()` in adminProductConfig.ts.

**How to apply across the stack:**
- products.ts by-slug: select upcharge cols on the explicit option rows; explicit
  wins over pooled in the dedup; serialize upchargeMsrp/upchargeSale on finishes[].
- PDP (Product.tsx): selected finish's upchargeMsrp adds to gradeMsrp
  (strikethrough), upchargeSale adds to gradeLinePrice + gradeFromPrice.
- cart.ts: add the explicit option's upchargeSale to the grade snapshotPrice.
  checkout.ts needs no change — it uses the cart_items.price snapshot.
- adminOrders left as-is (staff manual pricing, matches variant-absolute precedent).
- Admin upcharge input shows ONLY on explicit picks (checked && !poolOn).
- Warn-log when a non-zero upcharge is saved while the mfr rate is null.
