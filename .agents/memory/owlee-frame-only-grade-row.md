---
name: Frame-only via reserved grade row
description: Grade-priced products support frame-only purchase through a reserved "Frame Only" variant_grade_prices row; sale_price is nullable with MSRP fallback.
---

# Frame-only for grade-priced products (OW Lee seating pattern)

**Rule:** A grade-priced product offers frame-only (frame + finish, no fabric) when its variant carries a `variant_grade_prices` row with the reserved grade label `"Frame Only"`. Fabric grades never use this label, so it can't collide with fabric pickers.

**Why:** Frame-only needed full MSRP/sale/cost storage + staff grade-editor editing; the legacy `products.frame_only_price` column is a single flat value with no sale/cost and was explicitly disabled in grade mode. User confirmed this model explicitly.

**How to apply:**
- Customer PDP, cart, staff order builder, and both OrderDetail edit dialogs detect the row and offer a Frame + Fabric / Frame Only choice; price = row sale>0 ? sale : msrp.
- Staff order lines persist `grade: "Frame Only"` (not null!) so the order-snapshot MSRP lookup (variantId+grade) resolves, and append "Frame Only" to the line description. The picker's onApply passes an explicit `gradeLabel` param.
- Exclude the `"Frame Only"` grade from fabric-grade "From $X" teasers and never treat it as a fabric grade.
- `variant_grade_prices.sale_price` is now NULLABLE (OW Lee rows seeded MSRP-only per user instruction); EVERY consumer must fall back to MSRP when sale is null/<=0. Admin editor accepts blank sale.
- OW Lee seating: 145 single variants (variant_sku = product sku, option "Configuration"), grades AA/A/B/C/D + Frame Only from vendor CSV; `699-CH` intentionally skipped (not in DB). Products remain quote-only/wishlist-only; enabling purchase later needs only flipping availability flags.
- Prod not yet synced (schema change: sale_price DROP NOT NULL must ride along at next publish).
