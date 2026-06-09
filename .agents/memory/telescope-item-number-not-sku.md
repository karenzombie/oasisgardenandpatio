---
name: Telescope item_number is a price code, not a SKU
description: Why Telescope products use generated TC- SKUs instead of the CSV item_number column
---

# Telescope `item_number` is a shared price code, not a per-product SKU

The Telescope product master CSV has an `item_number` column, but it is a **shared
pricing/group code**, not a unique product identifier. ~254 rows carry an item
number yet there are only ~42 distinct values: e.g. `50Q0` covers 75 products and
`8R60` covers 28 different chairs across unrelated collections (Aruba, Avant, Bazza,
Dune, Kendall, Leeward, Reliance…).

**Decision:** keep the generated `TC-{collection}-{product}` slug SKUs for all
Telescope products. Do NOT replace them with `item_number`.

**Why:** `products.sku` has a GLOBAL unique index (`products_sku_unique`). Setting
`sku = item_number` would violate uniqueness and the SKU would no longer identify a
single product. Telescope simply does not publish usable per-product SKUs.

**How to apply:** If a future request asks to "use the real Telescope SKUs from the
CSV," surface this first. The clean alternative is to store `item_number` as a
separate manufacturer/price-code field while keeping the unique generated SKU.

## Related audit result (other manufacturers)
- Shoreline: source CSV has NO sku column at all → `SL-{slug}` SKUs are generated; user chose to keep.
- O.W. Lee: 25 table-top products have descriptive-name SKUs (e.g. "24 Round Dekton Top") because those rows had no source code; user chose to keep.
- All other manufacturers' DB SKUs match their CSV source exactly; NC/SW/AC17-/SK22- prefixes are real source SKUs, not invented.
