# Agent Brief: Email link + token security audit, then fix the opt-out bypass

## Status

LIVE PRODUCTION SECURITY GAP. One bypass is already confirmed (the wishlist
opt-out link). This brief AUDITS every email link and token flow read-only FIRST,
then fixes the confirmed issue plus anything the audit surfaces. Audit gate makes
zero code changes. This brief supersedes the earlier opt-out-only brief.

## Confirmed issue that triggered this (context)

Wishlist "saved an item" emails link to:

    /account/preferences/opt-out?token=<signed token>

The token decodes to `{"customerId": <id>, "exp": <ms>}` with an HMAC signature
and ~30 day expiry (confirmed by decoding a real live token). Reproduced in a
clean browser with no login: clicking the link BYPASSES login, lands the visitor
inside that customer's account, and immediately changes the marketing preference
on the click. The token is a bearer credential for the account. This is an
account-access bypass plus a state change on a bare GET.

We do not assume this is the only such link. Hence the audit.

## Known token surfaces to account for (find ALL, not just these)

From the database schema, these token tables exist and must each be traced to
what sends them and what they grant:
- `password_reset_tokens`
- `email_verification_tokens`
- `email_change_tokens`
- `admin_recovery_tokens`

Plus the STATELESS wishlist opt-out token (self-verifying, no DB row, so it
cannot be revoked by deleting a row), and the wishlist outreach emails
(`wishlist_outreach_log`). There may be more. Inventory everything.

---

## GATE 1 - Read-only security audit (NO code changes, no DB writes)

Do not modify any code or data in this gate. Produce an inventory and paste raw
findings, then STOP for review.

### 1a. Enumerate every outbound email

Find every place the app sends email (all Resend calls / templates). For each
email, list: its name, what triggers it, and every link/URL it contains.

### 1b. Classify every link that carries a token or reaches an account area

For each such link, state plainly:
- Token type and claims (stateless signed token vs a row in one of the token
  tables above; what fields it carries).
- What authority hitting the link grants (nothing / one specific action / account
  access).
- Does hitting it create a session, cookie, or signed-in state? (yes/no + where)
- Does it write to the database on a GET / on the click? (yes/no + what table)
- Expiry, and single-use vs reusable.
- Does it require login, or bypass it?
- Is the affected account derived from the TOKEN or from the authenticated
  session? (Token-derived routing is a red flag: a forwarded link would point one
  user at another's account.)

### 1c. Separate legitimate login-free flows from bypasses

Password reset and email verification are SUPPOSED to work before login. For each
of those, confirm they are single-use, short-lived, and limited to their one
action (reset password / verify email) and nothing more. Flag any that grant
broader access or create a full session.

### 1d. Blast radius (read-only DB)

From `email_log`, count how many of each email type have been sent, so we know
how many live links of each kind are in inboxes.

### 1e. Deliverable

A table: email | trigger | link | token type | grants | creates session? |
writes on GET? | expiry | login required? | account from token or session? |
verdict (OK / NEEDS FIX / REVIEW). Paste it raw. STOP. Wait for review before any
fix.

---

## GATE 2 - Fix the confirmed opt-out bypass (only after Gate 1 review)

This spec is fixed. Additional fixes for anything the audit surfaces will be
scoped separately after review; do not invent them here.

Required end-state for `/account/preferences/opt-out`:
1. Never creates any session/cookie/signed-in state from the token.
2. Never changes any preference or any other data. No writes on this path.
3. Unauthenticated visitor is sent to the normal Clerk login first.
4. After login, the user lands on THEIR OWN preferences page, with the account
   resolved from the authenticated Clerk session ONLY. The token's `customerId`
   is never used to decide whose account or preferences are shown.
5. The opt-out toggle stays MANUAL, persisted only by the user's explicit click on
   the preferences page through the existing authenticated mutation.

Also update the email template: point the "Opt Out of Marketing Contact" button
at the clean destination (login -> own preferences page), carrying no bearer token
that grants access or triggers a change. Keep the rest of the email intact.

The ENDPOINT change is what closes the exposure for tokens already in inboxes.
Changing only the template does NOT close it.

Paste the raw diffs. Do not self-certify; verification is Gate 3.

---

## GATE 3 - Verification (Karen's browser is the acceptance)

Provide exact click-by-click steps for Karen, covering:
1. Clean browser, not logged in, click a real opt-out link -> lands on Clerk
   login, NOT inside any account, and NO preference changed.
2. Complete login -> lands on the user's OWN preferences page, preference still
   unchanged until manually toggled.
3. Logged in as a DIFFERENT user, click a link whose token names another customer
   -> the other account is never reached or altered.
4. Read-only check confirming the endpoint performed no database write.

Do not report "verified" from an agent-side self-test. Provide steps + raw output;
Karen confirms in her browser.

---

## Hard guardrails (all gates)

- No code or data changes in Gate 1. Read-only only.
- Do NOT create, extend, or reuse any session/JWT/cookie minting on the opt-out
  path.
- Do NOT read a token to authorize or route to a specific account.
- Do NOT add a `?redirect=` style open redirect. Post-login destination is a fixed
  internal path, never taken from token or query string.
- Do NOT touch checkout, cart, payments (Authorize.net), or order/shipping email
  delivery.
- Do NOT modify the Clerk sign-in component config beyond wiring the post-login
  redirect. (A Clerk double-password-field fix shipped last night; do not regress
  it.)
- Do NOT modify adjacent code the brief does not name. Report it, do not change it.
- Never wipe, delete, or truncate transactional data.
