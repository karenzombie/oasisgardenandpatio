# BRIEF: Require An Account To Save To Wishlist

**Type:** New brief. Independent of the guest cart merge brief, which is
complete.
**Decision:** Guest wishlists are being retired. Saving to a wishlist will
require an account.
**Approach:** Gate now, remove the unused plumbing later. Staged, with hard
stops. Stage 1 changes nothing.

---

## Why

A wishlist is a sales lead. Staff can see, print and follow up on a signed-in
customer's list. A guest list is invisible to staff, so it produces no value for
the business while still costing complexity to maintain.

---

## What is NOT happening in this brief

This is the "lock the door" phase, not the "brick it up" phase. All of the
following stays in place, unused, and will be removed as separate work later:

- The device-token storage helpers in `artifacts/web/src/lib/wishlistHold.ts`
  (`getDeviceToken`, `ensureDeviceToken`, `clearDeviceToken`, `wishlistKeyFor`).
- The server route `POST /wishlist/merge`.
- The `deviceToken` fields in the OpenAPI spec.
- The `device_token` column on `wishlist_items` and its partial unique index.

**No OpenAPI change. No codegen. No schema migration.** If you find yourself
needing any of those, stop and report rather than proceeding.

---

## Current behavior, verified against the code

Read this before changing anything. It is what makes the change small, and
several of these points differ from what you would assume.

- `WishlistButton.tsx` is the single shared control behind **every** wishlist
  entry point: the hearts on Shop, Search and Manufacturer product cards, and
  all three Add to Wishlist paths on the product detail page. Gating this one
  component covers all of them.
- `handleClick` in that component checks the disabled/config-required state
  first and shows a "Selection required" toast. That ordering is correct and
  must be preserved: a guest picks their finish and fabric first, and only then
  gets the account prompt.
- `handleClick` then has **two** paths that reach the API, not one. Toggle mode
  removes an existing row when the product is already saved, and everything
  else calls the add mutation. Both currently run for guests.
- `WishlistAccountPromptModal.tsx` already exists. It is a dismissible dialog
  with Sign In and Create Account buttons plus a third "Replace my saved
  configuration" button. The modal itself does not navigate. Its Sign In and
  Create Account callbacks are supplied by `WishlistButton.tsx`, which is where
  the navigation lives.
- **`?redirect_url=` does not work for sign-in.** `WishlistButton.tsx`,
  `Cart.tsx` and `Checkout.tsx` all append it, but `CustomSignIn.tsx` never
  reads it. On success it returns `<Redirect to="/account" />` unconditionally.
  Whether Clerk's prebuilt `SignUp` honors the param is unverified and is a
  Stage 1 question.
- `useClerkSync()` is mounted in `App.tsx` inside the customer shell and runs
  off Clerk's auth state rather than off page loads. When Clerk reports a
  signed-in user it calls `POST /auth/clerk-sync`, which bridges to the Express
  session and merges the guest cart server side. **Nothing has to navigate for
  a sign-in to take effect.**
- **That effect refreshes only `/auth/me`, never the cart.** No other code
  refreshes the cart on sign-in either. Stage 6 covers this.
- `OnboardingGate` in `App.tsx` redirects any signed-in customer whose profile
  is incomplete (missing first or last name, or no accepted privacy policy and
  terms) to `/account` from every path except `/account` itself. Every
  brand-new account is in that state until onboarding is finished. This
  overrides any redirect target and is existing, intended behavior.
- `/sign-in` renders `CustomSignIn.tsx`, a custom form built on Clerk's
  `useSignIn` hook. It is not Clerk's prebuilt widget. It also carries a
  "Continue with Google" button that leaves the site for Clerk's SSO flow and
  returns to the site root.
- `/sign-up` renders Clerk's prebuilt `SignUp` component in `routing="path"`
  mode, which walks through sub-URLs for verification.
- The Clerk package in this repo is `@clerk/react` at version `6.5.0`. It is
  not `@clerk/clerk-react`. Check documentation for the right package.
- `noUnusedLocals` is false in `tsconfig.base.json`, so imports left unused by
  these edits will not fail typecheck.

