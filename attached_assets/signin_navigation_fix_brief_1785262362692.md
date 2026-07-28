# Agent Brief: Sign-in card does not navigate away after a successful login

## Status

LIVE ON PROD. Introduced or surfaced by the Gate 2 sign-in redirect change.
Customers can still sign in (the session does establish), but the sign-in form
stays on screen afterward and a second click errors. Broken, confusing sign-in
UX currently live.

## Symptom (exact reproduction, from Karen)

1. Go to `/sign-in` while logged out (e.g. via the wishlist opt-out link).
2. Enter email + password, click Continue.
3. The button changes to "Signing in". The sign-in card does NOT disappear.
4. The user IS actually signed in at this point: the header shows the account as
   signed in, cart and wishlist populate.
5. Clicking Continue again returns an error that the user is already signed in.

## The key narrowing (read this first)

This is NOT an authentication failure. `signIn.finalize()` succeeds and the
session goes active. The ONLY thing failing is that the app does not navigate
away from the sign-in view once the session is active. Do not investigate Clerk
credential/auth config. Investigate post-login navigation and the sign-in route's
signed-in handling.

## Leading hypothesis (confirm, do not assume)

Gate 2 changed CustomSignIn.tsx's post-login redirect from `setLocation("/")` to
`setLocation("/account")`. `/account` is auth-gated; `/` is not. The likely
mechanism is a race: the handler calls `setLocation("/account")` immediately after
`await signIn.finalize()`, but Clerk's `isSignedIn` has not propagated into React
state yet, so the `/account` route guard sees "not signed in" and redirects back
to `/sign-in`. The user lands back on the sign-in card while actually being signed
in. This matches every part of the symptom, including the second-click error.

Secondary thing to check: the Gate 2 AccountOptOut.tsx change derives a base path
from `import.meta.env.BASE_URL` and redirects to `${basePath}/sign-in`, while
CustomSignIn.tsx uses a bare `setLocation("/account")`. Confirm base path handling
is consistent and that `/account` resolves to the real route.

## GATE 1 - Read-only investigation (NO code changes)

Paste the actual code (raw) for each, then state the confirmed root cause and the
proposed fix, and STOP:

1. The full submit handler in `CustomSignIn.tsx`: how `signIn.finalize()` is
   awaited and exactly how/when `setLocation` runs relative to it.
2. How the `/sign-in` route is mounted (router config, base path) and whether the
   sign-in page has any guard that redirects away when the user is already signed
   in. Report whether such a guard exists.
3. How the `/account` route guards for auth, and what it does when it sees an
   unauthenticated state (does it redirect to `/sign-in`?).
4. Confirm whether `isSignedIn` from Clerk's `useAuth` is available on the sign-in
   page and how quickly it reflects a completed `finalize()`.

## GATE 2 - Implement (only after Gate 1 is approved)

Make landing on `/account` after login reliable. The user's decision is to keep
landing on `/account`; do NOT revert to `/`. Preferred approach (confirm against
what Gate 1 finds):

- Drive the post-login redirect off the signed-in state rather than firing
  `setLocation` inline right after `finalize()`. Add a guard on the sign-in page:
  when Clerk `isSignedIn` is true, redirect to `/account`. This is the same
  pattern AccountOptOut.tsx now uses, and it guarantees the form is never left on
  screen once the session is active, regardless of timing.
- If the `/account` guard is bouncing an in-flight session back to `/sign-in`,
  ensure it waits for Clerk to finish loading (`isLoaded`) before deciding a user
  is unauthenticated, so a just-finalized session is not treated as logged out.
- Fix any base path inconsistency between the two files.

Paste the raw diffs for every file changed. Do not self-certify.

## GATE 3 - Verification (Karen's browser is the acceptance)

Provide exact steps for Karen covering:
1. From `/sign-in` (reached via the opt-out link while logged out), enter email +
   password, click Continue ONCE. The sign-in card disappears and the user lands
   on `/account`, signed in, with no second click needed and no "already signed
   in" error.
2. The "Continue with Google" path still lands the user correctly (regression
   check, since it shares this page).
3. The double-password-field issue fixed last night is still fixed (no
   regression).
4. Signing out and back in behaves normally.

Do not report "verified" from an agent self-test. Provide steps + raw output;
Karen confirms in her browser.

## Hard guardrails

- Do NOT change the Gate 2 opt-out work: the `/account/marketing-preference/opt-out`
  endpoint stays decommissioned (410, no token trust, no writes), and
  AccountOptOut.tsx stays a redirect-only page. Leave both.
- Do NOT regress the double-password-field fix shipped last night.
- Do NOT touch checkout, cart, payments (Authorize.net), or order/shipping emails.
- Do NOT change Clerk credential/auth configuration. This is a client-side
  navigation fix.
- Do NOT modify adjacent code the brief does not name. Report it, do not touch it.
- Scope strictly to the email/password sign-in navigation and its shared page.
