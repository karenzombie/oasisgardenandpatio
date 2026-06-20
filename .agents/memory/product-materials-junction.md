---
name: product material_id → product_materials junction
description: Durable gotchas from migrating products from a single material_id FK to the product_materials junction table.
---

# products.material_id → product_materials junction

`products.material_id` (single FK) was replaced by the `product_materials`
junction (product_id, material_id, display_order; unique(product_id, material_id)).
Material is now many-to-many.

**Why this is a trap:** typecheck and app routes can be fully green while
peripheral one-off **scripts** still reference the dropped `material_id` column
and break only at *runtime*. When dropping/replacing a column, grep the WHOLE
repo (including `scripts/src/`) for the column name in both TS and raw SQL
strings — not just the app code. Past misses: `scripts/src/syncProd.ts`
(UPDATE products SET material_id) and `scripts/src/exportProducts.ts`
(LEFT JOIN materials ON p.material_id).

**How to apply:**
- Scripts that wrote a single material must become junction writes. For
  "set product to exactly material X" use a replace-all data-modifying CTE:
  `WITH matched AS (...), del AS (DELETE FROM product_materials WHERE product_id IN (...) AND material_id IS DISTINCT FROM X) INSERT ... SELECT id, X FROM matched ON CONFLICT DO NOTHING`.
  Postgres runs unreferenced data-modifying CTEs to completion, so the DELETE
  fires even though nothing reads `del`.
- Export/report queries that need a single material string must aggregate the
  junction (e.g. `LEFT JOIN LATERAL (SELECT string_agg(name,...), string_agg(slug,...) FROM product_materials ...) ON true`).
- O.W. Lee material sync precedence is intentionally order-dependent
  (wrought-iron pass first, aluminum second → overlaps end up aluminum),
  mirroring the old sequential UPDATEs. Don't "fix" it without checking that.
