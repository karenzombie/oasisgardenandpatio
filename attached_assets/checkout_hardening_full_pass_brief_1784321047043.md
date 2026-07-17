# Brief: Checkout hardening before live cards (full pass)

Three items must be closed before real cards run through checkout. This is
real-money code, so every phase stops for review of the actual diff and a
hands-on sandbox walkthrough before the next phase starts.

## Current state (from a read-only check of the live dev code)
- `processAuthnetCharge` is called at roughly line 568 of
  `artifacts/api-server/src/routes/checkout.ts`.
- The guest customer row (`createGuestCustomer`, ~line 104) and address rows
  (`insert(addressesTable`, ~line 216) are created BEFORE the charge.
- Balance is already computed via `recomputeOrderTotals` (this item is done, do
  not touch it).
- There is NO server-side double-submit / idempotency guard. The only guard is a
  frontend one-shot latch.
- The charge function (`artifacts/api-server/src/lib/authorizeNet.ts`) only treats
  gateway `responseCode === "1"` as success; everything else (including a
  held-for-review, code `"4"`) is treated as a plain decline.

## Hard guardrails (in force for every phase)
1. Keep testing against the SANDBOX. Do NOT set or flip `AUTHNET_SANDBOX`. The
   live go-live switch is a separate, later step done by Karen, not part of this
   work.
2. Transaction key stays server-only. Do not change how the token or config is
   handled.
3. Always charge the server-computed total. Never trust a client amount.
4. Never log card data, the nonce, or the transaction key.
5. Reality-test each phase: after the code compiles, walk through the actual
   checkout in dev AND confirm the resulting DB rows with a read-only query.
   A green typecheck is not proof of behavior.

---

## Phase 0: Recon and design proposal (no code changes)
Read the current `/checkout` route and report:
1. The exact current sequence: where the cart is locked (`FOR UPDATE`), where the
   total is computed, where the charge happens, and where the order/payment/cart-
   clear happen. Confirm whether the cart lock is released between the total
   computation and the charge (the suspected double-charge window).
2. Your proposed approach for the **server-side double-submit guard** (Phase 1).
   The requirement: a single cart must never be able to produce two gateway
   charges, even if two requests arrive nearly simultaneously with two different
   payment nonces. A recommended approach, unless you see a problem with it: run
   the validate -> charge -> create-order steps as one flow that holds the cart
   `FOR UPDATE` lock for the whole duration, so a concurrent duplicate blocks on
   the lock and then finds the cart already emptied and returns without charging.
   If you hold the lock across the external gateway call, ensure the gateway
   `fetch` has a sane timeout so a hung call cannot hold the lock indefinitely.
   Report whether you will use this or an alternative (for example an atomic
   "checkout in progress" claim on the cart), and why.
3. Your proposed handling for **held-for-review (code 4)** (Phase 2).
   Recommended design, unless you see a problem: the charge function returns a
   distinct outcome for code 4 (for example `heldForReview: true`) instead of
   success or plain decline. Checkout then CREATES the order (status
   `new_online_order`), records the payment row with status `pending` (not
   `completed`), does NOT zero the balance (leave `balanceDue` at the full total
   until review clears), and shows the customer a message that the order is
   received and the payment is being reviewed, rather than a decline. Confirm the
   `payments.status` value you will use is allowed.

**STOP. Report items 1-3 and wait for approval before writing any code.**

---

## Phase 1: Server-side double-submit guard + no orphaned rows
Implement together, since both come from the same restructure.

1. **Double-submit guard:** per the approved Phase 0 approach, guarantee a single
   cart cannot produce two charges. A concurrent or repeated submission must not
   result in a second gateway charge.
2. **No orphaned rows on decline:** move all row creation that currently happens
   before the charge (the guest customer row, and any NEW shipping/billing address
   rows) so it happens only AFTER the charge is approved. Before the charge, only
   validate the request and resolve existing saved-address lookups (read-only).
   The charge needs the customer email: for a guest, take it from the submitted
   contact data rather than from a created row, so no customer row is created
   until approval. On decline, nothing is created: no customer, no address, no
   order, no payment. The cart stays intact.
3. Keep the existing behavior on approval otherwise identical: order created,
   payment row `completed`, balance recomputed to 0 via `recomputeOrderTotals`,
   cart cleared.

Run the API typecheck and paste the full output.

**STOP. Post the diff and typecheck output. Wait for approval before Phase 2.**

---

## Phase 2: Held-for-review (code 4) handling
Per the approved Phase 0 design:
1. In the charge function, return a distinct outcome for gateway `responseCode`
   `"4"` (held for review) rather than folding it into failure.
2. In checkout, on that outcome: create the order (`new_online_order`), record the
   payment as `pending`, leave the balance at the full total (do not zero it), and
   return a customer-facing message that the order was received and payment is
   being reviewed, not a decline.
3. Approval (code 1) and real declines (code 2/3) behave exactly as before.

Run the API typecheck and paste the full output.

**STOP. Post the diff and typecheck output. Wait for approval before Phase 3.**

---

## Phase 3: Reality-test in sandbox
With sandbox keys in place, walk through and report:
1. **Approval:** a normal test card places the order, records a `completed`
   payment, zeroes the balance, and shows in the sandbox dashboard. Confirm with a
   read-only DB check.
2. **Decline:** a declined attempt creates NO order, NO payment, and NO new
   customer/address rows, and leaves the cart intact. Confirm the absence of
   orphaned rows with a read-only DB check (this is the key new behavior).
3. **Double-submit:** confirm that a rapid double submission cannot produce two
   charges (describe how you tested it).
4. **Held-for-review:** forcing code 4 in the sandbox is difficult; if you cannot
   trigger it, confirm by code inspection that the code-4 path creates a
   `pending` payment and the review message, and note it will be validated the
   first time a real held transaction occurs.

**STOP and report the walkthrough results.**
