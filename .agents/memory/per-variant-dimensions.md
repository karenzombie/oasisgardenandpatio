---
name: Per-variant dimensions + weight on PDP
description: How umbrella size variants surface their own dimensions/weight on the product page, with lead-variant default and product-level fallback.
---

# Per-variant dimensions + weight

`product_variants` carries both `weight` and `dimensions` (free-text spec string),
each nullable. The PDP spec sheet shows the **selected** configuration's values,
defaulting to the **lead variant** (lowest `display_order`) on page load, and
falling back to the product-level `products.dimensions` / `products.weight` when
the variant value is null.

**The display rule:** `displayVariant = selectedVariant ?? variants[0]`, then
`effectiveWeight = displayVariant?.weight ?? data.weight` and likewise for
dimensions. The API returns variants ordered by `display_order asc`, so
`variants[0]` is the lead. Both the spec rows and the "No specifications
available" empty-state guard key off the `effective*` values, not the raw
product-level fields.

**Why:** brief required size-specific specs that update on selection but never
regress products whose variants aren't populated — hence the null fallback and
the lead-variant default so something real shows before the customer picks a size.

**How to apply:** any new per-variant spec field follows the same chain (add
nullable column → serialize in `/products/by-slug` + admin config GET/PUT → add to
all three OpenAPI variant schemas: CatalogProductVariant, AdminProductVariant,
AdminProductVariantInput → admin hydrate/save/draft/blank-creator round-trip).
Data is loaded verbatim from a reviewed dataset matched on `variant_sku` EXACTLY
— never inferred. Unmatched SKUs (e.g. not-yet-created products) are logged and
skipped; the loader is rerunnable. Before deploy, confirm prod has the new column
(schema parity).
