---
name: Category management & seed drift
description: How product categories are really managed vs. the stale seed list; the Tables/Coffee&Side Tables conversion.
---

# Category management

- The live `categories` table is NOT sourced from `scripts/src/seed.ts` `TOP_LEVEL_CATEGORIES`. That seed list (slugs like `outdoor-dining`, `outdoor-seating`) does **not** match the real taxonomy, whose slugs are mostly `cat-`-prefixed (`cat-umbrellas`, `cat-coffee-side-tables`, `cat-dining`, …). Real categories are managed via the admin UI, not the seed.
  - **Why:** running the seed will not reproduce the real category set, and editing the seed does not change live data. Don't treat seed.ts as the category source of truth.
  - **How to apply:** to add/modify a category, do a direct SQL insert/update (or admin UI) against the DB; optionally mirror into seed.ts for documentation, but the DB is authoritative.
- Slug convention drifted: the two newest categories before "Tables" (`outdoor-rugs`, `protective-covers`) dropped the `cat-` prefix, so a plain slug like `tables` is acceptable/consistent with recent additions.
- The admin product-edit category dropdown is data-driven from `useAdminListCategories()` (returns all categories); a new active category appears automatically with no frontend code change. The storefront `/api/categories` only lists active categories, so deactivating one hides it there.

# "Coffee & Side Tables" → sub-category conversion (June 2026)

- New top-level category **"Tables"** (slug `tables`) was created. "Coffee & Side Tables" (the old category) was converted into a **sub_category value**: its ~470 products were moved to the Tables category with `sub_category = 'Coffee & Side Tables'`, and the old category was **deactivated (is_active=false), not deleted** (kept for history; deletion would null product category refs via onDelete: set null).
- `products.sub_category` / `sub_material` are free-text admin-only columns (camelCase `subCategory`/`subMaterial` in API/UI, snake_case in DB), not storefront-facing. Karen backfills OW Lee values via a shell Python script, and the user uploads product update files that overwrite category/sub_category.
