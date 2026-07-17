# Phase 3 addendum: customer-facing messaging checks

Add these to the Phase 3 reality-test. The Phase 3 checks in the original brief
verify DB state (no order, no payment, no orphaned rows). These additional checks
verify what the CUSTOMER actually SEES on screen, which is separate and must be
confirmed by eye, not inferred from the server returning the right status code.

Do not treat any of these as passing based on server behavior alone. Walk through
the actual checkout UI in dev and report what the screen shows.

## Decline: what the customer sees

When you force the real gateway decline (the $70.02 amount trigger, or the code-
inspection fallback if the amount trigger will not cooperate), confirm on the
actual screen that:
1. The customer sees a clear, readable "your card was declined" style message, in
   plain language. NOT a raw error code, NOT a stack trace, NOT a blank or frozen
   screen, NOT an infinite spinner.
2. The screen does NOT look like success. No order confirmation, no order number
   presented as if the purchase completed, no "thank you for your order" state.
3. The customer can retry: the form is still usable and they can enter a different
   card without reloading or losing their cart.

Report the exact wording the customer sees on a decline. If it shows a raw code or
anything that reads as broken, flag it, that needs a fix before go-live.

## Held-for-review: what the customer sees

Confirm the on-screen message on a held order says the order was received and
payment is under review, and that staff will follow up. Confirm it does NOT read
as a plain decline and does NOT read as a completed/paid confirmation. Report the
exact wording.

## Approval: what the customer sees

Confirm the approved-order screen shows a normal completed confirmation with the
order number. Report the exact wording.

## Charge-succeeded / order-write-failed: what the customer sees

This path is hard to force in sandbox. If you cannot trigger it, confirm by code
inspection what the customer sees, and report the exact message text. It must be
the support-contact message with the order reference, NOT a plain decline and NOT
a normal success. If it cannot be triggered, note that it will be validated only
if it ever occurs in production.

## Report format

For each of the four cases above, report: (1) what triggered it, (2) the exact
on-screen text the customer sees, (3) whether it could be mistaken for a
different outcome. STOP and report before considering Phase 3 complete.
