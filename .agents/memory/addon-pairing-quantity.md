---
name: Add-on pairing-target quantity
description: Why product add-on pairing targets need a per-parent-unit quantity (not a flat 1), and where that multiplier must be folded.
---

# Add-on pairing-target quantity

The product add-on subsystem enforces pairing: selecting any `triggersPairing`
add-on auto-requires every `isPairingTarget` add-on. The catalog rule is that the
pairing target is required **once per triggering item**, NOT once total.

**Concrete case (Marella Resort Cabana):** the two walls (MLA-FW, MLA-SW) each
`triggersPairing`; the Entrance Half Curtains (MLA-HC) is the `isPairingTarget`.
Selecting BOTH walls must add **two** HC pairs, not one.

**Why:** a Set-of-option-ids model collapses the target to a single row, silently
undercharging the money path when more than one trigger is selected. This is a
high-risk pricing defect — the line total was missing one HC pair.

**How to apply:**
- `cart_item_addons.quantity` (and `order_item_addons.quantity`) is the per-parent-unit
  multiplier. Pairing target quantity = number of selected triggering add-ons
  (`pairCount`); every other add-on = 1.
- Fold it EVERYWHERE money is computed: cart loadCart subtotal/lineAmount,
  `/checkout` online subtotal + order_item_addons snapshot, `/checkout/quote`
  subtotal, and the PDP client preview (`addonUnitTotal` + the "Your configuration"
  breakdown). Line/amount = `unitPrice * addonQty * parentQty`.
- `order_item_addons.quantity` stores the TOTAL count = `addonQty * parentQty`.
- Cart re-add uses `onConflictDoNothing` on `(cart_item_id, addon_option_id)`, so a
  given add-on signature deterministically yields the same target quantity; only
  rows written by buggy older code would keep a stale quantity (rebuild the line).
