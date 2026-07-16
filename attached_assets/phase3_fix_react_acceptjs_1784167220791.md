# Fix Brief: Switch AcceptUI to the react-acceptjs HostedForm

## Why
The hand-rolled AcceptUI integration reliably opens the hosted lightbox and the
card tokenizes (the popup closes), but the opaque token never reaches the server:
no transaction is ever created at Authorize.net and the order status never
changes. Attribute casing and script/attribute load timing have already been
fixed, and it still fails at the same point, the hand-off from AcceptUI back into
our code via the global `window.handleAcceptUIResponse`. That hand-off is the
fragile piece.

Replace the hand-rolled AcceptUI button + `setAttribute` effect + global response
handler with the `react-acceptjs` `HostedForm` component, which owns that
button-and-response-handler wiring internally. The token it returns is the same
`opaqueData` (`dataDescriptor` + `dataValue`) the backend already charges, so the
backend does not change.

## Do NOT touch (all proven working)
- The Phase 1 charge function in `authorizeNet.ts`.
- The Phase 2 `POST /checkout` route and its charge / payment-recording logic.
- `GET /checkout/payment-config`.
- The `paymentToken` field in `PlaceOrderRequest` (no spec change, no codegen).
- The public "under construction" branch shown to non-authenticated users.

## Guardrails (still in force)
1. Transaction key stays server-only. HostedForm uses only the API Login ID and
   Public Client Key from the config endpoint. Never expose the transaction key.
2. No card-number / expiry / CVV inputs in our DOM. Card entry stays inside
   Authorize.net's hosted popup.
3. Never log the nonce or any card data.
4. Keep the double-submit guard so an order cannot be placed twice.
5. Sandbox environment (the config endpoint's `sandbox` flag drives this).

## Steps
1. Add the `react-acceptjs` dependency to the web package, pinned to the exact
   version `0.5.1` (no `^` or `~` range). It must appear in package.json as
   `"react-acceptjs": "0.5.1"` so the version cannot drift on future installs.
   This version is MIT-licensed and has zero runtime dependencies of its own.
2. Remove the hand-rolled AcceptUI pieces: the `.AcceptUI` button, the
   `acceptUIBtnRef` `setAttribute` effect, and the `window.handleAcceptUIResponse`
   global handler + its cleanup.
3. Render the `HostedForm` component fed from `GET /checkout/payment-config`:
   `authData` = `{ apiLoginID: config.apiLoginId, clientKey: config.publicClientKey }`,
   and `environment` = `"SANDBOX"` when `config.sandbox` is true, otherwise
   `"PRODUCTION"`.
4. In HostedForm's submit/response callback: if `messages.resultCode` is `"Error"`
   or there is no `opaqueData`, show the inline error and stop. Otherwise call the
   existing place-order mutation with
   `paymentToken: { dataDescriptor, dataValue }` taken from `opaqueData`, using the
   same address-payload snapshot logic already in place (saved-address vs
   new-address).
5. Preserve address validation: the customer must have a valid shipping address
   selected or entered before the hosted popup can complete the order. Pick a
   clean way to enforce this with HostedForm and report the choreography you chose.
6. Keep the double-submit guard (ignore/disable while the place-order mutation is
   pending).
7. Keep the under-construction branch for non-authenticated users unchanged.

## UI tweaks (same pass)
A. Move the line "Click Place Order to proceed to payment entry." to directly
   BELOW the place-order / payment button. Keep the "Your card details are entered
   securely..." note below the Order Summary total line.
B. Move the item weight (e.g. "89.0 lb") up so it displays under the Shipping line
   in the Order Summary. Leave the tax locality line where it is.

## Verify and report
- Paste the full web typecheck output.
- Confirm no `data-*` casing warnings and no new red console errors on page load.
- Report the button/popup choreography you chose for address validation.
- Confirm the under-construction branch is unchanged.

**STOP. Report and paste output. Wait for confirmation before re-testing.**
