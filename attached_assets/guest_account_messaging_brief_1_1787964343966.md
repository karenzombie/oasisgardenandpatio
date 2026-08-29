# BRIEF: Guest Account Messaging

**Type:** New brief. Not an addendum. This is separate work that follows the
completed guest checkout addendum.
**Prerequisite:** The guest checkout addendum is complete, tested and closed.
**Scope:** Display only. Two frontend files. No backend, no OpenAPI spec change,
no codegen, no migrations.

---

## Goal

Guest checkout now works, but three places still point a guest at an account
they do not have. Fix the messaging so a guest is told the truth before they
pay and after they order, and so account controls are visibly unavailable to
them rather than broken.

Nothing about this changes for signed-in users. That is the primary
correctness requirement of this brief.

---

## The single biggest risk in this work

`OrderConfirmation.tsx` currently has **no auth awareness at all**. It does not
import or call `useAuth`. You will be adding that.

The moment you do, there is a window where auth state has not resolved yet. If
guest-only UI renders during that window, a signed-in customer will see
"this order isn't linked to an account" flash on their own confirmation page
before it corrects itself. That is alarming, wrong, and the exact failure this
brief must avoid.

**Requirement: no guest-only element may render until auth state is resolved.**
While auth is still loading, render neither the guest version nor the
signed-in version of the affected elements. `Checkout.tsx` already establishes
this pattern by holding a spinner until its auth loading flag clears. Follow
the same discipline.

---

## Reference mockup

Karen has approved a visual mockup showing all three screens, guest on the left
and signed-in on the right. Match it. The notice treatment is:

- Warm amber, not red. Red was considered and rejected: these are not errors.
- Solid left border accent bar, roughly 4px.
- Small uppercase letter-spaced label line, then body text.
- A warning glyph at the left.
- Must read as visually distinct from ordinary body copy. Do not style it the
  same as the existing muted hint text, or it disappears into the page.

Reference values from the approved mockup, for the notice only:
background `#FDF6EC`, left bar `#C8843C`, text `#7A4E15`.
Everything else uses existing theme tokens. Do not introduce new global colors.

---

## File 1: `artifacts/web/src/pages/Checkout.tsx`

### 1. Guest banner

Add a guest-only notice at the top of the checkout page, above the Contact
section, below the "Checkout" heading. Not rendered for signed-in users.

Label: `YOU'RE CHECKING OUT AS A GUEST`

Body: `This order won't appear in an order history, and your confirmation email
will be your only record of it. Create an account now and this order is saved
to it.`

`Create an account now` is a link to the sign-up route. Build the link the same
way the existing "Sign in for faster checkout" link in this file builds its
sign-in link, including the same redirect-back-to-checkout parameter pattern.
Do not invent a different URL shape.

**If that link does not return the customer to checkout signed in with their
cart intact, stop and report it. Do not attempt to fix it.** The banner copy
promises the order will be saved to the new account, which is only true if the
customer comes back to checkout signed in. Whether that flow behaves is a
separate matter from this brief, and Karen decides what happens next.

### 2. Copy change

Change `Sign in for faster checkout` to `Sign in for existing accounts` **in
this file only**.

The same string also exists on the cart page. **Leave the cart page alone.**
Karen has not decided on that one yet. Do not "fix" it for consistency.

---

## File 2: `artifacts/web/src/pages/OrderConfirmation.tsx`

Add `useAuth` to this file. Observe the loading rule above.

### 3. Success view, guest only

- Disable the `View My Orders` button. Disabled, not removed. It must be
  visibly inert: greyed, not clickable, no navigation.

  **Read this before you implement it.** Both account buttons on this page are
  rendered as a button component in `asChild` mode wrapping a router link, so
  the element that actually renders is the link. Putting a disabled attribute
  on it will grey it and it will still navigate when clicked. You must change
  what is rendered for guests, not merely add a prop to what is there. Verify
  by clicking it, not by looking at it.

