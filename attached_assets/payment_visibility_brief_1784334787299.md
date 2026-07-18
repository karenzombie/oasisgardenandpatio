# Brief: Payment truthfulness (customer badges + staff Payments + held release)

Goal: make the true state of an online (API) payment obvious to both the customer
and staff, and give admin staff the ability to release a held payment without
logging into Authorize.net. This is the client's core need and goes in BEFORE
go-live, right after the checkout hardening pass.

Most of this is surfacing data already stored on the payment row (the full gateway
response is already saved), plus one genuinely new integration piece: the
approve/decline calls for held transactions.

## How to work this brief
- Do ONE phase at a time. Do not bundle phases, and do not start the next phase
  until it is explicitly approved. Phases 1 and 2 look similar (both read-only
  display) but are separate gates; do not combine them.
- At each STOP, paste the actual raw code diff and the raw command output, not a
  prose summary of what changed. The reviewer reads the code, not the summary.
- Reality-test before claiming a phase is done: walk the actual UI AND confirm the
  DB rows with a read-only query. A green typecheck proves nothing about behavior.

## Ground rules (read first)
- **Do not degrade the existing manual "Record Payment" flow.** The staff Payments
  panel today is amount-driven (the "Paid in full / Partial / Unpaid" header badge
  comes from amount paid vs balance due) and it powers in-store and phone orders.
  Staff must keep, unchanged in behavior: Record Payment, Mark Paid in Full,
  partial payments, editing a payment, the per-payment status logging/audit trail,
  and the amount-driven header badge for manual/in-store orders. Nothing here may
  block, gate, or alter that. This brief only ADDS API-payment truthfulness
  alongside it. The "never green unless captured" rule below applies specifically
  to API payments; a manual full payment legitimately reads paid.
- **"Processed manually" is about how the payment was ultimately settled, not how
  the order originated.** An order that started online but whose API payment failed
  or was held, and was then settled by a staff-recorded manual payment, shows
  "Processed manually". An order settled by an actual API capture shows "Paid".
  The distinguishing signal is whether the settling payment has a gateway
  transaction attached (transaction id + stored Authorize.net response = API) or
  not (manual cash/check/POS).
- **Online (API) orders are paid-in-full only.** There is no partial or mixed
  online payment. So the API payment states to model are exactly three:
  paid-in-full, held-for-review, and voided. No partial-payment badge logic for
  online orders.
- **"Processed manually" applies whenever the settling payment(s) were recorded by
  staff, even on an order that originated online.** If the online API payment failed
  or was voided and staff then settle it manually, it is "Processed manually".
- **No in-portal API re-charge (option 1).** For a failed or voided online order,
  staff settle it through the existing manual Record Payment / Mark Paid in Full
  flow. Held orders get the admin approve/void actions below. Do NOT build a new
  staff action that collects a card and runs a fresh API charge from the portal.
- **Never green unless the money is truly captured.** A held (authorized but not
  captured) API payment must never render green anywhere. (This does not change the
  existing amount-driven green for manual/in-store paid orders.)
- **Payment and fulfillment stay decoupled.** Releasing or voiding a payment does
  NOT change the order's fulfillment status. Staff decide fulfillment separately.
- **Refunds are explicitly OUT of scope.** The existing manual refund option
  stays; do not build or surface any Authorize.net API refund. (Client decision,
  cost-based.)
- **Sandbox first.** All gateway-calling work is built and tested against the
  sandbox. Do NOT touch `AUTHNET_SANDBOX`. The go-live switch is separate.
- **Reality-test each phase:** walk the actual UI AND confirm the DB rows with a
  read-only query. A green typecheck proves nothing about behavior.

## Payment states and their labels
| Underlying state | Customer badge (list + detail) | Staff Payments area |
|---|---|---|
| Online paid in full (API captured) | green "Paid" | green "Paid" + gateway detail |
| Fully manual payment (POS/cash/check, paid in full) | green "Processed manually" | existing manual display |
| Held for review (API code 4) | amber "Under review" (+ contact-us line on detail) | amber "Under review", NOT green |
| Held payment declined by staff (or expired at gateway) | "Payment not completed, please contact us" (amber/red) | shows declined/not completed |

Wording is shared from a single source so staff and customer views never drift.
The customer sees "Processed manually" whenever staff recorded the settling
payment, even on an order that started online (the client wants that transparency
and UI consistency).

