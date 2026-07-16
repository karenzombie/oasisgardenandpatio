# Fix Brief: Stop the duplicate checkout submit + two product-page tweaks

## Part 1: Duplicate place-order call (the 402 "Invalid OTS Token" toast)

### What is happening
A single card submission is calling the place-order mutation twice. The first
call charges the card and creates the order (this succeeds, and the transaction
shows in Authorize.net as a Captured Charge). The second call reuses the same
one-time Accept.js token a moment later, which Authorize.net correctly rejects
with HTTP 402 "Invalid OTS Token." So the customer sees a confirmation page AND a
"Checkout failed" error at the same time.

Root cause: `react-acceptjs` HostedForm's `onSubmit` (wired to
`handleHostedFormSubmit` at ~line 275) can fire more than once for one card
submission, and the handler has no guard, so it calls `placeOrderM.mutate` each
time. The existing `disabled`/`isPending` check does not catch it because both
fires happen before `isPending` flips.

Important: the token is one-time-use, so this can never double-charge a customer.
This is a UX correctness bug (a false error toast), not a money bug.

### The fix: a one-shot latch in the submit handler
1. Add a ref (for example `orderSubmittedRef = useRef(false)`) that gates the
   handler.
2. At the very top of `handleHostedFormSubmit`, after confirming the response is
   a success with `opaqueData`: if `orderSubmittedRef.current` is already true,
   return immediately (ignore the duplicate). Otherwise set it to true, then
   proceed to call the mutation. Setting the latch must happen synchronously,
   before `placeOrderM.mutate`, so the second fire is blocked even though it
   arrives before `isPending` updates.
3. Reset the latch to false in the mutation's `onError` handler, so that after a
   genuine decline or failure the customer can retry with a new card. On success
   the page navigates away, so no reset is needed there.
4. Keep the existing error handling and the existing `disabled` guard as-is; this
   latch is in addition to them.

Do not change the backend, the token shape, or anything else in the payment flow.

## Part 2: Product-page tweaks (pages with ADD TO CART)

1. Under the ADD TO CART button, add a link labeled "Go to cart" that navigates to
   the cart page. It should appear on product pages that have the ADD TO CART
   option. Match the existing link styling on the page.
2. Remove the line "Visit our showroom or contact us for white-glove delivery
   options." from the product pages. It was not requested and should not appear
   there. Remove only that line; leave the rest of the product page intact.

## Verify and report
- Paste the full web typecheck output.
- Confirm the one-shot latch is set synchronously before the mutation call and
  reset in `onError`.
- Confirm the "Go to cart" link appears under ADD TO CART and the white-glove
  line is gone from the product pages.

**STOP. Report and paste output. Wait for confirmation before I re-test.**
