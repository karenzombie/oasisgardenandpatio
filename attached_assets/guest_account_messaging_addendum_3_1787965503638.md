# ADDENDUM 3: Cart Banner Layout

**Type:** Addendum. Do not edit the original brief or Addenda 1 and 2.
**Amends:** `guest_account_messaging_brief` and its Addenda 1 and 2, all
complete.
**Scope:** One file, one banner. Copy and layout. No logic, no backend, no
spec, no codegen, no migrations.

---

## Problem

On the cart page the guest banner is laid out to push its text to the far left
and its sign-in link to the far right. On a wide screen that puts the question
"Have an account?" and the link that answers it at opposite ends of the banner,
so they no longer read as related.

---

## Change: `artifacts/web/src/pages/Cart.tsx`

The guest banner becomes a single sentence with the sign-in link inline, in the
same style as the guest banner already built on the checkout page.

### Final rendered text

`Checking out as a guest is fine, no account required. Have an account? Sign in.`

`Sign in` is the link. The period belongs after the link, outside it.

### What changes

1. **The em dash becomes a comma.** `guest is fine — no account required`
   becomes `guest is fine, no account required`.
2. **The link moves inside the paragraph**, immediately after
   `Have an account?`, as ordinary inline text rather than a separate element
   sitting at the far end of the banner.
3. **The link label becomes `Sign in`.** Drop `Sign in for existing accounts`
   and drop the trailing arrow character. Inline after the question, the longer
   label reads as a redundant repeat.
4. **Remove the layout that was spacing the two apart.** The banner's container
   currently uses a flex row with space-between justification and a gap to push
   the paragraph and the link to opposite ends. With one paragraph there is
   nothing left to space apart, so that layout goes. Keep the banner's border,
   background, padding, text size and column span exactly as they are. Only the
   internal row layout changes.

### Spacing, read this carefully

This is the part Karen will be looking at.

- There must be exactly one space between `Have an account?` and `Sign in`, and
  no space between `Sign in` and the period that follows it.
- In JSX, whitespace at the end of a line before an element is not preserved.
  The checkout page's guest banner already solves this correctly by using
  explicit space expressions around its inline links. Copy that approach here.
  Do not rely on line breaks in the source to produce spaces.
- No double spaces anywhere in the sentence.

### Link target and styling

- The target does not change. It stays the sign-in route with the same
  redirect-back-to-checkout parameter it already uses.
- Style it as an inline text link consistent with the inline links in the
  checkout banner: underlined, medium weight. It must inherit this banner's own
  text color. **Do not bring the checkout banner's amber colors onto the cart
  page.** The cart banner keeps its existing muted styling.
- Keep the existing emphasis on `Have an account?` as it is today.

### Guest-only

The banner remains guest-only. Nothing about that condition changes, and a
signed-in user still sees nothing here.

---

## Do NOT change

- `Checkout.tsx` and `OrderConfirmation.tsx`. Both are finished.
- Anything else on the cart page: the line items, quantity controls, remove
  action, order summary, the Proceed to Checkout button, or the Continue
  Shopping link.
- Any checkout, payment or authentication logic.
- The guest cart merge on sign-in. Still a known separate issue, still not
  yours to touch.

---

## Steps

**Step 1.** The change. Run typecheck and paste the output.
**STOP. Report the diff and wait for confirmation.**

Karen runs all UI verification. Do not run browser testing.

---

## Testing

Karen will check, signed out:

1. The cart banner reads as one sentence, with `Sign in` sitting immediately
   after `Have an account?` rather than across the banner from it.
2. Spacing is correct: one space before the link, no gap before the period, no
   double spaces.
3. The link works and returns to checkout.
4. The banner is not amber. It keeps its existing muted look.

Signed in:

5. No banner on the cart page.
