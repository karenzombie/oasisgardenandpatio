---
name: Galvanized base stem + top-cover accessories
description: How the Frankford galvanized-base "Stem" and "Aluminum Top Cover" optional pickers are modeled across PDP, cart, checkout, and the staff order builder.
---

# Galvanized base accessories (Stem + Aluminum Top Cover)

Two optional pickers on the 7 Frankford galvanized base products, mirrored on the
customer PDP AND the staff order builder.

- **Stem**: existing standalone products. Becomes an ordinary INDEPENDENT line
  (qty editable, removable on its own). Initial qty = base qty. No parent tie.
- **Aluminum Top Cover**: a HIDDEN product (`available_online = false`), one cover
  product per base (1:1). NOT standalone. Price varies by finish (6 Frankford
  finishes). The cover line is tied to its base and is qty-locked to the base,
  removed with the base, and cannot be detached.

**Data model / tie mechanism:**
- Cart: `cart_items.parent_cart_item_id` (FK → cart_items, ON DELETE CASCADE).
- Order: `order_items.parent_order_item_id` (FK → order_items, ON DELETE CASCADE).
- Picker config tables: `product_stem_options`, `product_cover_options` (1:1),
  `product_cover_finish_prices` (per-finish price).

**Why the cover must never become an orphan line:** it's a hidden product; if its
parent link is lost it shows up as a standalone line that can't be reached on the
storefront and breaks the 1:1 invariant. The staff builder therefore makes cover
lines fully read-only (description + product locked, qty disabled, remove hidden);
only the base drives qty/removal, which cascades to the cover.

**Parent linking on order create (deterministic):**
- Customer checkout (`checkout.ts`): inserts base lines BEFORE accessory lines,
  one-by-one, keeping a `cartItemId → orderItemId` map so a cover's
  `parent_order_item_id` resolves to an already-inserted parent.
- Staff order builder (`adminOrders.ts`): the client sends `parentItemIndex`
  (cover's base position within the submitted items array; resolved from a
  client-side `lineKey`). Server bulk-inserts then sets `parent_order_item_id` by
  index — a single Postgres `INSERT…VALUES…RETURNING` returns rows in input order.
  `parentItemIndex` is bounds-checked (integer, in-range, not self).

**Staff picker shape:** `GET /admin/products/:id/picker` mirrors the customer
`by-slug` route — it returns `stemOptions[]` and `coverOptions` (nullable) using
the same `CatalogStemOption` / `CatalogCoverPicker` / `CatalogCoverFinish` schemas.
Keep the two routes' stem/cover computation in lockstep.
