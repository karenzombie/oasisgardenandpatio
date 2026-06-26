---
name: Add-on pairing-target quantity
description: Why product add-on pairing targets need a per-parent-unit quantity (not a flat 1).
---

# Add-on pairing-target quantity

The product add-on subsystem enforces pairing: selecting any "triggering" add-on
auto-requires every "pairing target" add-on. The catalog rule is that the pairing
target is required **once per triggering item**, NOT once total.

**Concrete case (Marella Resort Cabana):** the two walls each trigger pairing; the
Entrance Half Curtains is the pairing target. Selecting BOTH walls must add **two**
half-curtain pairs, not one.

**Why:** a Set-of-option-ids model collapses the target to a single row, silently
undercharging the money path when more than one trigger is selected — a high-risk
pricing defect.

**How to apply:**
- Add-ons carry a per-parent-unit `quantity` (default 1). Pairing target quantity =
  number of selected triggering add-ons; every other add-on = 1.
- Fold that quantity into EVERY place money is computed: cart totals, online + quote
  checkout subtotals, the immutable order snapshot, the PDP price preview, and cart
  display. Miss one and that surface undercharges.
- The order snapshot stores the TOTAL count (per-unit qty × parent qty).
- Min-order-qty has the same trap: enforce it on cart UPDATE, not just add — the
  finish-based minimum was originally only checked on add-to-cart.