---

## Required behavior

**A guest who clicks any wishlist control stays exactly where they are.** They
see a popup explaining they need an account. They can sign in or create one from
it, or dismiss it and carry on browsing with their product selections intact.

Nothing may redirect a guest automatically. Ever.

---

## Stages

Hard stop at the end of each. Do not combine stages. If a stage contradicts this
brief, stop and say so rather than adapting on your own.

### Stage 1: Investigation only. Change nothing.

Two questions, both about `@clerk/react` version `6.5.0` as installed here:

1. Can Clerk's prebuilt `SignUp` component render inside a dialog without path
   routing, completing the whole sign-up including email verification without
   navigating away?
2. Does that same `SignUp` component honor a `?redirect_url=` query parameter,
   given that `fallbackRedirectUrl` is already set on it in
   `ClerkAuthPages.tsx` and `signUpFallbackRedirectUrl` is set on the
   `ClerkProvider` in `App.tsx`?

Report what you find, what you based it on, and your confidence on each.
**Write no code. Change no files. Install nothing.** If either answer is
unclear, say it is unclear rather than guessing.

**STOP. Report. Wait for confirmation.**

### Stage 2: Gate the wishlist control

In `WishlistButton.tsx`:

- Add the not-authenticated check inside `handleClick`, positioned **after** the
  disabled/config-required check and **before both** the toggle-remove branch
  and the add mutation. When the user is not authenticated, it opens the
  account prompt modal and returns. No navigation, no API call, on either path.
- Preserve the existing order: the disabled check and its "Selection required"
  toast run first, exactly as they do now. A guest who has not chosen a
  required finish or fabric gets that toast, not the account modal.
- The control stays **visible** for guests. Do not hide it, do not disable it.
  The point is to show what they are missing.
- Remove the now-unreachable guest plumbing inside this file only: the `409`
  branch in the add mutation's `onError` that opens the modal, the
  `replaceExisting` argument and guest branch of `buildAddData`, and the
  `onReplace` callback passed to the modal. The generic "Could not save to
  wishlist" error toast stays.
- Signed-in behavior is completely unchanged.

In `WishlistAccountPromptModal.tsx`:

- Remove the `onReplace` prop, its "Replace my saved configuration" button, and
  the `replacing` prop that only fed that button's pending label. That existed
  for a guest-conflict case that can no longer happen.
- Replace the title with: `Sign in to save to your wishlist`
- Replace the body with: `Your wishlist is saved to your account, so it's there
  whenever you come back, on any device. Sign in or create a free account to
  save this item.`
- Keep the Sign In and Create Account buttons and the navigation
  `WishlistButton.tsx` supplies for them, `?redirect_url=` included. That param
  does nothing today. Stage 7 makes it work and Stage 8 changes Sign In to stay
  on the page. Do not try to fix it here.
- In the slot the removed button occupied, add a plain dismiss action reading
  `Keep browsing` that simply closes the dialog. Dismissing must not navigate
  and must not clear the customer's product selections.

In both files, update the header comment block. Each one currently describes the
guest behavior in detail, including guests saving a second configuration and
being offered a replace. Those rules no longer exist after this stage, and a
comment that contradicts the code is worse than no comment. Rewrite both to
describe what the code now does.

**STOP. Report the diff and paste typecheck output. Wait for confirmation.**

### Stage 3: Stop reading and merging guest wishlists

Guest rows created before this ships are still in the database. Karen clears
them herself after all of this is verified, so until then the client must
simply ignore them. Without this stage, a returning visitor still sees a filled
header heart with a count, filled hearts on product cards, and their old list
on `/wishlist` with buttons that fail once Stage 5 lands.

In `artifacts/web/src/lib/wishlistHold.ts`, three narrow changes:

- `useWishlistItems`: when the visitor is not authenticated, make no request and
  return an empty list. Never send a `deviceToken` parameter. The signed-in path
  is unchanged, including its identity-scoped query key.
