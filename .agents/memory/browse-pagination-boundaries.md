---
name: Customer browse pagination boundaries
description: How all customer browse screens must handle out-of-range / invalid page params consistently
---

All customer browse screens (Shop, Search, ManufacturerProducts) share one
BrowsePagination component and MUST handle page bounds the same way:

1. Sanitize the requested page to `>= 1` before it is used (`Math.max(1, Number(...) || 1)`).
   On server-paginated pages (Shop, Search) the API `page` zod schema is `min(1)`,
   so an un-sanitized `?page=-1`/`?page=0` returns a 400.
2. Clamp the *displayed* page to `totalPages` (`Math.min(requested, totalPages)`).
3. Add a normalization `useEffect`: when `total > 0 && requestedPage > totalPages`,
   call `updateSearch({ page: String(totalPages) })`.

**Why:** clamping the display alone is not enough on server-paginated pages —
the API still receives the raw out-of-range page and returns an empty items
array (you'd see "13–24 of 24" but no products). The effect rewrites the stale
URL so the query refetches the correct slice. The effect converges in one update
(condition goes false after the rewrite), so no loop; `total === 0` is safe.

**How to apply:** any NEW customer browse screen that adds BrowsePagination must
replicate all three steps. ManufacturerProducts is client-sliced (no API page),
so step 1's 400 risk doesn't apply there but the clamp + normalization still do.
