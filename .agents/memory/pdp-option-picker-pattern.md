---
name: PDP option picker pattern
description: All PDP option pickers (frame finish, fabric, tile color) must use the shared FabricSwatchDialog modal + recap pattern — never inline swatch grids.
---

# PDP option picker pattern (site-wide convention)

Every product-option picker on a PDP — Frame Finish, Fabric, Tile Color, and any
future option type — uses ONE pattern: a labeled "Browse swatches" button that
opens the shared `FabricSwatchDialog` modal, with a single recap block below the
buttons listing each confirmed selection (swatch thumbnail + label/value).

**Why:** the team standardized on the fabric picker UX (umbrella PDP is the
reference). Inline swatch grids are explicitly the wrong pattern and were removed.
Consistency across all product types beats per-type custom UI.

**How to apply:**
- Do NOT build a new picker component. Reuse/extend `FabricSwatchDialog`.
- `FabricSwatchDialog` takes optional labeling props (`title`, `noun`,
  `nounPlural`, `confirmLabel`, `searchPlaceholder`) with fabric defaults, so it
  serves finishes too. Map a finish to `FabricSwatchOption` with `itemNumber:""`,
  `grade:null`, `colorFamily:null`; pass `isGradeMode={false}` (suppresses
  grade/color filter rows; search-by-name still works).
- The modal is select-only (no toggle-off), matching the fabric picker — by design.
- Recap row style mirrors the umbrella recap: `h-14 w-14` swatch + muted label +
  medium-weight value; the recap block only renders when ≥1 selection exists.
- `ProductOptionPickers.tsx` is the customer-facing (quote-only / not-available-
  online) picker set; the in-cart umbrella fabric flow lives inline in Product.tsx.
