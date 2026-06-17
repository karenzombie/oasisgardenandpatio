---
name: OW Lee v2 catalog source-of-truth load
description: How the OW Lee (mfr 13) catalog was rebuilt from a clean CSV + image folder, and the non-obvious decisions baked into the loader/image scripts.
---

# OW Lee v2 source-of-truth load

A clean CSV + revised image folder were made the source of truth for ALL OW Lee
(manufacturer_id=13) product data. Two idempotent scripts do this
(`scripts/src/loadOwLeeV2.ts` = products/specs/material; `scripts/src/uploadOwleeImagesV2.ts` = images).

**Why these decisions:**
- **Keep existing name + slug for matched products.** The storefront collection
  filter (`ManufacturerProducts.tsx`) groups by the product NAME's first word
  appearing ≥2×. Renaming matched products risks breaking that grouping, so the
  loader only updates description/short_description/material/specs/flags for
  existing rows. New rows get a collection-prefixed name so they group.
- **Dup fire-pit SKUs.** Three SKUs (`5113-3156O`, `5113-3156C`, `5113-42RDC`)
  exist as BOTH a Phoenix (wrought iron) and a Volante (aluminum) product in the
  CSV. Product SKUs are globally unique, so both are stored suffixed `-PH`/`-VO`.
  Loader migrates any bare-SKU row to its suffixed form (by current
  `specs.collection`) BEFORE upserting. For these dup SKUs ONLY, names are
  normalized to collection-prefixed so both variants group under the filter
  (the resulting names can read redundantly, e.g. "Phoenix 31x56 ... Phoenix
  Fire Pit" — acceptable, grouping matters more).
- **specs are MERGED, not replaced.** CSV `specifications` free text
  ("Label: value | ...") is parsed into structured keys; only CSV-provided keys
  override existing specs, so dimensions the CSV omits survive.
- **Two image-name override SKUs** whose photo is named descriptively, not by
  SKU: `E-4284RTD` and `MM-3658RTU` (see `OVERRIDE_FILE` in the image script).
- All OW Lee products are quote-only (no pricing in the CSV).

**Outcome / parity check:** 109 created + 175 updated on BOTH dev and prod
(identical). All 284 CSV-backed products got images. Prod has a few extra
imageless OW Lee rows (e.g. SKU "PENDING") — these are pre-existing DB-only
products NOT in the CSV and are intentionally left untouched.

**How to apply:** to refresh again, drop a new `owlee_products_clean_v2*.csv`
in attached_assets + image folder, re-run both scripts (loader first), then run
the image script. Idempotent. Sync prod by overriding `DATABASE_URL` with
`$PROD_DATABASE_URL` (see seed-scripts-prod memory).
