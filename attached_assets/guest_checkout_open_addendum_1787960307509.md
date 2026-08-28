# ADDENDUM: Open Guest Checkout

**Type:** Addendum. Do not edit the original briefs.
**Amends:** `accept_js_sandbox_integration_brief` (Phase 3) and
`phase3_fix_react_acceptjs`, both of which instructed you to preserve the public
"under construction" branch for non-authenticated users.
**Reversal notice:** That instruction is now withdrawn. Guest checkout is
intended to work. The under-construction branch is removed.

---

## Goal

A guest (not signed in) must be able to complete a purchase end to end: cart,
checkout, contact info, address, card entry, order placed, confirmation.

Signed-in checkout works correctly in production today. Guest checkout is
blocked: a guest sees a disabled "Proceed to Checkout" button and an "under
construction" message. That split is the bug. Guests must get the same working
checkout signed-in users already have.

---

## Read this before you start: the change is NOT a one-line flip

The gate is three booleans in two files, but flipping only those booleans
produces a **worse** bug than the current one: a guest would fill the form,
enter a real card into the Authorize.net popup, get the card tokenized, and then
receive a 400 from our own server. Card tokenized, no order. The reasons are in
"Full surface" below. All items in that section are in scope.

---

## Confirmed already working, do not rebuild

I verified these in the repo. No backend work is required.

- `POST /checkout` has no auth middleware and already has a complete guest path:
  `isGuest` derivation, guest contact validation, deferred guest customer row
  creation inside the charge transaction, guest order number recorded on
  `req.session.guestOrders`, confirmation email addressed to the guest email.
- `GET /checkout/payment-config` has no auth middleware.
- `POST /checkout/quote` (shipping and tax) has no auth middleware.
- The cart API is already session-keyed and anonymous friendly.
- `guestContact` already exists in `lib/api-spec/openapi.yaml`, in
  `lib/api-zod`, and in `lib/api-client-react` generated types.
  **No spec change. No codegen run. No schema migration.**
- `OrderConfirmation.tsx` has no auth gate, so a guest can land on it.

---

## Full surface of the change

### File 1: `artifacts/web/src/pages/Cart.tsx`

1. **Line 37:** `const isDemoUser = isAuthenticated;` Remove this constant
   entirely. It is used in exactly one place.
2. **Lines 328 to 356:** the `{isDemoUser ? ... : ...}` block. Keep the enabled
   `Proceed to Checkout` button that links to `/checkout` and render it
   unconditionally. Delete the entire else branch: the disabled button, the
   "still under construction" paragraph, and the oasispatioumbrellas.com link.
3. **Do not remove `useAuth` from this file.** `isAuthenticated` is still used
   at line 109 for the guest sign-in banner. That banner already says
   "Checking out as a guest is fine, no account required" and becomes accurate
   once this change lands. Leave its copy alone.

### File 2: `artifacts/web/src/pages/Checkout.tsx`

4. **Line 92, `useGetCheckoutPaymentConfig`:** change `enabled: isAuthenticated`
   to always enabled. Without this a guest never receives the Accept.js
   credentials and the HostedForm can never render. Update the comment above it,
   which currently says guests never trigger payment.
5. **Line 82, `useListAccountAddresses`:** leave `enabled: isAuthenticated` as
   is. Guests have no address book and the backend rejects a guest who sends a
   saved address ID. This one must stay gated.
6. **Lines 889 to 908:** delete the whole `{!isAuthenticated ? ... : null}`
   "Payment" section containing the under-construction notice.
7. **Lines 992 to 1065:** the `{isAuthenticated ? ... : ...}` block wrapping the
   security note, the `HostedForm`, and the address and payment hints. Render
   that entire authenticated branch for everyone. Delete the else branch: the
   disabled "Place Order" button and its under-construction paragraph.
