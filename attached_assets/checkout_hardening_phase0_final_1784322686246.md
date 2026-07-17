# Phase 0 final: decisions locked, implement these in Phase 1

Your revised Phase 0 is approved in substance. The transId-survives-rollback
mechanism (hoisted closure variable, Pino-to-stdout log), the READ COMMITTED
reasoning, and the balance treatment verified against `adminOrderPayments.ts` are
all correct.

Six points below are binding for Phase 1. Some tighten your design; two are owner
decisions that remove choices you would otherwise make yourself. Do not deviate
from these without stopping to ask.

The bar for this whole pass: nothing about how an order or a payment appears to
the customer or to staff may end up in a wrong or ambiguous state. When a case is
uncertain, stop and surface it. Never guess an order into existence.

## 1. Exact try/catch structure for the safety net (make this explicit)

The `try/catch` MUST wrap the `db.transaction()` call from OUTSIDE. The catch
block must NOT live inside the transaction callback, because a caught error
inside the callback can suppress the rollback or commit a partial write.

Required structure:
- A real decline (code 2/3) THROWS inside the callback, which forces the
  transaction to roll back. Nothing is written.
- A success (code 1) and a held-for-review (code 4) complete the callback
  normally, so the transaction commits.
- The OUTER catch fires the CRITICAL log and the support-contact message ONLY
  when `chargeResult?.success === true` (or `chargeResult?.heldForReview === true`),
  meaning the gateway captured money but a later write failed. In every other
  catch case (the charge was never made or was declined), return the normal
  decline response, not the support message.

State this structure explicitly in your Phase 1 diff.

## 2. Timeout / abort must leave a breadcrumb

If the gateway fetch aborts at the 30s timeout or throws a network error,
`chargeResult` stays null and the request fails closed to the customer. That is
correct for the customer. But an abort means we do NOT know whether the money was
captured, so this path MUST log at CRITICAL (or error) with: the cart id, the
server-computed total, and a timestamp. This is the reconciliation breadcrumb if
a customer later disputes. Do not let the timeout/abort path fail silently.

## 3. Set the isolation level explicitly

The guard depends on READ COMMITTED. Do not rely on inheriting the Postgres
default, because that default can be overridden per-database or per-role, and dev
(heliumdb) and prod (neondb) are different environments. Set READ COMMITTED
explicitly on the checkout transaction so the guard cannot silently differ
between dev and prod.

## 4. DECISION: vendor PO generation runs AFTER commit, only on approval

Move `autoGenerateVendorOrders` OUT of the atomic transaction to AFTER the
transaction commits.
- It runs ONLY on a confirmed approval (code 1). It does NOT run on a held-for-
  review order (payment is not confirmed on a held order, so nothing may look
  "in process") and obviously not on a decline.
- It runs best-effort after commit. If PO generation fails, the paid order is
  already safely recorded, so DO NOT roll anything back. Log the failure loudly
  in a staff-visible way so staff can create the PO manually. A PO hiccup must
  never turn into a phantom charge with no order.

## 5. DECISION: no automated customer email on a held-for-review order

Do NOT create or send any automated customer email on a held order. Do not invent
a new template. The on-screen message ("order received, payment under review,
we'll contact you") is the only customer-facing message. Staff will trigger any
customer outreach from their own UI. The staff notification
(`sendStoreNewOrderNotification`) still fires after commit so staff see the held
order.

For reference, this is the confirmed after-commit email behavior by outcome:
- Approval (code 1): normal customer confirmation email + staff notification.
- Held (code 4): staff notification ONLY. No customer email.
- Decline / error: no emails (no order exists).

## 6. Confirmed unchanged

- Approach (a): single transaction holding `FOR UPDATE` across the charge, 30s
  AbortController timeout on the gateway fetch.
- Customer/address row creation moved inside the transaction, after the charge
  succeeds, so a decline creates no orphans.
- Held path: order created (`new_online_order`), payment `pending`, balance left
  at full total, cart cleared.
- `payments.status` uses `pending` for held and `completed` for approval.

## Stop

Confirm you will implement exactly points 1 to 6, then proceed to Phase 1.
Post the full diff and the API typecheck output, and STOP for review before
Phase 2. Do not start Phase 2.
