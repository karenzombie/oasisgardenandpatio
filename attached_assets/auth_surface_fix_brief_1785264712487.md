# Agent Brief: Make the entire authentication surface correct and verified

## Status

CRITICAL. Customer and client blocking. The login/account flow must work
correctly end to end before this is considered done. A known live failure:
customer password reset saves a new password but sign-in still rejects it
("incorrect password"). There may be more. This is a recent break; find the cause
from the actual change history, do not assume prior state.

## Ground rules for this brief (read first)

- This brief points you at the WHOLE authentication surface and the expected
  behavior. It does NOT hand you a predetermined fix. Investigate, find the real
  cause, propose the fix, and wait for approval before changing anything.
- Do NOT assume what did or did not work before. Establish it from evidence: git
  history / recent commits, the actual code, and real runtime behavior. If you
  cannot establish something from evidence, say so rather than guessing.
- When you find something adjacent that is wrong or risky, REPORT it. Do not
  quietly change code outside what is approved.
- A green typecheck or build proves nothing. Verification means exercising the
  actual flows and observing real outcomes.

## Scope: every authentication flow, both portals

Customer (Clerk-based):
- Sign up
- Sign in (email/password)
- Sign in (Google / SSO)
- Sign out
- Password reset ("forgot password")
- Email verification
- Email change
- Session persistence / staying signed in across navigation and reload
- The account page load after sign-in (the clerk-sync -> /api/auth/me handoff)

Staff (separate local auth with TOTP 2FA, at /staff/*):
- Staff sign in
- Staff sign out
- Staff account recovery
- 2FA / TOTP enrollment and challenge
- Staff session persistence

## The known failure to diagnose (do not pre-judge the fix)

Customer "forgot password": the reset email arrives, the link opens a
create-new-password screen, the new password is submitted, but the subsequent
sign-in rejects it as incorrect. Determine from the code and recent history WHY:
which system the reset writes the new password to, which system sign-in validates
against, whether those are the same system, and whether recent changes altered
either path. Report the root cause with evidence (file + line + relevant commit)
before proposing a fix.

## GATE 1 - Read-only investigation (NO code changes)

1. Map recent change history touching any auth code (customer and staff): recent
   commits, what each changed, and when. Identify anything that plausibly affects
   the flows above.
2. For customer auth, trace where each of the following lives and how they connect:
   password validation on sign-in, password writing on reset, Clerk vs any local
   password store, the clerk-sync bridge, and the /api/auth/me session check.
3. For staff auth, confirm it is fully independent of the customer/Clerk changes,
   and identify any shared code, shared routes, shared middleware, or shared
   helpers that a customer-auth change could touch.
4. State, per flow in the scope list, whether it currently works, is broken, or is
   unverified, WITH the evidence for each claim.
5. State the root cause of the password-reset failure, and your proposed fix for
   it, plus anything else the investigation surfaced.

Paste findings raw. STOP. Wait for approval before Gate 2.

## GATE 2 - Fix (only after Gate 1 approved)

Fix the confirmed issues so every flow in scope works correctly. The guiding
requirement, not a prescribed implementation: password reset must set a credential
that the sign-in path actually validates against, so a user who resets can then
sign in. Apply the same standard to anything else Gate 1 surfaced, but only what
is approved.

Paste raw diffs for every file changed. Do not self-certify.

## GATE 3 - Automated end-to-end verification (build it, run it, show real output)

Build an automated test pass that exercises the real flows against the running
app as actual requests/interactions, checking real outcomes (not typecheck, not
"it compiles"). Cover the full scope list above for BOTH customer and staff.
Report, per flow, pass or fail with the actual observed result. Where a flow
cannot be fully automated (e.g. a real email inbox, Google's hosted screens,
Clerk's hosted behavior), say so explicitly and mark it as needing Karen's manual
confirmation rather than reporting it as passed.

Then provide a SHORT manual checklist for Karen covering only the parts the
automated test could not certify. Karen's browser is final acceptance; the
automated pass exists to catch the mechanical breaks first so the manual list is
short.

Do not report any flow as "working" that the test did not actually exercise.

## HARD GUARDRAILS

- STAFF UI LOGIN MUST NOT BREAK. The staff portal (/staff/*) uses its own local
  session auth with TOTP 2FA and is separate from Clerk. Do NOT alter staff auth
  behavior while fixing customer auth. If any shared code, route, or middleware
  forces a change that touches staff, STOP and report it before proceeding, with
  the exact shared dependency named.
- Do NOT touch checkout, cart, payments (Authorize.net), or order/shipping emails.
- Do NOT change the Gate 2 opt-out work already shipped: the
  /account/marketing-preference/opt-out endpoint stays decommissioned (410, no
  token trust, no writes) and AccountOptOut.tsx stays redirect-only.
- Do NOT regress the customer sign-in navigation fix already shipped (single-click
  sign-in lands on /account; no stuck card).
- Do NOT modify adjacent code the brief does not cover. Report it, do not change
  it.
- Never wipe, delete, or truncate transactional data (customers, users, orders,
  carts, sessions) under any circumstances.
- Work so that changes can be verified before they reach customers. Call out
  anything that must go to prod to be testable, and why.