- The loading flag this hook returns drives a full-page spinner on
  `Wishlist.tsx`. A signed-out visitor makes no request, so that flag must be
  false for them and the page must render its signed-out state immediately. A
  page that spins forever waiting on a request that no longer happens is a
  failure of this stage.
- `migrateLegacyGuestWishlist`: when the visitor is not authenticated, clear the
  legacy `oasis-pending-wishlist` key and return without creating any rows. The
  signed-in path is unchanged.
- The merge effect inside `useWishlistBootstrap`: stop calling `mergeWishlist`.
  Leave the server route `POST /wishlist/merge` in place and untouched.

Do not touch `getDeviceToken`, `ensureDeviceToken`, `clearDeviceToken` or
`wishlistKeyFor`. They stay for the later removal work. **This file has nothing
to do with the cart. Do not touch cart code from this stage.**

**STOP. Report the diff and paste typecheck output. Wait for confirmation.**

### Stage 4: The `/wishlist` page for guests

In `Wishlist.tsx`, for signed-out visitors only:

- Change the heading from `My Wishlist` to `Wishlist`.
- Remove the subtitle line that reads `Saved on this device. Sign in to save
  them to your account permanently.`
- The card that currently holds `Your wishlist is empty.` and the
  `Browse Products` button instead holds this message:
  `Sign In or Create Account to save items to your Wishlist`
  where `Sign In` and `Create Account` are links, not buttons, pointing at the
  sign-in and sign-up routes with `?redirect_url=%2Fwishlist`.
- Keep the page's existing heading style, heart icon, breadcrumb and card
  framing. This is a content swap inside the existing layout, not a redesign.

After Stage 3 a signed-out visitor always has an empty list, so this card is
what they always see.

Signed-in behavior on this page is completely unchanged, including the real
empty state when a signed-in customer has saved nothing.

**STOP. Report the diff and paste typecheck output. Wait for confirmation.**

### Stage 5: Require auth on the wishlist API

In `artifacts/api-server/src/routes/wishlist.ts`:

- `GET /wishlist`, `POST /wishlist` and `DELETE /wishlist/:id` currently accept
  optional auth and branch on a device token. Make all three use `requireAuth`,
  so anyone else gets the existing 401 `Authentication required` response.
- Remove only the guest branches inside those three handlers. Do not touch the
  signed-in logic: the config-key dedupe, the customer resolution, the wishlist
  parent record, the `item_added` history event and the disclosure email all
  stay exactly as they are.
- Leave `POST /wishlist/merge` in place and unchanged. It already requires auth
  and, after Stage 3, nothing calls it.
- Leave the OpenAPI spec alone. The spec will still advertise `deviceToken`
  fields. That is expected in this phase and gets cleaned up separately.
- **This file is the wishlist route only. The cart and checkout routes are not
  part of this stage.**

**STOP. Report the diff and paste typecheck output. Wait for confirmation.**

### Stage 6: Refresh the cart when the session bridges

This stage exists to make Stage 7 safe. Do it first, in its own commit.

`POST /auth/clerk-sync` regenerates the Express session and merges the guest
cart into the customer's cart, server side. The client's `useClerkSync` effect
refreshes only `/auth/me` afterward. Nothing refreshes the cart. Today that
stays hidden because sign-in lands on `/account`, so the customer remounts the
cart or checkout page on the way back and it refetches. Stage 7 removes that
detour, at which point a stale cart could be displayed on checkout while the
order is priced from the real one server side.

In `artifacts/web/src/lib/useClerkSync.ts`:

- In the success path, where it already invalidates the current-user query, also
  invalidate the cart query. Use the generated `getGetCartQueryKey()` from
  `@workspace/api-client-react`, which is how `Cart.tsx`, `Checkout.tsx` and the
  navbar already key it.
- Change nothing else in that file: not the session-id guard, not the in-flight
  ref, not the 403 account-disabled path, not the 409 path, and not the ordering
  of the existing invalidation.
- Do not add cart logic anywhere else. Do not touch `mergeGuestCartIntoUserCart`
  or any other server code. The server behavior is already correct; this is
  purely the client failing to re-read it.

**STOP. Report the diff and paste typecheck output. Wait for confirmation.**

