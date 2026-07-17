# Phase 0 addendum: revise before writing any code

Your Phase 0 recon was good. The sequence trace is correct, the double-charge
window is correctly identified, and you correctly confirmed `payments.status`
has no CHECK constraint and defaults to `pending`.

Approach (a), the single transaction holding `FOR UPDATE` across the charge, is
approved as the direction. The general shape of the code-4 handling is also
approved. But four things must be resolved in a revised Phase 0 report BEFORE any
Phase 1 code is written. Do not write code yet.

Nothing about how orders or payments appear to the customer or to staff may
regress. That is the bar for this whole pass.

## 1. Preserve the charge-succeeds / order-write-fails safety net (brief item 6)

Your plan puts the charge inside the same transaction as the order and payment
writes. That creates a new failure mode the current code does not have: if the
gateway charge succeeds but a later write in the same transaction fails, the
transaction rolls back. The captured money at Authorize.net cannot be rolled
back, so we would have a real charge with no record of it. If the CRITICAL log
line is itself a DB write inside that transaction, the rollback erases the log
too, and the money is invisible.

The current code logs CRITICAL with the `transId` and returns an order reference
so the customer can contact support. That behavior must survive.

Report exactly how your design captures the `transId` and writes the CRITICAL log
OUTSIDE the transaction that may roll back (for example, catch the post-charge
failure, log to a sink that is not part of the rolled-back transaction, and
return the support-contact message to the customer rather than a generic error).
Confirm the customer is never shown a plain decline in this case, since their
card was in fact charged.

## 2. Confirm the isolation level

Your guard's correctness depends on the blocked concurrent request re-reading the
cart and seeing it empty after the first request commits. Confirm the checkout
transaction runs at READ COMMITTED (or state what it runs at) and that this is
what makes the empty-cart re-read reliable. The brief asked for this explicitly.

## 3. State what stays inside the transaction vs. runs after commit

Merging the two transactions risks pulling slow or side-effecting work inside the
lock hold. For each of the following, say whether it runs inside the transaction
or after commit, and confirm the lock is not held longer than necessary:
- the gateway charge (inside, per approach a)
- `autoGenerateVendorOrders`
- confirmation / notification emails
- balance recompute and cart clear

Confirmation and notification emails must fire AFTER commit, never inside the
transaction. We cannot email a customer or notify staff about an order that then
rolls back.

## 4. Two adjustments to the code-4 (held-for-review) handling

The order-created / payment-`pending` / balance-left-at-full-total shape is
correct. Adjust two things and confirm one:
- Do NOT send the customer a normal payment-confirmed email on a held order. The
  on-screen message says the payment is under review, so an approval-style email
  would contradict it. Staff notification: yes. Customer email: suppress it, or
  reword it to say the order was received and payment is under review. The screen
  and the email must say the same thing.
- Clearing the cart on a held order is approved (it prevents a duplicate held
  order for the same items), even though it goes slightly beyond the brief text.
  Keep it, and note it explicitly in your report.
- Confirm that whatever recomputes the balance treats a `pending` payment as
  not-yet-paid, so the balance stays at the full total now, and zeroes correctly
  later when staff flip the payment to `completed`, with no double-counting.

## Stop

Post the revised Phase 0 report covering items 1 to 4. Wait for approval before
writing any Phase 1 code.
