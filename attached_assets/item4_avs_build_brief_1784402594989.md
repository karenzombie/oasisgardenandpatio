# Build Brief: Item 4, send the billing ZIP to Authorize.net (AVS)

Build in dev. Do NOT publish or sync to prod. Karen publishes herself, once, after
review. This is the last code item before the live payment test.

Line references below come from earlier recon and may have shifted (Item 2 touched
checkout.ts). Confirm the real current lines before editing. If anything does not
match, stop and report before changing code.

## Why / what changed since the original plan
Item 2 restructured checkout so every order now carries a real billing address,
separate from shipping when the customer unchecks "same as billing." So the billing
ZIP is a real value on the order's billing address. This item wires that billing
ZIP into the Authorize.net charge so AVS has something to match. Today the charge
sends no billTo block, so AVS runs with nothing to match and the gateway declines.

Karen's rule: the AVS ZIP is pulled from the BILLING address, always. When "same as
billing" is checked, billing equals shipping so the ZIP is the same value; still
pull it from the billing address, not the shipping address.

## Files
1. `artifacts/api-server/src/lib/authorizeNet.ts`
2. `artifacts/api-server/src/routes/checkout.ts`

## Reconned reality (confirm before editing)
- `processAuthnetCharge` in `authorizeNet.ts` builds a `transactionRequest` payload
  (previously around lines 79 to 103) containing `payment`, `order`, and
  `customer`, but NO `billTo` block. That missing `billTo` is why AVS has nothing
  to match.
- The AVS result is already read back (`authorizeNet.ts`, previously around line
  149) and already written to the order (`checkout.ts`, column `avs_response` in
  `lib/db/src/schema/orders.ts`). Capture already exists.
- After Item 2, `checkout.ts` resolves or inserts a billing-type address for the
  order and stores `billingAddressId` on the order. That billing address is where
  the ZIP comes from. Confirm exactly where the billing address (and its ZIP) is
  available in the handler before the charge call.

## The change
1. In `processAuthnetCharge` (`authorizeNet.ts`), add a billing ZIP parameter (for
   example `billingZip: string`; optionally also first name, last name, street,
   city, state for a fuller AVS match). Add a `billTo` object to the
   `transactionRequest` payload. At minimum `billTo.zip` must be populated.
   `billTo.zip` is what AVS matches on.
2. In `checkout.ts`, pass the billing ZIP into `processAuthnetCharge`, sourced from
   the order's BILLING address (the one behind `billingAddressId`), not the
   shipping address. When billing equals shipping (checkbox checked), this is the
   same value, which is fine; still read it from the billing address. Do not
   fabricate a ZIP; if for some reason no billing ZIP is available, do not send an
   empty `billTo.zip`, and report that case rather than guessing.
3. Staff surfacing: the AVS result is already stored (`avs_response`). Check
   whether the staff order or payments view already displays it. If it does, change
   nothing there. If it does not, add a read-only display of the stored AVS code.
   Report which case you found before adding anything, so we do not duplicate an
   existing field.

## Do NOT
- Do not publish or sync to prod. Dev only. Karen publishes.
- Do not add auto-decline on AVS. Record-only. The gateway's own policy stands.
- Do not change amounts, the opaque-data token flow, or the sandbox toggle. Do not
  touch `AUTHNET_SANDBOX` or any Authorize.net config or portal setting.
- Do not enable the Authorize.net popup billing collection.
- Do not fix anything else you notice. Report it and wait.

## Report back before moving on
- Paste the diff for both files.
- Run `pnpm --filter ./lib/api-spec run codegen && git status --short` and paste
  the output.
- Prove, in dev, that the outgoing charge payload now contains `billTo.zip` with a
  real value sourced from the billing address. A captured request body or a log
  line of the payload is fine. Do NOT place a live charge; dev is on live keys and
  Karen runs the one real transaction herself in prod.
- State plainly that you did not run a live charge.
- Tell me which staff-surfacing case you found (already displayed, or you added a
  read-only field).
- If anything is unclear or unverifiable without a charge, say "I could not
  determine this" and stop. Do not guess.
