# Agent Brief: Staff Order Tax by Address, With Settings Default When No Address

## Objective

On the staff "Create New Order" screen, tax should follow one simple rule:

- If the order has a shipping address, tax at that address's rate.
- If the order has no shipping address of any kind, tax at the admin Settings default rate, labeled "Store Default Rate".

This applies to staff-created orders only. The customer-facing checkout is already correct and must not change.

There are two parts, because today one type of address is invisible to the tax calc.

## Part 1: Feed the typed drop-ship address into the tax calc (front end)

**Problem being fixed:** the tax quote currently derives its shipping state/ZIP only from a *saved* customer address or the *walk-in* state field. A drop-ship address that staff *types in manually* is never fed to the tax calc, so a typed destination reads as "no address" and gets no jurisdiction rate.

**File:** `artifacts/web/src/staff/pages/agent/NewOrder.tsx`

**What to change:** when the typed custom address is the active shipping destination, the values sent to the pricing quote as shipping state and shipping ZIP must come from that typed address, the same way a saved address already drives them.

- The condition for "the typed address is the destination" already exists in this file as `willUseCustomAddress` / `usingCustomAddress`, but only inside the submit handler. Lift that same condition to component scope and use it as the single source of truth, so the tax derivation and the submit payload cannot drift apart. Do not invent a second, parallel condition.
- Resulting precedence for the quote's shipping state/ZIP: typed custom address when it is the active destination, else the picked saved address, else the walk-in state/ZIP, else none.
- Use the typed state and ZIP exactly as the submit payload already normalizes them (state trimmed and upper-cased).
- These two values (shipping state and ZIP) are used only by the pricing quote in this file. Nothing else reads them, so this change has no other UI side effects.

## Part 2: Default to the Settings rate when there is no address (server)

**File:** `artifacts/api-server/src/routes/adminOrdersPricing.ts`

**What to change:** when the incoming request has no shipping state (null, empty, or whitespace), short-circuit before calling `computeTax` and build the response from the Settings default rate directly. Do not reach the `computeTax` call in that case, and do not modify `computeTax` itself. Today this no-state case flows into `computeTax` and comes back as "Outside nexus" / 0%; the new guard replaces that outcome for the staff route only.

- **taxRate:** the admin Settings default tax rate. It is already loaded in this handler via `loadPricingSettings()`, and it is already a decimal fraction (for example 0.0975). Return it as-is, matching how the current code returns `tax.rate`.
- **taxAmount:** merchandise subtotal times that rate, rounded to cents and returned in dollars, matching the units and rounding the existing path already uses.
- **taxJurisdiction:** the exact label `Store Default Rate`.
- When a shipping state **is** present (any value, CA or otherwise), do nothing differently. Keep the current behavior exactly, including the existing CA-with-no-ZIP fallback to the Settings rate.

With Part 1 in place, "no shipping state" now genuinely means no address of any kind, so this blanket fallback is correct.

## Do NOT touch (guardrails)

- Do **not** modify `computeTax` or `loadPricingSettings` in `artifacts/api-server/src/lib/checkoutPricing.ts`. They are shared with the customer checkout. The no-address fallback must live in the staff route only.
- Do **not** modify `artifacts/api-server/src/routes/checkout.ts`. The customer portal is out of scope and already correct.
- Do **not** modify the internal ZIP rate table in `artifacts/api-server/src/lib/caTaxRates.ts`.
- Do **not** change the order-save logic in `artifacts/api-server/src/routes/adminOrders.ts`. It already persists the rate the screen sends and already forces 0% for restock orders. No change is needed there.
- Do **not** change the manual tax override behavior, the delivery calc, or the submit payload's `customShippingAddress`. Out of scope.

## What stays unchanged (footprint confirmation)

- Saved address on file: still taxed by that address's jurisdiction rate. This was confirmed working and must stay working.
- CA address with no ZIP: already falls back to the Settings rate through existing logic. Leave it.
- Delivery: computed from ship-to-store and product attributes, not from state or ZIP, so feeding the typed address into the quote does not change delivery.
- Restock orders: still 0%. The staff screen does not call this quote endpoint for restock, and the save step zeroes tax for restock regardless.
- Customer checkout: entirely untouched.

## Acceptance (Karen verifies in dev; agent cannot screenshot or self-verify UI)

Expected staff-screen behavior after both parts:

1. Order with items and a saved address: tax uses that address's jurisdiction rate. (Unchanged.)
2. Drop-ship order with a typed custom address: tax now uses that typed address's rate. A CA typed address is taxed at its CA rate; an out-of-state typed address reads as no nexus at 0%.
3. Order with items and genuinely no address of any kind (for example ship-to-store for a customer with no saved address): tax shows the Settings rate, labeled "Store Default Rate".
4. Empty order (no line items): tax still shows 0%, because there is no taxable amount yet. The rate appears once a line item is added.
5. While a custom drop-ship address is being typed, before the state field is filled, the line may briefly show "Store Default Rate"; it recomputes to the destination rate once the state is entered. This is expected.

The hands-on UI walkthrough is Karen's. Do not claim UI verification.

## Stop protocol

Make both changes in dev only. Do not run any prod operation and do not sync anything to prod. When complete, STOP and report back with the diff for review before anything else.
