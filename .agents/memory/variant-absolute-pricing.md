---
name: Variant absolute per-variant pricing
description: How per-variant absolute MSRP/sale pricing (rugs by size) overrides base+adjustment, and the MSRP-keyed invariant.
---

`product_variants` carries optional absolute pricing: `msrp`, `sale_price`, and
`shipping_surcharge` (notNull default 0). Used for size-variant products like
Treasure Garden Outdoor Rugs where each size has its own price.

**Rule:** absolute per-variant pricing is keyed on **MSRP presence**, not the
pair. When a variant has `msrp` set, PDP / cart snapshot / checkout all use the
variant's sale-or-msrp absolute price instead of product base price +
`priceAdjustment`. `shipping_surcharge * qty` is added in `computeShipping()`
for every customer shipping mode (flat/percentage/free/threshold-free) and is
waived when `shipToStore = true`.

**Why MSRP-keyed:** the three pricing sites all branch on `msrp != null`. A
`salePrice` set *without* `msrp` would be silently ignored (falls back to base),
silently mispricing. The admin variant PUT (`adminProductConfig.ts`) therefore
rejects sale-without-MSRP with a 400.

**How to apply:** if you add another pricing site or a new shipping mode, branch
on variant `msrp` for the absolute override and include the surcharge. Keep the
admin invariant in sync. `adminOrdersPricing.ts` is intentionally NOT wired —
admin quote items carry only `productId`, no `variantId`, so per-variant absolute
pricing cannot resolve there.
