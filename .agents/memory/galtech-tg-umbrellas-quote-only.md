---
name: Galtech/TG umbrellas are quote-only (no Sunbrella, no price)
description: Galtech + Treasure Garden umbrellas/covers dropped Sunbrella fabrics for own fabrics and removed all pricing; the old TG+Sunbrella grade upcharge no longer exists.
---

# Galtech / TG umbrellas: own fabrics + quote-only

Galtech (mfr 29) umbrellas + replacement covers, and Treasure Garden (mfr 12)
umbrellas, use ONLY each manufacturer's own active fabrics (NOT Sunbrella, mfr 11)
and carry NO price. They are `products.quoteOnly = true` → storefront shows the
"Available through a sales agent" panel + wishlist instead of add-to-cart. Galtech
bases/hardware (FLAT_*) and TG bases keep their pricing.

**Why:** a new fabric-grade price list is coming; until then these lines are
quote-only. The historical TG+Sunbrella per-item grade upcharge (B +$100, C +$190)
was deleted entirely — `fabricUpcharge.ts` no longer exists in web or api-server.
Do NOT reintroduce upcharge math on any pricing surface.

**How to apply:**
- Data is enforced by `scripts/src/removeSunbrellaUmbrellaPricing.ts` (idempotent,
  safe-guarded; skips a mfr with no own active fabrics). It runs LAST in
  `scripts/post-merge.sh` so it is the final authority over umbrella state on prod.
- The loaders are consistent with it: `seedGaltech.ts` (own fabrics, no grade
  prices, quoteOnly for UMBRELLA+COVER), `seedTreasureGardenProducts.ts` (TG own
  fabrics, quoteOnly for umbrella categories), `importTreasureGardenPrices.ts`
  (skips umbrella-category products so it never re-prices them).
- Deleting `product_fabric_options` for an umbrella triggers the composite FK
  `cart_items_product_fabric_fk` `ON DELETE SET NULL`, which tries to null the
  NOT NULL `cart_items.product_id`. The migration deletes affected `cart_items`
  rows first (those carts are invalid once the product is quote-only).