How this maps onto the existing panel: the amount-driven header badge ("Paid in
full / Partial / Unpaid") stays as-is for manual/in-store orders. The additions
are: (1) a held API payment (recorded as pending, so it does not count toward
amount paid) must read as "Under review", not a bare "Unpaid", so staff can tell
an API hold from an order nobody has paid; (2) a paid-in-full order distinguishes
"Paid" (settled by an API capture, i.e. the payment has a gateway transaction)
from "Processed manually" (settled by a staff-recorded payment with no gateway
transaction).

---

## Phase 0: Recon and design proposal (no code changes)
Report, before changing anything:
1. How the customer badge/status is currently derived on the My Orders list, the
   customer order detail page, AND the post-checkout order confirmation page. Note
   the confirmation page currently uses a `?held=1` URL flag (which a customer
   could edit); report whether it already fetches the order from the backend, so
   we can switch it to the real payment status like the other surfaces.
2. How the staff Payments area currently derives its state and renders payment
   rows. (For reference: it is amount-driven today, the header badge comes from
   amount paid vs balance due in
   `artifacts/web/src/staff/pages/admin/PaymentsPanel.tsx`, with manual actions in
   `artifacts/api-server/src/routes/adminOrderPayments.ts`.) Confirm the full
   gateway response is stored on the API payment row (fields available: transaction
   id, auth code, AVS result, CVV result, response reason, card type, last four,
   timestamp), and confirm how an API payment can be told apart from a manual one
   (presence of a gateway transaction id / stored response).
3. Your proposed SINGLE source of truth for badge state, implemented once (one
   shared helper: given a payment record, return the state + the customer label +
   the staff label) and reused across ALL four surfaces (confirmation page, My
   Orders list, customer order detail, staff order detail), driven by the real
   payment record, never a URL flag or client-supplied value. Wording must come
   from that one helper so staff and customer views cannot drift.
4. Your proposed approach for releasing a held transaction. Note: the correct
   mechanism is Authorize.net's Fraud Management API
   (`updateHeldTransactionRequest` with an approve or decline/reject action, using
   the held transaction's id), NOT a generic `voidTransaction`. Report the exact
   request you will use and how you will confirm the gateway succeeded before
   updating our records. Also note for context: a held transaction that is not
   acted on expires at the gateway after ~5 days and does not settle.
5. The double-settlement edge: if a held order is later settled manually (staff
   record a payment) without declining the held API transaction, could the held
   transaction still settle and double-charge the customer? Report the real
   behavior (the ~5-day expiry likely prevents it) and propose how the UI should
   nudge staff to decline a held API payment when they settle an order by other
   means.

**STOP. Report 1-5 and wait for approval before writing code.**

---

## Phase 1: Customer badges (read-only surfacing, no gateway calls)
1. Using the single shared state/label helper from Phase 0, drive a badge from the
   real payment state on: the My Orders list, the customer order detail page, AND
   the post-checkout order confirmation page. Every order shows its state
   everywhere it appears, all from the one helper.
2. On the confirmation page specifically, replace the `?held=1` URL flag with the
   real payment status from the backend, so it cannot be faked by editing the URL.
   (If Phase 0 found the confirmation page does not fetch the order, report that
   and we will decide whether adding a fetch is worth it before you change it.)
3. Labels per the table above: green "Paid", green "Processed manually", amber
   "Under review", and the "Payment not completed, please contact us" state.
4. On the customer order DETAIL page and the confirmation page for a held ("Under
   review") order, include the short line telling them the team will contact them
   to confirm payment (reuse the confirmation-page wording, one source).
5. This phase performs NO gateway calls. It only reads existing payment state.

Run the web typecheck and paste the full output.

**STOP. Post the diff and typecheck output. Wait for approval before Phase 2.**

---

## Phase 2: Staff Payments truthfulness (read-only surfacing, no gateway calls)
1. In the staff order Payments area, for API payments, render an honest state using
   the shared helper, never green unless the money is truly captured: green "Paid"
   only for a captured full payment; amber "Under review" for a held (pending)
   payment; and "declined / not completed" for a declined-or-expired held payment.
   Note: because a plain online decline creates no order (per the checkout orphan
   fix), no `failed` API payment rows are written against orders in this design;
   still, render any unexpected payment status honestly (and never green) rather
   than assuming.
2. Surface the stored gateway detail, privacy-limited: transaction id, auth code,
   response reason text, card type, last four, timestamp, and AVS and CVV as
   STATUS ONLY ("Match" / "Mismatch" / "Not checked"). NEVER show the card number,
   the actual billing address, or the actual CVV value.
3. Make it clear whether a payment came in via the online API or was recorded
   manually (POS/cash/check), so staff never conflate the two. Do not alter the
   manual Record Payment dialog or its data.
4. This phase performs NO gateway calls. It only reads/renders stored data.
5. Non-regression: the existing amount-driven manual flow must behave exactly as
   before. Record Payment, Mark Paid in Full, partial payments, editing a payment,
   and the audit logging all keep working unchanged for manual/in-store orders. Do
   not remove or rewire the existing amount-driven header badge for those orders;
   only add the API-state branches on top.

Run the web typecheck and paste the full output.

**STOP. Post the diff and typecheck output. Wait for approval before Phase 3.**

---

## Phase 3: Held release (approve / decline) — the new gateway integration
1. Add two admin-only actions on a held ("Under review") order in the staff
   Payments area: Approve the held payment, and Decline the held payment. Use
   Authorize.net's Fraud Management API (`updateHeldTransactionRequest` with the
   approve or decline/reject action on the held transaction id), NOT a generic
   `voidTransaction`.
2. Admin-only must be enforced on the SERVER endpoint (reject a non-admin caller),
   not merely hidden in the UI. A hidden button is not access control, and this
   moves real money.
3. Each action calls the gateway and must confirm the gateway succeeded BEFORE
   updating our records. On gateway failure, change nothing and surface a clear
   error.
4. If the gateway action succeeds but our own DB update then fails, do NOT silently
   swallow it: log CRITICAL with the transaction id (the gateway state has changed
   but our record has not) so staff can reconcile, and surface that the gateway
   action did go through. Mirror the reconciliation pattern used in checkout.
5. Handle a stale held state: if the gateway reports the transaction is no longer
   held (already approved, declined, or expired past the ~5-day window), do not
   error blindly. Surface the real gateway state and re-sync our record to match,
   rather than forcing an approve/decline.
6. Both actions are confirmation-gated (a deliberate confirm step, not a one-click
   accident) and guarded against double-fire (disable while a request is in flight)
   since they move real money.
7. On successful approve: the payment becomes captured/paid, the balance zeroes,
   and the customer badge flips to green "Paid" everywhere. The order's fulfillment
   status is NOT changed automatically.
8. On successful decline: the payment is marked declined/not completed, the
   customer badge flips to "Payment not completed, please contact us" everywhere.
   The order's fulfillment status is NOT changed automatically (staff decide
   separately; they may then take payment another way and record it manually).
9. Never log the card number or CVV. Transaction key stays server-only.

Run the typecheck and paste the full output.

**STOP. Post the diff and typecheck output. Wait for approval before Phase 4.**

---

## Phase 4: Reality-test in sandbox
With sandbox keys active, walk through and report (confirm each with a read-only
DB check where relevant):
1. A captured online order shows green "Paid" on the My Orders list, the customer
   detail page, the confirmation page, and the staff Payments area, with the
   gateway detail rendered and AVS/CVV shown as status only.
2. A held order shows amber "Under review" on all customer surfaces (list, detail,
   confirmation page) and in staff, never green, with the contact-us line on the
   customer detail and confirmation pages. Confirm the confirmation page reads the
   real status, not the old `?held=1` URL flag (editing the URL must not change it).
3. Admin approve of a held payment: gateway approve succeeds, payment captures,
   balance zeroes, customer badge flips to green "Paid". Confirm a non-admin staff
   user cannot use it AND that the server endpoint itself rejects a non-admin
   caller (not just a hidden button).
4. Admin decline of a held payment: gateway decline succeeds, payment marked
   declined, customer badge flips to "Payment not completed, please contact us"
   everywhere.
5. A fully manual (POS/cash) full payment recorded via the untouched Record Payment
   dialog shows green "Processed manually" to the customer. Confirm the manual flow
   still works exactly as before.
6. Non-regression on the existing manual UI: take an in-store style order with a
   balance due and confirm Record Payment, Mark Paid in Full, a partial payment,
   editing a payment, and the status/audit logging all still work exactly as they
   did before this brief. This is the flow the client uses daily; it must not
   regress.
7. Confirm no card number, billing address, or CVV value appears anywhere in the
   staff UI.

Forcing a held (code 4) in the sandbox is difficult; if it cannot be triggered,
verify the approve/void paths against a normal authorized transaction where
possible and confirm the held-state rendering by code walkthrough, noting it will
be validated on the first real held transaction.

**STOP and report the walkthrough results.**
