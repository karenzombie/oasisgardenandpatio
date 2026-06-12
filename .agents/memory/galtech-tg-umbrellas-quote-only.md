---
name: Galtech umbrellas priced (grade engine); TG umbrellas still quote-only
description: Galtech umbrellas were re-priced via the size×vent×grade engine and source AA/BB from Sunbrella; TG umbrellas remain quote-only. No per-item upcharge math anywhere.
---

# Galtech umbrellas: priced via grade engine. TG umbrellas: still quote-only.

## Galtech (mfr 29) umbrellas — PRICED (current state)
Galtech umbrellas are purchasable again via the **grade engine**: price =
size × wind-vent × fabric-grade. Finish is cosmetic and NEVER affects price
(verified 0 conflicts). Loaded by `scripts/src/loadGaltechUmbrellaPricing.ts`
(idempotent) from the pricing + fabrics CSVs in `attached_assets/`.

- Variants are finish×vent: `variant_sku = {productSku}-{finishCode}-{SWV|DWV}`,
  `variant_name = "{catalog finish name} ({SWV|DWV})"`, optionLabel
  "Finish & Wind Vent". Per-grade msrp/sale live in `variant_grade_prices`
  (n/a grades skipped). Some products are Double-vent only. Sets
  quoteOnly=false, availableOnline=true, showPriceOnline=true.
- **Fabric grade policy:** A/B/C are UPDATE-only against existing mfr-29 fabrics
  (matched by item_number) — NEVER create new A/B/C. AA/BB are CREATED, borrowing
  swatch/colorFamily/isStripe from the matching **Sunbrella (mfr 11)** fabric by
  item_number. If an AA/BB row has no Sunbrella swatch source, the loader SKIPS it
  (never creates a swatchless row). Missing A/B/C rows are also skipped.
- **Known data gap:** pricing CSV lists grade-C Suncrylic fabrics 23 (Caribbean
  Blue) and 27 (Lemon Yellow) that do NOT exist in the DB and have no swatch
  anywhere → loader skips both every run (`skipped=2` is expected, not a bug).
- New `fabrics.notes` column surfaces on the PDP (under the fabric picker) and is
  staff-editable; the by-slug `fabricOptions` payload includes `notes`.

## TG (mfr 12) umbrellas — STILL quote-only
Treasure Garden umbrellas use ONLY TG's own active fabrics, carry NO price, and
are `products.quoteOnly = true` (storefront shows the sales-agent panel +
wishlist, not add-to-cart). TG bases keep their pricing.

## No per-item upcharge math anywhere
**Why:** the historical TG+Sunbrella per-item grade upcharge (B +$100, C +$190)
was deleted entirely — `fabricUpcharge.ts` no longer exists. Grade pricing is
fully precomputed in `variant_grade_prices`. Do NOT reintroduce upcharge math on
any pricing surface.

## post-merge ordering (critical)
`scripts/post-merge.sh` runs `removeSunbrellaUmbrellaPricing` + `seedGaltech`
(resets Galtech umbrellas to quote-only) BEFORE `loadGaltechUmbrellaPricing`, so
the Galtech loader is the FINAL authority and its priced state wins. removeSunbrella
no-ops for Galtech because seedGaltech attaches only Galtech fabrics.

## cart_items FK edge case (when detaching fabrics)
Deleting/replacing `product_fabric_options` for a product triggers composite FK
`cart_items_product_fabric_fk` `ON DELETE SET NULL`, which tries to null the
NOT NULL `cart_items.product_id`. Always delete affected `cart_items` rows FIRST
before detaching fabrics (the loader does this).
