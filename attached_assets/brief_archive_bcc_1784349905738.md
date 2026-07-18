# Agent Brief: Archive BCC on all Resend emails

## Goal
Add a single archive BCC to every outbound Resend email, injected at ONE central
point. The address is hardcoded as a constant:

    online@oasisgardenandpatio.com

This is a backup of all sent mail for the client. It applies to every email:
customer, vendor, and staff. No exceptions, no per-type logic.

Critical gating: only add the BCC on real sends. Skip it whenever the existing
`EMAIL_TEST_REDIRECT_TO` dev redirect is active (see `email.ts`). Reason: while
the sending domain is unverified, Resend rejects the entire send if any
non-owner address is on it, and the archive address is a non-owner address until
the domain is verified. So the BCC must be off in the dev/test-redirect path and
on otherwise. This makes it automatically on in prod once the domain is verified,
off in dev, with no env var and nothing to flip later.

## Context
Outbound mail goes through the Resend client in several spots under
`artifacts/api-server/src`. Some route through `sendEmail()` in
`artifacts/api-server/src/lib/email.ts`. Others build their own
`client.emails.send(...)` call directly, including several helpers inside
`email.ts` itself and the whole of `lib/vendorOrderEmail.ts` and
`lib/recoveryEmail.ts`. Every one of these must include the archive BCC.

## Rules
- One injection point only. Do NOT add the BCC in multiple places.
- Do NOT change any email subject, body, `from` address, or `to` recipient.
- Do NOT change the existing `EMAIL_TEST_REDIRECT_TO` behavior. Only READ it to
  decide whether the redirect is active, and skip the BCC when it is.
- The archive address is the hardcoded constant online@oasisgardenandpatio.com.
  Define it once. Do NOT read it from an env var.
- Do NOT fix, refactor, or "improve" anything else you notice. Note it in your
  report and leave it alone.
- If you cannot determine how a send path works, write "I could not determine
  this" and stop. Do not guess.
- Check in after each numbered step below. Do not run ahead.

## Step 1: Report every send path (no code changes)
List every place in `artifacts/api-server/src` that sends mail via Resend
(`client.emails.send(...)` or any equivalent). For each, give the file path,
line number, function name, and whether it currently goes through `sendEmail()`
in `email.ts`. Make no changes. Check in with this list.

## Step 2: Central injection point
In `email.ts`, add one low-level function (for example `sendViaResend(payload)`)
that:
1. Gets the Resend client (reuse the existing credential logic).
2. Determines whether the dev test-redirect is active (the same
   `EMAIL_TEST_REDIRECT_TO` condition `sendEmail()` already uses).
3. If the redirect is NOT active, adds the hardcoded constant
   online@oasisgardenandpatio.com as a `bcc` on the outgoing payload, merged
   with any `bcc` already present (do not drop an existing one). If the redirect
   IS active, add no BCC.
4. Calls `client.emails.send(payload)`.

Route `sendEmail()` and the other helpers in `email.ts` that currently build
their own `client.emails.send(...)` through this one function. Do not touch
their subjects, bodies, from, or to/redirect logic. Show the diff and check in.

## Step 3: Route the remaining modules through it
Refactor `lib/vendorOrderEmail.ts` and `lib/recoveryEmail.ts` so their
`client.emails.send(...)` calls also go through the central function from Step 2
(import it from `email.ts`). If a module cannot cleanly reuse it, say so rather
than duplicating the BCC logic anywhere. Show the diff and check in.

## Step 4: Verify the wiring (no verified domain required)
Confirm both states:
- Test-redirect active (dev): no BCC is added, payloads are unchanged, dev email
  still sends.
- Test-redirect not active: the archive BCC appears on the final payload for
  every send path from Steps 2 and 3.

A temporary log line or a small test that prints the final `to` and `bcc` of the
outgoing payload is acceptable. Report exactly how you verified and for which
send paths. Remove any temporary log before finishing.

## Out of scope
- The `from` address change (to sales@oasisgardenandpatio.com) is a separate
  environment/secret change, not code. Do not touch it.
- Domain verification and DNS are handled separately. Do not attempt them.
