---
name: TG Sunbrella fabric-grade upcharge
description: Where/how the Treasure Garden + Sunbrella per-item grade upcharge is applied across pricing surfaces.
---

# TG Sunbrella fabric-grade upcharge

Treasure Garden products with a Sunbrella canopy carry a per-item grade upcharge:
grade B +$100, grade C +$190, grade A (and anything else) +$0. Gate: product
manufacturer == "Treasure Garden" AND fabric manufacturer == "Sunbrella". Sunbrella
DB grades are exactly A/B/C.

**Decision:** the upcharge is *folded into* the displayed MSRP and Sale price (and the
cart/checkout snapshot price), NOT shown as a separate line item. The fabric dropdown
option label is the only place the delta is shown explicitly (e.g. "(+$100.00)"),
matching the old site's UX.

**Why:** the user explicitly chose the fold-in approach over a separate surcharge row,
but wanted selection/add-to-cart to "feel similar" to the old site (inline label).

**How to apply:** the upcharge value comes from a single helper, `fabricGradeUpcharge`,
duplicated in `artifacts/web/src/lib/fabricUpcharge.ts` and
`artifacts/api-server/src/lib/fabricUpcharge.ts` — keep the two in lockstep. It must
only be added when a fabric is actually chosen and never for frame-only purchases.
Any new pricing surface (display, cart snapshot, checkout snapshot) must apply it
consistently or totals will disagree.
