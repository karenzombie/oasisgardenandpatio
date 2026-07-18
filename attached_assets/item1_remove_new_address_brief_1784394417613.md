# Agent Brief: Remove the broken "Use a new address" option from checkout

This is step 1 of the checkout address work. It is a surgical removal, not a
restructure. The billing/shipping split and labeling come in later steps.

## Goal
Remove the "Use a new address" radio from the signed-in checkout flow. Keep the
inline address form for guests. Keep the inline form for a brand-new signed-in
customer who has no saved addresses yet.

## File
`artifacts/web/src/pages/Checkout.tsx`

## Reconned reality (verify before changing anything)
- The saved-address radio block (around lines 475 to 524) renders only when
  `isAuthenticated && addresses.length > 0`.
- Inside it, the "Use a new address" radio is around lines 508 to 522. Selecting
  it sets `selectedId = "new"`, which reveals the inline form (around lines 526
  to 605).
- Guests never reach the saved block (it requires `isAuthenticated`), so they
  always get the inline form.
- A brand-new signed-in customer with zero saved addresses also skips the block
  (it requires `addresses.length > 0`) and gets the inline form.
- An effect around lines 129 to 134 selects the default or first saved address on
  load.

Confirm each of the above in the actual code first. If any line reference is off,
stop and report before editing.

## The change
1. Remove the "Use a new address" radio label block (around lines 508 to 522).
2. Ensure that once the radio is gone, a signed-in customer who has one or more
   saved addresses can never end up with `selectedId === "new"`, so the inline
   form does not render for them. Confirm the existing default-select effect
   leaves no path to `"new"` for that customer after your change.
3. Do not change guest behavior. Do not change the brand-new-customer (zero saved
   addresses) behavior. Both must still get the inline form.

## Do NOT touch
- The guest inline form and guest contact section.
- The order payload, `billingSameAsShipping`, the HostedForm, or any backend.
- The account page.
- Do not fix anything you happen to notice outside this change. If you see
  something, report it and wait.

## Report back before moving on
- Paste the diff.
- Walk all three paths in dev and describe what actually renders in each:
  (a) guest, (b) signed-in customer with zero saved addresses, (c) signed-in
  customer with one or more saved addresses.
- If you cannot determine one of these paths, say "I could not determine this"
  rather than guess. Then stop and wait.
