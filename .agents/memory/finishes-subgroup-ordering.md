---
name: Finishes page sub-group ordering
description: How sub-groups are ordered within a manufacturer on the public Finishes page, and how to control order without disturbing other brands.
---

# Finishes page sub-group ordering

On the public Finishes page (`artifacts/web/src/pages/Finishes.tsx`), a
manufacturer's swatches are split into sub-groups keyed by
`finish.collection ?? finish.description`. Sub-groups render **alphabetically by
display label** by default.

**Rule:** to force a specific sub-group order for ONE manufacturer (e.g. Frankford
wants Frame Finishes → Valances → Base Plate Top Colors, which alphabetical would
break since "Base Plate" sorts first), use the `SUBGROUP_ORDER` map keyed by
manufacturer name → { subGroupKey: rank }. The sort applies the per-brand rank
first, then falls back to alphabetical.

**Why not a global displayOrder sort:** sub-group `display_order` ranges overlap
or are inconsistent across brands (Frankford Frame 0-8 and Valances 0-7 interleave;
Telescope sub-groups all start near 0; Tropitone/OW Lee/Treasure Garden use spaced
1000-blocks). A global min-displayOrder sort silently reorders Telescope, Tropitone,
and NorthCape. Per-manufacturer override is the only change with zero side effects.

**How to apply:** add an entry to `SUBGROUP_ORDER[brandName]` with the raw keys
(the stored `description` value like `"Frame Finish"`, or the `collection` value).
Brands absent from the map stay fully alphabetical.

**Detail dialog (`FinishProductsDialog`):** finishes WITH a `collection` set are
treated as shape/panel images — the cropped 80×80 header thumbnail is hidden and
the FULL image is rendered at the bottom (`w-full object-contain`). Plain frame
finishes (no collection) keep the small square swatch.
