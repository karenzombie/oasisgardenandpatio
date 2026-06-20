---
name: Compatible Recommendations feature
description: How PDP compatible-item recommendations are stored and the SKU quirk that bit Phase 1.
---

# Compatible Recommendations (PDP)

Data-driven map in `product_recommendations` (source_sku → compatible_sku, is_recommended, display_order). The API joins compatible_sku to `products.sku` and only returns rows where the product is active AND availableOnline; the section is suppressed when nothing qualifies. Future phases = SQL inserts only, no code.

**Why this matters / the gotcha:** the mapping keys on the *real* `products.sku`, and TG AKZ base products carry a trailing `-_` suffix — the bases are `BASE-13-_`, `BASE-13R-_`, `BASE-AKZ-_`, NOT the clean `BASE-13` etc. a spec/author would write. Seed with the actual DB sku or the join silently returns nothing. (Same SKU-drift family as per-manufacturer-price-storage.)

**How to apply:** when adding new recommendation rows, look up the live `products.sku` first (drift/suffixes are common); a non-existent or not-yet-online compatible_sku is harmless — it just stays hidden until that product exists and is availableOnline. At most one is_recommended per source_sku is enforced by a hand-made partial unique index `product_recommendations_one_rec_per_source_uq` (Drizzle's pinned version has no `.where()` partial-index builder, so it lives in the DB, documented in the schema file).