### Stage 7: Make `?redirect_url=` work on `/sign-in`

Today the param is appended by the wishlist modal, the cart page and the
checkout page, and ignored by all three. This stage fixes it once, in one
place.

In `CustomSignIn.tsx`:

- Read `redirect_url` from the query string. On successful sign-in, redirect
  there instead of `/account`.
- When the param is absent, behavior is exactly what it is today: `/account`.
- Accept only a same-origin relative path, meaning a value starting with a
  single `/`. Reject anything else, absolute URLs and protocol-relative `//`
  values included, and fall back to `/account`. This must not become an open
  redirect.
- Do not change the sign-in mechanics, the Google button, the error handling, or
  the comment about not racing ahead of clerk-sync.

Nothing else changes. The cart and checkout links start working as a side
effect, which is the intended outcome.

Note for reporting, not something to fix: a customer with incomplete onboarding
will still be sent to `/account` by `OnboardingGate` after this redirect fires.
That is existing behavior and is correct.

**STOP. Report the diff and paste typecheck output. Wait for confirmation.**

### Stage 8: Sign in without leaving the page

Goal: a guest signs in from inside the popup, the popup closes, their product
selections are still there, and the item they were trying to save is savable.

- Extract the sign-in form from `CustomSignIn.tsx` into a shared component that
  both the existing `/sign-in` page and the modal use. **The `/sign-in` page
  must keep behaving exactly as it does today**, including the Stage 7 redirect
  handling. It is a working authentication path, it is how customers sign in
  from the cart and checkout pages, and this is a refactor, not a rewrite.
- **The `if (isLoaded && isSignedIn) return <Redirect to="/account" />` guard at
  the end of `CustomSignIn.tsx` stays with the page, not with the shared form.**
  If it moves into the shared component, signing in from the modal throws the
  customer to `/account`, which is the exact opposite of the requirement.
  Likewise the page chrome: the logo, the card frame, the "Sign in to Oasis
  Garden and Patio" heading and the sign-up footer link.
- The shared form takes a flag controlling whether the "Continue with Google"
  button renders. It renders on the `/sign-in` page exactly as today. It is
  **hidden in the modal**, because that flow leaves the site and returns to the
  home page, losing the customer's finish and fabric selections.
- Do not build a parallel sign-in implementation. One form, two places.
- Do not add your own session bridging. The global `useClerkSync()` effect
  already handles it off Clerk's auth state, and the customer's own comment in
  `CustomSignIn.tsx` warns against racing ahead of it. Let it do its job.
- After sign-in completes and auth resolves, close the modal. Leave the customer
  on the product page with their selections intact. Do not auto-save the item
  and do not navigate.

**STOP. Report the diff and paste typecheck output. Wait for confirmation.**

### Stage 9: Create an account without leaving the page

**Only if Stage 1 concluded this is viable and Karen confirmed it.** If Stage 1
was inconclusive or negative, skip this stage entirely and leave Create Account
navigating as it does today. Do not attempt it on your own judgment.

If it proceeds, the same rules apply: `/sign-up` must keep working exactly as it
does today, no parallel implementation, and no custom session bridging.

**STOP. Report the diff and paste typecheck output. Wait for confirmation.**

---

## Do NOT touch

- `getDeviceToken`, `ensureDeviceToken`, `clearDeviceToken` and `wishlistKeyFor`
  in `wishlistHold.ts`. Stage 3 changes three things in that file and nothing
  else. Dead plumbing is fine for now.
- The server route `POST /wishlist/merge`.
- The admin and staff wishlist surfaces: the customers-page wishlist tab, the
  wishlist detail page, the print page, the reach-out email flow, the PDF, the
  outreach and status-history tables, or the admin dashboard's reach-out count.
- The wishlist database schema. No migrations.
- The OpenAPI spec, `lib/api-zod`, `lib/api-client-react`. No codegen.
- Any production data. See the appendix; **Karen runs that, not you.**
- Authentication behavior for anyone already signed in.
- The Google SSO flow itself, and the `/sso-callback` route.
- `OnboardingGate` and the account profile route behind it.
- Everything in `useClerkSync.ts` except the single added cart invalidation in
  Stage 6.
