# ADDENDUM 2: Guest Account Messaging

**Type:** Addendum. Do not edit the original brief or Addendum 1.
**Amends:** `guest_account_messaging_brief` and its Addendum 1, both complete.
**Scope:** Copy and placement only, two files. No logic changes, no backend,
no spec, no codegen, no migrations.

---

## Change 1: `artifacts/web/src/pages/Cart.tsx`

Change the guest banner's link text from `Sign in for faster checkout` to
`Sign in for existing accounts`.

This is the string the original brief deliberately told you to leave alone.
It is now in scope. Nothing else on the cart page changes: the banner's body
copy, the link target, and its styling all stay as they are.

---

## Change 2: `artifacts/web/src/pages/Checkout.tsx`

Two edits that together move the sign-in link into the guest banner.

### 2a. Remove the standalone sign-in link

In the Contact section header, remove the guest-only
`Sign in for existing accounts` link entirely. The Contact heading remains.

That link currently sits inside a header row laid out to space the heading and
the link apart. With the link gone, tidy that row so the heading sits normally.
Do not restructure the Contact section beyond that, and do not touch any of the
contact fields.

### 2b. Replace the guest banner body copy

Keep the banner exactly where it is, keep its amber styling, and keep the
label `YOU'RE CHECKING OUT AS A GUEST`.

Replace the body copy with this, verbatim:

`This order won't appear in an order history, and your confirmation email will
be your only record. Create an account now to have the order history saved.
Already have an account? Sign in.`

Two words in that copy are links, styled identically to each other:

- `Create an account now` keeps its existing target, the sign-up route with the
  redirect-back-to-checkout parameter it already uses.
- `Sign in` is new. Point it at the sign-in route with the same
  redirect-back-to-checkout parameter, which is exactly the target the link you
  removed in 2a was already using. Reuse that target, do not invent a new one.

The banner stays guest-only. A signed-in user must still see nothing here.

---

## Do NOT change

- The `OrderConfirmation.tsx` file. It is finished. Neither notice, neither
  disabled button, none of the auth gating.
- Any checkout logic: the HostedForm, the place-order payload, `guestContact`,
  the completeness gate, the double-submit latch, or the 500 and 503 handling.
- The banner's position, colors, label, or the warning glyph.
- Authentication logic. You are reading auth state, not changing it.
- The guest cart merge on sign-in. Still a known separate issue, still not
  yours to touch.

---

## Steps

**Step 1.** Both changes. Run typecheck and paste the output.
**STOP. Report the diff and wait for confirmation.**

Karen runs all UI verification. Do not run browser testing.

---

## Testing

Karen will check, signed out:

1. Cart page link reads `Sign in for existing accounts`.
2. Checkout Contact section has no sign-in link beside the heading, and the
   heading is not left misaligned by its removal.
3. The checkout banner reads the new copy, with both `Create an account now`
   and `Sign in` as working links that land on the right pages and return to
   checkout.

Signed in:

4. No banner on checkout, no sign-in link in the Contact section.
5. Confirmation page and order-not-found page both still behave exactly as they
   did before this addendum.
