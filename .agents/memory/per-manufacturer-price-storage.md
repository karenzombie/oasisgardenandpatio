---
name: Per-manufacturer price storage
description: Each manufacturer stores prices differently; never assume a uniform model when auditing dev→prod parity.
---

# Price storage is NOT uniform across manufacturers

When checking whether prices are synced dev→prod, you MUST check the storage
mechanism per manufacturer. Trusting a single count (e.g. `variant_grade_prices`)
will miss whole manufacturers and waste the user's time/money.

Known storage models (manufacturer IDs in MEMORY/scratchpad):
- **Treasure Garden (12)**: flat prices on `products.price` / `products.msrp` /
  `products.sale_price`. NO `variant_grade_prices` (it's 0 in dev too). Loaded by
  `scripts/src/importTreasureGardenPrices.ts` from
  `attached_assets/TreasureGarden_*Prices*.csv`, matched by `products.sku`.
  `product_variants` has NO `price` column.
- **Galtech (29) / Frankford (28)**: grade engine — prices live in
  `variant_grade_prices(variant_id, grade, msrp, sale_price)`.
- **Most others** (Couture Jardin, Hanamint, Homecrest, NorthCape, Shoreline,
  Summerset, Sunset West, Telescope, Tropitone, O.W. Lee): 0 flat product prices
  AND 0 grade prices in BOTH dev and prod — they're quote-only or priced by other
  means. No gap there as of this audit.

**Why:** TG prices were missing in prod for multiple sessions because audits only
compared `variant_grade_prices` (0=0 for TG) and never checked the flat
`products.price/msrp/sale_price` columns, which were fully populated in dev and
empty in prod.

**How to apply:** To audit prices dev↔prod, compare per-manufacturer coverage of
BOTH `products.{price,msrp,sale_price}` AND `variant_grade_prices`. Run the
matching loader against prod (`DATABASE_URL=$PROD_DATABASE_URL ... importTreasureGardenPrices.ts`)
and add it to `scripts/post-merge.sh` so it self-heals every deploy.

## Identifying-key drift can silently break SKU-matched imports
Prod had the "Steel" base under SKU `BS709-2.0` while dev (and the price CSV) used
`BS70-2.0` (same name + same slug `steel-bs709-2-0`). The SKU-matched price import
therefore skipped it in prod only. Fix lives in `syncProd.ts` (`syncTreasureGardenSkus`),
idempotent. **Lesson:** when a SKU-matched import leaves exactly one prod row
untouched, suspect a drifted SKU, not a missing CSV row — diff the full SKU sets.