- The cart, checkout and payment code. Stage 6 adds one cart refresh inside the
  auth bridge and Stage 7 teaches `/sign-in` to honor a parameter those pages
  already send. No file under the cart, checkout or order routes changes, and no
  cart or checkout page component changes.
- `mergeGuestCartIntoUserCart` and everything else from the guest cart merge
  work, which is complete.

---

## Testing

Karen runs all UI verification. Do not run browser testing.

Before testing: the storefront deliberately treats admin and agent sessions as
signed out, so if you are logged in as staff in the same browser, every wishlist
control gives you the account popup. That is existing, correct behavior. Test
the signed-in cases as a customer account.

Signed out, wishlist:

1. On a product card, click the heart. The popup appears. Nothing navigates.
2. On a product detail page, choose a required finish and fabric, then click Add
   to Wishlist. The popup appears.
3. On a product detail page with nothing chosen, click Add to Wishlist. The
   existing "Selection required" toast appears, not the account popup.
4. Dismiss the popup with `Keep browsing`. The page is unchanged and every
   selection is still in place.
5. After Stage 3, in a browser that previously saved guest wishlist items: the
   header heart shows no count, product card hearts are unfilled, and
   `/wishlist` shows no saved items.
6. After Stage 4, visit `/wishlist`. Heading reads `Wishlist`, the device
   subtitle is gone, and the card holds the sign-in message with two working
   links.
7. The header heart still appears and leads to that same `/wishlist` message.

Cart and checkout, which must not regress:

8. After Stage 6: hold guest cart items, then sign in with an account that
   **already has** items in its cart. The header count, the cart page and the
   checkout page all show both sets immediately, with no manual refresh.
9. After Stage 6: the subtotal shown on checkout matches the subtotal on the
   order confirmation. Compare subtotal to subtotal. The confirmation total is a
   different number, since it adds tax and shipping.
10. After Stage 7: the Sign in link on the cart page and both links on the
    checkout page return you to `/checkout` rather than `/account`. An account
    that has not finished onboarding lands on `/account` instead, which is
    correct and expected.
11. After Stage 8: sign in from the cart or checkout page. The sign-in page
    looks and behaves exactly as before, Google included, and checkout still
    completes end to end.
12. Checkout works end to end as a guest, and as a signed-in customer, at the
    end of every stage from 6 onward.

Signed out, wishlist popup sign-in:

13. After Stage 7: from the popup, click Sign In, complete sign-in on the
    sign-in page, and land back on the product page you started from.
14. After Stage 8: sign in from inside the popup. The popup closes, the page did
    not reload, the selections survived, and the item can then be saved. The
    popup shows no Google button.

Signed in:

15. Every wishlist control behaves exactly as it did before. No popup.
16. Saving a product still works, including multiple configurations of the same
    product.
17. `/wishlist` and `/account/wishlist` both work, including the real empty
    state.
18. The item appears in the staff wishlist tab for that customer, and the
    reach-out email flow still works.
19. Sign in from `/sign-in` directly with no `redirect_url` in the address. You
    land on `/account`, unchanged. The Google button is present and works.
20. Create an account from `/sign-up` directly. Unchanged.

Item 18 is the whole business reason for this change. Items 8, 9 and 12 are the
ones that protect revenue.

---

## Appendix: clearing the old guest rows

**Karen runs this herself, after the code above has shipped and been verified.
The agent does not run it, does not schedule it, and does not write a script
for it.**

Order matters. The code ships first, so no new guest rows can be created and the
set stops moving. Then the cleanup runs.

These rows are guest-only. Rows belonging to a guest who already signed in had
their device token cleared when they were merged, so they are not affected.

Count first:

```sql
SELECT count(*) FROM wishlist_items
WHERE device_token IS NOT NULL AND user_id IS NULL;
```

Then delete:

```sql
DELETE FROM wishlist_items
WHERE device_token IS NOT NULL AND user_id IS NULL;
```

Run the count before and after. The second count should be zero, and the number
deleted should match the first count.
