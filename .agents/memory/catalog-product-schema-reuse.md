---
name: CatalogProduct / FeaturedProduct schema reuse
description: Adding required fields to these OpenAPI schemas breaks sibling endpoints that reuse them — populate every producer.
---

Adding a `required` field to `CatalogProduct` or `FeaturedProduct` in `lib/api-spec/openapi.yaml` affects more endpoints than the obvious list route, because both schemas are reused:

- `CatalogProductDetail` is `allOf: [CatalogProduct, ...]` → the product detail route `/products/by-slug/:slug` inherits the new required field and its `.parse()` throws 500 unless the field is supplied.
- `FeaturedProduct` is reused by BOTH the featured list (`/products/featured`) AND the popular product endpoint (`/products/popular` in `popularProducts.ts`).

**Why:** these are Zod-validated responses; a missing required key makes `.parse()` throw, and the route returns an HTML error page (so JSON consumers see "Unexpected token '<'"). The `check-image-urls` validation surfaces this as a SKIP/parse-error on `/products/popular` and the detail check — treat those SKIPs as a real signal, not noise.

**How to apply:** after editing these schemas + codegen, populate the new fields in EVERY producer: catalog list, featured, popular, and by-slug. Smoke-test all four endpoints, not just the one you changed.

Related: starting-price computation lives in `artifacts/api-server/src/lib/startingPrices.ts` (`computeStartingPrices(ids)`); call it per-route. Sale is "active" only when `sale_price > 0` (matching cart/PDP), never merely non-null.
