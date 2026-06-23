---
name: Manufacturer page collection filter
description: How the storefront manufacturer-page COLLECTION filter is derived and why the DB column can't be used directly.
---

# Manufacturer page COLLECTION filter

The COLLECTION filter on the manufacturer products page (artifacts/web `ManufacturerProducts.tsx`,
`buildCollectionMap`) is derived from each product **name's first word**, kept only when ≥2 products
share it. It is NOT read from `products.collection`.

**Why not the DB `collection` column:** coverage is wildly inconsistent. It's clean for some
manufacturers (o-w-lee, hanamint, homecrest, northcape, sunset-west partial) but for
telescope-casual and sunset-west it holds full product-description strings (e.g. "30 Round Bar
Table W Hole MGP Slat Top Tables"), so wiring the filter to that column would wreck those
manufacturers. The name heuristic is intentional.

**Multi-word collections** (e.g. OW Lee "San Cristobal", "Standard Aluminum", "Standard Iron",
"Modern Aluminum") break the first-word heuristic — "San Cristobal" → "San", and
"Standard Aluminum"/"Standard Iron" collapse into one "Standard". Fix pattern: the per-manufacturer
`COLLECTION_MULTIWORD` map (keyed by manufacturer slug), matched longest-phrase-first in
`collectionKeyFor()`. Mirrors the older `COLLECTION_NAME_ALLOWLIST` (which whitelists numeric-looking
first words like NorthCape "6510").

**How to apply:** when a manufacturer's collection name spans >1 word and shows up truncated/merged
in the filter, add the full phrase(s) to `COLLECTION_MULTIWORD[<slug>]`. Verify against the DB
`collection` column for that one manufacturer (when clean) to get the authoritative phrase list, and
confirm no unrelated product names share the leading word.
