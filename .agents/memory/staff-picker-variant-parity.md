---
name: Staff order builder variant parity
description: The staff order picker must surface every PDP option dimension and price lines identically to the customer PDP.
---

# Staff order builder ↔ customer PDP parity

The staff order builder's `ProductPickerDialog` (`artifacts/web/src/staff/pages/agent/NewOrder.tsx`,
shared by normal / quick-order / restock modes) MUST surface every product option
dimension the customer PDP shows, and price the resulting line identically.

**Rule:** option visibility is driven by *presence of options*, never by pricing
mode. Show discrete frame finishes whenever `finishes.length > 0` — do **not**
gate them on `isGradeMode`. (Bug that prompted this: SKU 27175-CC OW Lee Aris
Lounge Chair has 10 discrete finishes + 83 fabrics and is NOT grade-priced, so the
old `isGradeMode` gate hid the finish picker entirely.) Same principle for fabrics,
variants, and finish-in-variant / wind-vent combos.

**Why:** staff orders must be configurable exactly like a customer order or the
line is incomplete / mispriced. A new variant dimension added to the PDP is
silently missing from staff orders if the picker keys visibility off mode.

**How to apply:**
- Picker endpoint `GET /admin/products/:id/picker` (`adminProducts.ts`) must mirror
  the customer `by-slug` route shape — including discrete `finishes` with
  `upchargeMsrp`/`upchargeSale` (option rows win over pooled, pooled = "0"),
  plus `description` and `minOrderQty` (the `CatalogFinishOption` schema marks
  all of these required, so omitting any makes the live payload violate the
  generated type even though the route does not `.parse()` its output).
- Price ONCE, in the dialog. The dialog computes the canonical per-unit price
  (grade price, else frame-only price when frame-only chosen, else base + variant
  adjustment, plus finish upcharge) and passes it to `applyPickedProduct` via the
  `unitPrice` arg. `applyPickedProduct` must NOT recompute price — doing so
  previously (a) ignored frame-only selections, persisting full fabric-inclusive
  price, and (b) risked double-counting the finish upcharge.
- Wind-vent / finish-in-variant is satisfied by the combined variant dropdown
  (every Finish×Vent combination is selectable there); a split into separate
  selectors is cosmetic only, not a parity requirement.
