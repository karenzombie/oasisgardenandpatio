---
name: Manufacturer page collection filter
description: How the storefront manufacturer-page COLLECTION filter is sourced (DB field, never inferred).
---

# Manufacturer page COLLECTION filter

The COLLECTION filter on the manufacturer products page (artifacts/web `ManufacturerProducts.tsx`)
reads **directly from the DB `products.collection` column**, surfaced as `CatalogProduct.collection`
in the API. It is NOT inferred from the product name.

**Why:** user principle — every filter must map to a real product DB field and ALWAYS use that over
inferred data (same rule the Type filter already follows via `categorySlug`). An earlier name
first-word heuristic (`buildCollectionMap`/`collectionKeyFor` + per-manufacturer override maps
`COLLECTION_NAME_ALLOWLIST`/`COLLECTION_MULTIWORD`/`COLLECTION_PREFIX_STRIP`) was deleted entirely.

**Data quality is the manufacturer's responsibility, by design.** `products.collection` is clean for
some manufacturers (o-w-lee, hanamint, homecrest, northcape) but holds garbage (full descriptions)
for telescope-casual & sunset-west, and is empty for others. Per explicit user decision (Option 1:
switch everywhere, no per-manufacturer suppression), dirty manufacturers show messy collection chips
until the user cleans their own data — do NOT reintroduce inference or suppression logic.

**API wiring (the gotcha):** `collection` is a *required* field on the `CatalogProduct` schema, which
is reused via `allOf` by `CatalogProductDetail` (the by-slug PDP response). So EVERY producer of
`CatalogProduct`/`CatalogProductDetail` must SELECT `productsTable.collection` and include it in the
payload, or that endpoint 500s at `.parse()`. Currently both the list route (`/products`,
listCatalogProducts) and the PDP route (`/products/by-slug/:slug`) populate it. The featured/popular
routes use the separate `FeaturedProduct` schema and are unaffected.

**How to apply:** if you ever add another endpoint returning `CatalogProduct`/`CatalogProductDetail`,
add `collection: productsTable.collection` to its select AND the response payload. The
manufacturer-page Collection facet, Type faceting, and product filtering all key on `p.collection`.
