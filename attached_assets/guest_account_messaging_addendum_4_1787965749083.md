# ADDENDUM 4: Cart Banner Amber Treatment

**Type:** Addendum. Do not edit the original brief or Addenda 1, 2 and 3.
**Amends:** `guest_account_messaging_brief` and its Addenda 1, 2 and 3, all
complete.
**Scope:** One file, one banner, styling only. No copy changes, no layout
changes, no logic, no backend.

**Reversal notice:** Addendum 3 told you to keep the cart banner in its muted
styling and specifically not to bring the checkout banner's amber onto the cart
page. That instruction is withdrawn. The cart banner is now amber.

---

## Change: `artifacts/web/src/pages/Cart.tsx`

Give the guest banner the same amber treatment as the guest banner on the
checkout page.

### Colors

Match the checkout banner exactly:

- Background `#FDF6EC`
- Left border accent bar, 4px, `#C8843C`
- Text `#7A4E15`

Replace the banner's current muted background and full surrounding border with
this treatment. The checkout banner carries a left accent bar and no full
border, so the cart banner should match that. Do not introduce new global
colors; these are the same values already used on the checkout page.

### Text inside the banner

- The sentence text takes the amber text color, replacing the muted grey.
- `Have an account?` keeps its existing emphasis, but that emphasis now comes
  from weight rather than from a separate darker color. It must sit in the same
  amber family as the rest of the sentence.
- The `Sign in` link keeps its underline and medium weight, and inherits the
  amber text color. It must not stay grey.

### What is NOT changing

**Do not add a warning glyph and do not add an uppercase label line.** The
checkout banner has both. This one gets the amber colors only, and stays as the
single plain sentence it is now. If that is not what Karen meant, she will say
so; do not add them on your own judgment.

Also unchanged:

- The sentence itself, word for word, including the inline link and its
  spacing. Addendum 3's spacing work stays exactly as it is.
- The link target.
- The banner's position, column span, padding and text size.
- The guest-only condition. A signed-in user still sees nothing here.

---

## Do NOT change

- `Checkout.tsx` and `OrderConfirmation.tsx`. Both are finished. In particular
  do not "harmonize" the checkout banner to match the cart banner. Traffic
  flows one way here: the cart page copies the checkout page's colors, and the
  checkout page is not touched.
- Anything else on the cart page.
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

1. The cart banner is amber, with a left accent bar, and matches the checkout
   banner's colors.
2. The sentence is unchanged and still spaced correctly.
3. `Sign in` is amber, underlined, and no longer grey against the banner.
4. There is no warning glyph and no uppercase label on the cart banner.
5. The link still works and returns to checkout.

Signed in:

6. No banner on the cart page.
