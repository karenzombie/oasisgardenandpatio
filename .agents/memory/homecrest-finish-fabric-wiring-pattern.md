---
name: Homecrest finish/fabric wiring pattern (Allure Sling reference)
description: Canonical DB insert pattern for wiring frame finishes + sling fabrics to a Homecrest seating collection, for scripting future collections without agent involvement.
---

Reference implementation: `scripts/src/wireAllureSlingFinishesFabrics.ts` (dry-run by default, `--commit` to write).

## Tables and columns

For each product in the collection, insert:

1. `product_finish_pools`: one row `(product_id, manufacturer_id)`. NOT used for expansion here — Allure Sling wires explicit options, so this pool row is present but the explicit `product_finish_options` rows are what actually drive the picker (pool is only a fallback when no explicit options exist — see `product-visibility` note below).
2. `product_finish_options`: one row per finish `(product_id, finish_id, display_order, upcharge_msrp="0", upcharge_sale="0")`. `display_order` is 1-indexed in the exact order the finishes were listed in the brief (no re-sorting).
3. `product_fabric_pools`: one row `(product_id, manufacturer_id)`.
4. `product_fabric_options`: one row per fabric `(product_id, fabric_id, display_order)`. `display_order` 1..N, main collection fabrics first, secondary collection(s) appended after, in the exact ID order given.

Both finish and fabric option tables have a `UNIQUE(product_id, finish_id|fabric_id)` constraint — safe to bulk-insert once per product, will hard-fail (not silently skip) on a re-run over already-wired products.

## Idempotency / safety rule

**Before inserting**, query all four tables filtered to the target product IDs. If ANY row already exists for a product in ANY of the four tables, skip that product entirely and report it — never partially wire a product. Do a dry run (report planned insert counts per table, and the skip list) before writing.

## Picker UI — no frontend/API code changes needed

The finish/fabric pickers (customer PDP `ProductOptionPickers.tsx` + storefront `by-slug` route, and staff `/admin/products/:id/picker`) are **fully data-driven**:
- They query `product_finish_options`/`product_fabric_options` directly (joined to `finishes`/`fabrics`), with the pool tables used only as a fallback when a product has zero explicit option rows.
- There is no manufacturer-specific or category-specific gating code — wiring the DB rows is sufficient to make both the customer PDP and staff order builder pickers appear and function.
- One prerequisite: for the frame finish picker to render under the "Frame Finish" heading (vs. being filtered out), the `finishes.description` column for those finish rows must match `/frame\s*finish/i`. Homecrest's existing frame finishes (ids 290-300) already carry `description = "Frame finish"` from prior seeding, so no finish-table edit was needed for Allure Sling — but this is worth checking for any NEW finish rows introduced for a future collection.
- Swatch images resolve via `finishes.imageUrl` / `fabrics.swatchImageUrl` through the existing `toPublicImageUrl()`-wrapped routes; no new upload/storage work is needed if the finish/fabric rows already exist and were previously seeded with images.
