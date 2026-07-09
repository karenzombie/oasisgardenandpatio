---
name: Manufacturer finish pool vs explicit product finish options
description: Why a product's finish pool must never be merged unconditionally with explicit product_finish_options — pool is manufacturer-wide and can leak unrelated finish types.
---

# Manufacturer finish pool vs explicit product finish options

`product_finish_pools` expands to EVERY active `finishes` row for a manufacturer,
with no filter on `finishes.description`. A single manufacturer can own multiple
unrelated finish *types* under one manufacturer_id (e.g. Homecrest has 11 "Frame
finish" swatches AND 11 separate "Table finish" swatches for a different product
line). If a product has its own explicit `product_finish_options` rows AND also
has a `product_finish_pools` row (common — many products carry both), naively
UNIONing pool + options bleeds in every unrelated finish from the pool.

**Why:** this caused Homecrest Mode's PDP to show a bogus "Tile Color" group
alongside "Frame Finish" — the pool pulled in Homecrest's 11 unrelated table
finishes even though Mode had its own correct 11 frame-finish options wired.

**How to apply:** treat the pool as a **fallback only** — query
`product_finish_options` first; only fall back to expanding the manufacturer pool
when the product has ZERO explicit option rows. Do NOT "fix" this with a global
description regex/ILIKE filter on the pool query — other manufacturers/products
may legitimately want a pool that mixes finish types, and a hardcoded filter
breaks silently for them. Apply this same option-count-gates-pool-query pattern
everywhere the pool is read: PDP by-slug, cart finish validation, and admin
product detail (all three had the same duplicated bug).
