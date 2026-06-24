---
name: Storefront dynamic facets
description: Why storefront filters are faceted (live-data-derived) and drop customer-configurable attributes; the /catalog/facets contract and its visibility-parity rule.
---

# Storefront dynamic / faceted filters

Storefront product filters (Shop, Search, ManufacturerProducts) are **dynamic and faceted**: each filter option is computed from products matching the OTHER active selections, so zero-result options are hidden and the lists adapt automatically as catalog data changes.

**Decision: no storefront filters on customer-configurable attributes** (frame finish, fabric, wind vents).
**Why:** manufacturers use different codes/names for the same physical color/finish, so a cross-catalog finish/fabric filter is meaningless and misleads shoppers. The old `/catalog/finishes` only ever matched optionLabel `Frame Finish` (1 row) and was global/never narrowed. These attributes are still browsable as **swatch pages** (Fabrics/Finishes) and surface as **search-result swatch displays** in Search (useListCatalogFabrics / useListCatalogManufacturerFinishes) — those are results, NOT filters; keep them.

**Endpoint:** `GET /catalog/facets` (params: q, categorySlug, manufacturerSlug, materialSlug, collection, subCategory, onlineOnly) returns `{categories, manufacturers, materials, collections, subCategories}`. Server pattern: a `buildConditions(exclude)` helper applies all active product conditions EXCEPT the facet's own dimension, then one distinct query per dimension. ManufacturerProducts now ALSO uses `/catalog/facets` (manufacturerSlug fixed) + server-side paginated `useListCatalogProducts` — the old fetch-all-pages client-side faceting hack is gone; its URL param `type` was renamed to `category`.

**subCategory dimension** = `products.sub_category` free-text admin column (camelCase `subCategory` in API/UI). It is NOT the `categories.parentId` hierarchy. Storefront convention: the Sub Category filter is shown only AFTER a category is selected (gated on `activeCategory && subCategoryOptions.length>0`), mirroring how Collection is gated behind a selected manufacturer. URL param is `subcategory`; clear it whenever the category changes. All three surfaces (Shop, Search, ManufacturerProducts) now expose the full set: category, sub-category, brand, collection (after brand), material.

**Critical parity rule:** facet option queries MUST mirror the public list endpoints' entity-level visibility constraints, or they leak hidden entities:
- categories facet → `categories.isActive = true`
- manufacturers facet → `manufacturers.isActive = true` AND `slug != 'andrew-sewing'`
- materials facet (and the materialSlug EXISTS subquery) → `materials.isActive = true`
**How to apply:** any time a new public list route adds a visibility filter, add the same filter to the matching facet query. Note facets are product-gated (only values with matching products appear), so they can legitimately return FEWER values than the public list endpoints (e.g. an active material with zero products shows in `/materials` but not in facets) — that difference is intended, not a bug.