8. **`guestContact` is never sent. This is the critical fix.**
   In `handleHostedFormSubmit` (around lines 437 to 452) the payload is built
   from `addressPayload` and `paymentToken` only. The `guest` form state that
   the UI collects at lines 508 onward is never put into the request. The
   backend returns 400 for any guest without `guestContact`. Add it:
   for a guest, include `guestContact` with `email`, `firstName`, `lastName`,
   `phone` trimmed from `guest` state; for a signed-in user, omit the field.
   The spec requires all four and the generated type already supports it.
9. **`addressComplete` does not validate guest contact.**
   At lines 367 to 377 it checks billing and shipping address fields only. It
   gates the HostedForm button, so as written a guest with a filled address but
   an empty email could open the card popup. Add a guest contact check to the
   gate so the button stays disabled until, for guests only, `email` matches
   `EMAIL_RE`, `firstName` and `lastName` are non-empty after trim, and `phone`
   has at least 7 characters after trim. Those minimums mirror the `GuestContact`
   schema in the OpenAPI spec, so client and server agree.
   Note `EMAIL_RE` is already declared at line 65 and is currently unused. Use
   it. Do not add a second regex.
10. **Guests must never send saved address IDs.** For a guest,
    `billingSavedId` and `shippingSavedId` are null today because the address
    query is disabled, so the payload correctly falls through to inline address
    objects. Do not change that behavior while doing the work above. The backend
    400s on `shippingAddressId` or `billingAddressId` from a guest.
11. **Guest validation feedback.** A guest who leaves contact fields blank
    currently gets no visible reason for the disabled button. Add a short inline
    message near the Place Order button, in the same style as the existing
    "Fill in your billing and shipping address above to enable payment." hint,
    telling the guest to complete their contact info. Do not add a toast.

### Not in scope for you

12. There is a site banner row in the `banners` table titled
    "SITE UNDER CONSTRUCTION - PURCHASING NOT CURRENTLY AVAILABLE" that is
    managed through Admin, Banners. It is content, not code. **Do not touch it
    and do not write any migration or script for it.** Karen deactivates it
    herself in the admin UI.

---

## Do NOT touch

- The charge function in `authorizeNet.ts`.
- The `POST /checkout` route body, its charge logic, or its guest branch.
- `GET /checkout/payment-config` server side.
- `POST /checkout/quote`.
- The OpenAPI spec, `lib/api-zod`, `lib/api-client-react`. No codegen.
- The database schema. No migrations.
- The double submit latch `orderSubmittedRef` and its reset rules. It is reset
  only on declines, never on 500 or 503.
- The `criticalError` persistent message behavior for 500 and 503.
- The saved address prefill effect and `prefillDoneRef`.
- Any Authorize.net environment variable, config value, or portal setting.
  Signed-in checkout works correctly in production today. Nothing you do may
  change how payments are configured.

---

## Steps

**Step 1.** Make the Cart.tsx changes (items 1 to 3).
**STOP. Report the diff. Wait for confirmation.**

**Step 2.** Make the Checkout.tsx gate removals (items 4, 6, 7) and confirm
item 5 was left alone.
**STOP. Report the diff. Wait for confirmation.**

**Step 3.** Wire `guestContact` into the place order payload and extend the
completeness gate and its inline message (items 8, 9, 10, 11).
**STOP. Report the diff and paste typecheck output. Wait for confirmation.**

**Step 4.** Run typecheck and lint across the web package. Paste the output.
Do not run any UI verification yourself.
**STOP.**

---

## Testing

Karen runs all UI and end to end testing. You do not. Report when the code is
in and typechecks clean, and list what you changed, then stop.

What Karen will check, in a signed out browser session or a private window:

1. Cart page shows an enabled "Proceed to Checkout" and no under-construction
   message.
2. Checkout page shows the Contact fields, no under-construction message, and a
   Place Order button.
3. Place Order stays disabled with contact fields blank and address filled.
4. Place Order stays disabled with contact filled and address blank.
5. With both filled, the Authorize.net card popup opens.
6. A completed order returns an order number and lands on the confirmation page.
7. The confirmation email arrives at the guest email address.
8. Signed in checkout still works, including saved addresses.
