# Correction Brief: Item 2, restore the saved-address picker for signed-in customers (dev only)

Dev only. Do NOT sync to prod, deploy, or run any prod script. We publish once at
the end after Items 2, 3, and AVS are all built and tested.

## Why this correction
The Item 2 build made the Billing section (and Shipping) an always-on full inline
form for everyone, including signed-in customers who have a saved address. That is
not the intended behavior. Signed-in customers must be able to pick from their
saved addresses, the way the flow worked before, with the inline form as a
fallback and as an explicit "use a different address" choice.

Guest behavior and the "same as billing" checkbox and the both-required gating from
the previous build are correct and stay. This brief changes how each section
behaves for a SIGNED-IN customer.

## Target behavior, per section (Billing and Shipping)
Billing section comes first, Shipping second. Shipping still has the "same as
billing" checkbox, default checked; when checked, the shipping section is not
shown and shipping equals billing.

For each section, decide what to render by the customer's state:

1. **Signed-in customer who has one or more saved addresses of that type**
   (billing addresses for the Billing section, shipping addresses for the Shipping
   section):
   - Render a saved-address picker: one selectable card (radio) per saved address
     of that type, exactly the pattern the checkout used before this feature.
   - Default-select the customer's default address of that type, falling back to
     the first of that type.
   - Also render a "Use a different address" control. Selecting it reveals an
     inline form for that section, and the payload then sends the typed address
     instead of the saved ID. This is the control Item 1 removed for being broken;
     build it fresh so it actually works. Do NOT wire any save-to-account behavior
     here; persisting a newly typed address to the account is Item 3.
2. **Signed-in customer with no saved address of that type (brand-new account):**
   render the inline form for that section directly, no picker.
3. **Guest:** render the inline form for that section directly, no picker. (The
   backend forbids guests from using saved-address IDs; keep that.)

Note the saved addresses list already returns `type` on every address
(`serializeAddress` includes it), so filter the picker by type: Billing shows only
billing-type saved addresses, Shipping shows only shipping-type.

## Gating (unchanged in intent, confirm it still holds)
`addressComplete` must require BOTH a complete billing selection/entry AND a
complete shipping selection/entry (a selected saved address counts as complete; an
inline form counts as complete when street1, city, state, zip are non-empty; when
"same as billing" is checked, shipping is complete iff billing is). Place Order
stays disabled until both are complete.

## Payload (confirm each branch)
- Shipping: send `shippingAddressId` when a saved shipping address is selected;
  send an inline `shippingAddress` object when "use a different address" or the
  guest/brand-new path is used.
- Billing: send `billingSameAsShipping: true` when the checkbox is checked; when
  unchecked, send `billingSameAsShipping: false` plus either `billingAddressId`
  (saved billing selected) or an inline `billingAddress` object (typed).
- Do NOT send `saveShippingAddress` or any save-to-account field. Item 3.

## Files
- `artifacts/web/src/pages/Checkout.tsx` (the address area and payload builder).
- Touch `artifacts/api-server/src/routes/checkout.ts` ONLY if the picker change
  requires a backend adjustment. It should not; the backend is already billing and
  saved-address aware. If you believe it needs a change, stop and report why before
  making it.

## Do NOT
- Do not sync to prod, deploy, or run any prod script.
- Do not add save-to-account or any address-dedup guard. Item 3.
- Do not send the billing ZIP to Authorize.net. That is the AVS item, done last.
- Do not enable the Authorize.net popup billing collection
  (`billingAddressOptions` stays `{ show: false, required: false }`).
- Do not fix anything else you notice. Report it and wait.

## Report back before moving on
1. Paste the diff for every file you touched.
2. Run `pnpm --filter ./lib/api-spec run codegen && git status --short` and paste
   the output.
3. Reality-test in dev, in the browser, for the signed-in path (Karen can drive the
   browser if the tooling cannot click; coordinate). Describe what actually renders:
   - Signed-in customer with a saved billing and a saved shipping address: Billing
     section shows the saved billing card selected, Shipping section (with "same as
     billing" unchecked) shows the saved shipping card selected. Each section's
     "use a different address" reveals a working inline form.
   - Signed-in customer with nothing saved: both sections show inline forms.
4. Rows readback (the real proof): after a dev order is placed with "same as
   billing" UNCHECKED and a billing address different from shipping, run a
   read-only query and paste: the order's `shippingAddressId` and
   `billingAddressId`, and the two `addresses` rows they point to (id, type, city,
   state, zip). Confirm they are two distinct rows, billing row `type = "billing"`
   with the billing ZIP, shipping row `type = "shipping"` with the shipping ZIP.
5. State plainly which paths you could and could not exercise in dev. The guest
   checkout path is blocked in dev by the under-construction gate, so do not claim
   to have tested it; note it will be covered in the single prod test. Do not
   substitute a code read for a browser check on anything you claim as verified.
6. If anything is unclear or unverifiable, say "I could not determine this" and
   stop. Do not guess.
