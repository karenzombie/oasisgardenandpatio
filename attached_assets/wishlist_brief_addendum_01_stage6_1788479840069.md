# ADDENDUM 1: Stage 6

**Applies to:** BRIEF: Require An Account To Save To Wishlist, Stage 6.
**Status:** Replaces the implementation instruction in Stage 6. Every other
stage, boundary and rule in the brief is unchanged.
**Do not** revise the original brief. Work from the brief plus this addendum.

---

## Why this addendum exists

Stage 6 as written added a cart refresh to the sign-in bridge. That produced a
reproducible failure: after signing in, the header stayed on `Sign In` while the
account page still rendered, and the customer was in fact signed in on the
server the whole time.

An A/B test confirmed Stage 6 as the trigger. Server-side diagnostics then
established two things:

1. The server session was healthy throughout. Every `GET /api/cart` ran on the
   correct authenticated session and left it intact. The cart requests do not
   disturb the session.
2. During the bridge, a second `GET /api/auth/me` fires on a different session,
   before the browser has received the authenticated cookie, and returns 401.

The conclusion drawn from that capture: the client's cached answer to "who is
signed in" can end up holding that stale 401 instead of the authenticated
result. Stage 6 shifted the timing enough to expose it. **The race is not
created by Stage 6 and removing Stage 6 would only hide it again.**

This addendum fixes the race rather than the symptom.

---

## What to change

`artifacts/web/src/lib/useClerkSync.ts` only. No other file.

- `clerkSync()` already resolves with the signed-in user. In the generated
  client, both `clerkSync()` and `getCurrentUser()` are typed
  `Promise<CurrentUser>`, the identical shape. The current code discards that
  value and asks the server again.
- On success, make the value `clerkSync()` returned the authoritative cached
  value for `getGetCurrentUserQueryKey()` instead of discarding it.
- A stale in-flight `/api/auth/me` must not be able to overwrite it. Cancel
  in-flight fetches for that key before writing the value.
- Do not refetch `/api/auth/me` afterward. The written value came straight from
  the server on this request. Refetching reopens the race this addendum closes.
- Keep the cart refresh Stage 6 added. It runs after the authenticated user
  value is written.
- Everything else in the file stays exactly as it is: the session-id guard, the
  in-flight ref, the 403 account-disabled path, the 409 path.

If the cancel-then-write approach cannot be made reliable in this version of
the query library, **stop and report rather than inventing an alternative.**

---

## Boundaries

- No server changes. The server behavior is already correct.
- No OpenAPI, codegen or schema changes.
- Do not touch `mergeGuestCartIntoUserCart`.
- Do not remove the temporary diagnostic logging in `auth.ts` and `cart.ts`
  yet. It comes out as its own step after verification.
- Do not start Stage 7.

---

## Verification, run by Karen

1. Sign in and out at least ten times in a row. The header must show the
   customer name every single time. This failure was intermittent, so one
   success proves nothing.
2. Repeat immediately after an API server restart, which was one of the
   conditions where behavior differed.
3. Repeat with a guest cart in play, signing in to an account that already has
   items in its cart. Header, cart page and checkout must all show both sets
   right away.
4. Complete a checkout end to end.
5. Sign out. The header must return to `Sign In`.

---

## After verification

Removing the temporary diagnostics from `auth.ts` and `cart.ts` is a separate
step, done on instruction, followed by a short re-check of sign-in and the
header. Stage 7 does not begin until then.
