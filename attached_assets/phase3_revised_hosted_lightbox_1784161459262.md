# Phase 3 (Revised): Authorize.net Hosted Card Form (SAQ A)

## Why this revision
The client requires that raw card data never touch our page at all. The current
Phase 3 build uses self-hosted card input fields (Accept.js option 1), which is
PCI-DSS SAQ A-EP: the card briefly lives in our page's own fields before
tokenizing. We are switching to Authorize.net's hosted payment information form
(Accept.js "with UI" / AcceptUI, the lightbox popup), which Authorize.net
documents as SAQ A: the customer enters the card inside an Authorize.net-served
popup, so the card never exists in our DOM.

**The backend does not change.** The hosted form returns the same opaque token
(`opaqueData.dataDescriptor` + `dataValue`) that Phase 1 and Phase 2 already
charge server-side. Only the frontend card-entry UI changes.

## Do NOT touch (all confirmed working)
- The Phase 1 charge function in `authorizeNet.ts`.
- The Phase 2 `POST /checkout` route and its charge / payment-recording logic.
- The `GET /checkout/payment-config` endpoint (still used, unchanged).
- The `paymentToken` field in `PlaceOrderRequest` (already in the spec; no spec
  change and no codegen needed for this revision).
- The public "under construction" branch shown to non-authenticated users.

## Guardrails (still in force)
1. The transaction key stays server-only. Only the API Login ID and Public Client
   Key reach the browser, via the existing config endpoint.
2. After this change there must be NO card-number, expiry, or CVV input element
   anywhere in our DOM. Card entry happens only inside Authorize.net's hosted
   form. This is the whole point of the revision and is an acceptance check.
3. Never log the nonce (`dataValue` / `dataDescriptor`) or any card data.
4. Keep double-submit protection so an order cannot be placed twice.
5. Sandbox only. Same sandbox Accept.js script as before.

## Steps
1. Remove the three self-hosted card inputs (card number, expiry, security code)
   from `Checkout.tsx`, along with their formatting and field-level validation
   state. Nothing that accepts card data may remain in our markup.
2. Add Authorize.net's hosted card form, loading the same sandbox Accept.js script
   and reading the public values from `GET /checkout/payment-config`
   (`apiLoginId`, `publicClientKey`, `sandbox`). You may implement this either by
   using AcceptUI.js directly (a button in the `AcceptUI` class with the required
   `data-*` attributes and a global response handler) or with the `react-acceptjs`
   `HostedForm` component, which handles the React button-load timing wrinkle.
   Report which approach you chose. If you add a dependency, call it out.
3. On a successful hosted-form response, take
   `response.opaqueData.dataDescriptor` + `response.opaqueData.dataValue` and pass
   them to the EXISTING place-order mutation as `paymentToken`. Do not change the
   request shape; the backend already expects exactly this.
4. On an error or cancelled response, show a clear inline message and let the
   customer retry. Never call the place-order mutation without a nonce.
5. Keep the under-construction branch for non-authenticated users exactly as-is.

## Out of scope (note for launch, do not build now)
- Passing the billing address through for AVS. The hosted form collects the card
  (and optionally ZIP); fuller billing-address AVS is a launch enhancement, not
  part of this switch.

## Verify and report
- Run the web typecheck and paste the full output (not a checkmark).
- In your report, paste the result of grepping `Checkout.tsx` for any remaining
  card-number / expiry / CVV input elements, to confirm none remain (card data
  now lives only in Authorize.net's hosted form).
- Confirm the under-construction branch is unchanged.

**STOP. Report and paste output. Wait for confirmation before any testing.**