- `Continue Shopping` stays as it is.
- Add the amber notice directly above the buttons, so the disabled button has a
  stated reason next to it.

Label: `KEEP YOUR CONFIRMATION EMAIL`

Body: `This order was placed as a guest, so it isn't linked to an account and
can't be viewed online. Your confirmation email is your receipt. Create an
account to track future orders.`

`Create an account` links to the sign-up route.

**Do not attempt to name the customer's email address in this copy.** The order
endpoint does not return it. Adding it would require a spec change and codegen,
which is out of scope for this brief. The copy above is written to not need it.

### 4. Success view, signed in

Unchanged. `View My Orders` stays enabled. No notice.

Preserve the existing button styling exactly for the signed-in path. The two
buttons on this view do not share a variant: the account button is the outline
variant and `Continue Shopping` is the default. Do not normalize them while
working nearby.

### 5. Error view ("Order not found"), guest only

- Change the body text from `We couldn't find that order. If you just placed
  it, please check your account.` to `We couldn't find that order in this
  browser session.`
- Disable the `My Orders` button, same treatment as above.
- Add `Continue Shopping` as the enabled action beside it.
- Add the amber notice between the body text and the buttons.

Label: `PLACED AN ORDER AS A GUEST?`

Body: `Guest orders are only viewable in the browser they were placed in.
Please check your email for your confirmation, or contact us at
(661) 255-9909 or sales@oasisgardenandpatio.com and we'll look it up for you.`

The phone number and email address above are exact. Do not alter, reformat, or
substitute them.

### 6. Error view, signed in

Unchanged, including the existing copy and the enabled `My Orders` button.

---

## Do NOT touch

- Anything in the checkout payment path: the HostedForm, `handleHostedFormSubmit`,
  the place-order payload, `guestContact`, the completeness gate, the
  `orderSubmittedRef` double-submit latch, or the `criticalError` behavior for
  500 and 503.
- Any authentication logic. You are reading auth state, not changing it.
- The backend, the OpenAPI spec, `lib/api-zod`, `lib/api-client-react`, or the
  database. No codegen. No migrations.
- The cart page.
- The guest cart merge on sign-in. There is a known separate issue where a
  guest cart does not appear after signing in. It is being handled separately.
  **Do not investigate it, do not touch `mergeGuestCartIntoUserCart`, and do
  not "helpfully" fix it as part of this work.**

---

## Steps

**Step 1.** Checkout.tsx: items 1 and 2.
**STOP. Report the diff. Wait for confirmation.**

**Step 2.** OrderConfirmation.tsx: add `useAuth`, implement the loading rule,
then items 3 through 6.
**STOP. Report the diff, state explicitly how you prevented guest-only UI from
rendering before auth resolves, and wait for confirmation.**

**Step 3.** Run typecheck and paste the output. Note: this repo has no lint
script and no configured lint tool. Do not substitute one.
**STOP.**

---

## Testing

Karen runs all UI verification. You do not. Report when the code is in and
typechecks clean, then stop.

What Karen will check:

**Signed out, private window:**

1. Checkout page shows the amber guest banner above Contact.
2. The sign-in link on checkout reads "Sign in for existing accounts."
3. "Create an account now" in the banner reaches sign-up and returns to
   checkout afterward with the cart intact.
4. Place an order. The confirmation page shows the amber notice and a visibly
   disabled "View My Orders." Clicking it does nothing.
5. Visit an order-confirmation URL for an order not in this session. The error
   view shows the rewritten copy, the amber notice with the correct phone and
   email, and a disabled "My Orders."

**Signed in:**

6. No banner on checkout. The cart-page sign-in copy is untouched.
7. Confirmation page has no notice and "View My Orders" works.
8. Error view is unchanged and "My Orders" works.
9. **Reload the confirmation page several times and watch it load.** No flash
   of guest-only text at any point. This is the regression that matters most.
