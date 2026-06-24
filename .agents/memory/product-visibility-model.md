---
name: Product visibility vs purchasability model
description: How available_online gates storefront visibility, how Call-for-Price vs Add-to-Cart is decided, and the rule that new products always default to visible.
---

# Product visibility vs. purchasability

Two independent concepts, often confused:

- **Visibility** = `products.available_online`. EVERY customer-facing route filters `available_online = true` (product list, search, facets, PDP by-slug, featured/popular, recommendations). A product with `available_online = false` is hidden from the storefront entirely, even if `is_active = true`. The PDP by-slug 404s for non-online products.
- **Purchasability** (Add to Cart vs Call for Price) is decided separately, NOT by `available_online`. A visible product shows **Add to Cart** only when it has a `price` AND `show_price_online = true` (and is not quote-only); otherwise it renders **Call for Price** but remains fully visible/browsable. (Reference example: O.W. Lee SKU 3433-CS is `available_online = true`, `show_price_online = false`, no price → visible as Call for Price.)

**Rule: new product additions ALWAYS default to visible** (`available_online = true`).
**Why:** the client wants every newly added product to show up by default; if they want to hide it or turn on Add-to-Cart-with-price, they do that explicitly in the admin UI.
**How to apply:** the default is already enforced at all four creation paths — DB column `.notNull().default(true)`, admin create form initial state, create API route (`availableOnline ?? true`), and CSV import (`parseBool(..., true)` default when the cell is blank). If you add a NEW creation path (script, bulk tool, new endpoint), it must also default `available_online` to true. Do NOT make `is_active` alone the visibility gate — some active products are intentionally hidden (e.g. O.W. Lee porcelain/dekton/mesh table-top accessories), so `available_online` must remain the gate.
