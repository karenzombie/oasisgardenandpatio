# Oasis Garden and Patio - Coupon Code at Checkout

For: Replit Agent | From: Karen / Claude | Date: July 17, 2026

IMPORTANT: Do not make assumptions during this build. If anything is unclear, stop and ask
Karen before proceeding. This touches checkout pricing and the payment charge amount. A wrong
assumption here means a customer gets charged the wrong amount.

Dev only. Do not touch prod. Karen runs the prod sync herself once this is verified in dev.

## What already exists (confirmed by reading the code, do not rediscover this)

- `coupon_codes` and `coupon_code_uses` tables already exist (`lib/db/src/schema/discounts.ts`).
  Admin can fully create, edit, and delete coupon codes today (`artifacts/api-server/src/routes/adminDiscounts.ts`,
  `artifacts/web/src/staff/pages/admin/Discounts.tsx`). Phase 1 does not touch either file. Phase
  2 adds scoping controls to the UI file `Discounts.tsx` only; the admin route
  `adminDiscounts.ts` already accepts and persists `appliesTo`/`targetIds` (verified), so it
  needs no change in any phase. Do not modify `adminDiscounts.ts`.
- Nothing on the customer side reads these tables. `artifacts/api-server/src/routes/checkout.ts`
  and `artifacts/api-server/src/lib/checkoutPricing.ts` have zero references to coupons or
  discounts. That is the entire bug: staff can create a code, nothing can ever apply it.
- The `orders` table (`lib/db/src/schema/orders.ts`) has no discount column of any kind. This
  needs a migration, it is not optional.
- There is already a per-line `discount_amount` column on `order_items` (not `orders`). That is
  a separate, unrelated feature for manual staff discounts on individual lines. Do not confuse
  it with the new order-level coupon discount and do not touch it.
- The admin coupon form has no field for scoping a code to a category, manufacturer, or product,
  even though the schema has `appliesTo` / `targetIds` columns for it. Every coupon that can
  currently be created is effectively global. Phase 2 below builds this.
- `discount_events` (automatic, code-free promotions) are also not wired into checkout anywhere.
  The "Stackable" toggle on a coupon exists to describe interaction with discount_events, but
  since discount_events are never applied at checkout today, that toggle currently has no effect
  on anything. Phase 3 below builds this, it is the highest-risk part of this brief so it is
  built and verified last, not skipped.
- Pricing pattern already in place, follow it exactly: `POST /checkout/quote` recomputes
  subtotal/shipping/tax reactively as the customer fills in the form and is informational only.
  `POST /checkout` independently recomputes everything server-side inside its preflight
  transaction right before charging the card, and never trusts a number the client sent. The
  coupon discount must be computed server-side in both places, the same way tax and shipping
  already are. Never accept a discount amount from the client.

## Decision already made

Tax is calculated on the POST-discount subtotal. The customer is taxed on what they actually
pay, not on the pre-discount price.

## Full scope: this is a three-phase build, all of it happens today

The coupon code process is not done until all three phases below are working and verified.
Build in this order because each phase is a strictly safer, more isolated change than the one
after it:

- **Phase 1: global coupon codes at checkout.** Opt-in (nothing changes unless a customer types
  a code), fully spec'd below, lowest risk.
- **Phase 2: `appliesTo` scoping for coupon codes** (category / manufacturer / product, not just
  global). Still opt-in, still only affects orders where a code was entered, moderate risk.
- **Phase 3: wire `discount_events` (automatic, no-code sales) into checkout**, so the coupon's
  "Stackable" toggle has real meaning. This is the highest-risk phase: it changes pricing
  automatically for every cart, not just ones with a code, whether or not anyone ever touches
  the coupon field. Build and verify Phases 1 and 2 completely first.

Do not skip Phase 2 or 3 or treat them as separate future work. Sequencing them last is a risk
decision, not a scope cut.

---

# PHASE 1: Global coupon codes at checkout

## A. Database migration

Add two columns to `ordersTable` in `lib/db/src/schema/orders.ts`:

- `coupon_code_id`: integer, nullable, references `coupon_codes.id`, `onDelete: "set null"`
- `coupon_discount_amount`: numeric(10,2), not null, default `"0"`

The column is named `coupon_discount_amount` (not just `discount_amount`) deliberately: Phase 3
adds a second, separate `automatic_discount_amount` column, and an ambiguous `discount_amount`
would collide with the unrelated per-line `order_items.discount_amount` that already exists.
Name it correctly now so Phase 3 does not have to rename anything.

`subtotal` keeps its current meaning exactly: the raw merchandise subtotal BEFORE any discount.
Do not change what it represents, other parts of the system (vendor POs, reports) already
assume that meaning. When the order is inserted, `subtotal` still gets the raw pre-discount
figure; the discount lives only in `coupon_discount_amount`; and `total`, `balanceDue`,
`depositAmount`, and the `payments.amount` row all get the DISCOUNTED total. The formula is:

`total = subtotal - coupon_discount_amount + delivery_amount + tax_amount`

where `tax_amount` was itself computed on the post-discount subtotal. Do not let the discounted
figure leak into the `subtotal` column, and do not leave `total`/`balanceDue`/`depositAmount`/
`payments.amount` at the pre-discount value. All four must reflect what the card was actually
charged.

Push with `pnpm --filter ./lib/db run push` (this targets dev, `DATABASE_URL`, by default -
confirm the terminal shows heliumdb, not neondb, before running). Do NOT use `push-force`
unless a prompt requires it and you have shown Karen what it wants to do first.

**Checkpoint: stop here and show Karen the migration output before continuing.**

## B. API spec changes (`lib/api-spec/openapi.yaml`)

Line numbers below are approximate and will drift as you edit; find each schema by its name
under `components/schemas`, not by line number.

1. `CheckoutQuoteRequest`: add an optional property
   `couponCode: { type: ["string", "null"] }`. Do not add it to `required`.
2. `CheckoutQuoteResponse`: add three properties, all in `required`:
   - `discount: { type: string }` - dollar amount discounted, `"0.00"` when no valid code is
     applied
   - `couponCode: { type: ["string", "null"] }` - the normalized code, echoed back only when it
     is currently valid
   - `couponError: { type: ["string", "null"] }` - a customer-facing message when a submitted
     code failed validation, null otherwise
3. `PlaceOrderRequest`: add an optional property
   `couponCode: { type: ["string", "null"] }`.

Run the codegen check and paste the actual output, not a summary:

```
pnpm --filter ./lib/api-spec run codegen && git status --short
```

Only generated files under `lib/api-client-react` and `lib/api-zod` should show as changed. If
anything else shows up, stop and ask before continuing.

**Checkpoint: stop here and show Karen the codegen output before continuing.**

## C. Backend logic

### C1. Shared coupon validation function

Add a new function, suggested location `artifacts/api-server/src/lib/couponPricing.ts`, that
takes a raw code string, the cart's `subtotalCents`, and the customer's email (may be null if
not yet known), and returns either a valid result with the coupon row and the computed
`discountCents`, or an error message meant to be shown to the customer.

Checks, in order, matching the same validation the admin side already enforces on write:

1. Normalize the code the same way the admin route does: `.trim().toUpperCase()`.
2. Look up `coupon_codes` by code. Not found: "Coupon code not found."
3. In Phase 1 only: if `appliesTo !== "global"`, treat as inapplicable ("this code can't be
   applied to your order online") and log a warning. Nothing in the admin UI can create a
   scoped coupon yet at this point in the build, so this branch should never actually fire
   during Phase 1 testing. Phase 2 (section G below) replaces this step with real scoping logic.
   Do not build Phase 2's matching logic here; keep Phase 1 and Phase 2 as separate, separately
   verified changes to this function.
4. `isActive` false: "This coupon is no longer active."
5. `startDate` in the future: "This coupon isn't active yet."
6. `expirationDate` in the past: "This coupon has expired."
7. `minOrderAmount` set and `subtotalCents` below it: message stating the shortfall, e.g. "Add
   $12.50 more to use this code."
8. `maxUsesTotal` set and `currentUses >= maxUsesTotal`: "This coupon has reached its usage
   limit."
9. `singleUsePerCustomer` true and an email was provided: look up `coupon_code_uses` joined to
   `orders` joined to `customers`, where `customers.email` matches case-insensitively and
   `coupon_code_id` matches this coupon. If a prior use exists: "This coupon can only be used
   once per customer." Match on email, not `customer_id` - guest checkout creates a brand new
   `customers` row on every order (see `createGuestCustomer` in `checkout.ts`), so `customer_id`
   will never match across two guest orders from the same person even though the email does. If
   no email was provided yet, skip this specific check (this is intentional, not a bug - see C2).
10. Compute `discountCents`: percentage type is `round(subtotalCents * value / 100)`, fixed type
    is `min(round(value * 100), subtotalCents)` - a fixed-dollar coupon must never make the
    order total negative.

### C2. Wire into `POST /checkout/quote`

Read `couponCode` from the request body. If present, call the validator with the email currently
known on the form (there may not be one yet for a guest who hasn't reached the contact fields -
that's fine, the single-use check is best-effort here and authoritative at order placement, per
C3). Subtract `discountCents` from `subtotalCents` before computing tax (tax is post-discount,
per the decision above). Return `discount`, `couponCode` (only when valid), and `couponError`
(only when a code was submitted and failed) in the response.

### C3. Wire into `POST /checkout` (place order)

Read `couponCode` from the request body. Inside the existing preflight transaction, after
`subtotalCents` is computed from the actual cart lines, re-run the same validator using the
customer's real email (guest contact email or the authenticated user's email - this is always
known by this point, unlike at quote time). This is the authoritative check. If it fails here
(including a single-use violation that couldn't be checked earlier, or the usage limit being hit
by a race with another order), reject the order with the validator's message and do NOT call
`processAuthnetCharge`. The existing pattern in this file already re-locks the cart with
`.for("update")` for exactly this kind of race condition - lock the matched `coupon_codes` row
the same way before the final `currentUses` check, inside the same transaction.

If valid, use the discounted total (post-discount subtotal + shipping + post-discount tax) as
`amountCents` sent to `processAuthnetCharge`, exactly as `totalCents` is used today.

On successful order creation (same transaction that inserts the `orders` row):

- Set `coupon_discount_amount` and `coupon_code_id` on the order insert. Keep `subtotal` at the
  raw pre-discount value and set `total` (and the later `balanceDue`/`depositAmount` update and
  the `payments.amount` row) to the discounted total, per the invariant in section A.
- Insert one row into `coupon_code_uses`: `couponCodeId`, `userId` (session user id or null),
  `orderId`, `discountApplied` (the dollar amount discounted).
- Increment `coupon_codes.current_uses` by 1.

If no coupon code was submitted, none of this fires and behavior is unchanged from today.

**Checkpoint: stop here.** Verify with a real coupon in dev (WELCOME10 already exists) before
touching the frontend: call `/checkout/quote` with and without a coupon code and confirm the
discount, tax, and total move correctly; confirm an expired or over-limit code returns the right
error and no discount.

## D. Frontend (`artifacts/web/src/pages/Checkout.tsx`)

Add a coupon code text input with an Apply button in the Order Summary panel, directly below the
line-items list and above the Subtotal row. Keep two pieces of state: the raw text the customer
is typing, and the code that was actually applied (only set when Apply is clicked). Send the
applied code (not the raw typing state) to `/checkout/quote`.

Wiring the applied code into the quote takes TWO edits in this file, not one, and missing the
second causes a stale-quote bug. The quote effect has a dependency array that triggers a refetch
(currently keyed on shipping state, zip, and cart subtotal) AND a separate freshness check
(`confirmedQuote.key`, currently compared on state/zip/subtotal) that decides whether the last
quote still matches the current inputs. Add the applied coupon code to BOTH: the effect's
dependency array so applying or removing a code refetches, and the `confirmedQuote.key` object
plus its `quoteFresh` comparison so a quote taken under a different coupon is correctly treated
as stale. If you add it to only the trigger, the old (pre-coupon) quote will pass the freshness
check and display the wrong total.

When the quote comes back:
- If `couponError` is present, show it inline under the input in an error color. Do not show a
  Discount row.
- If `discount` is present and non-zero, show a "Discount" row between Subtotal and Shipping
  (negative amount, e.g. "-$29.30") and replace the Apply button with a "Remove" action that
  clears the applied code and re-quotes without it.

On order submission, include the currently applied coupon code (or null) in the `POST /checkout`
body so the server can do its authoritative check and redemption.

**Checkpoint: stop here for a full walkthrough before calling this done.**

## Phase 1 scope note

Phase 1 alone still only builds `appliesTo = "global"` handling. That is not a scope cut, it is
just Phase 1. Phases 2 and 3 below cover the rest. Do not stop after Phase 1 and call the task
done.

**Checkpoint: stop here for a full Phase 1 walkthrough before starting Phase 2.**

1. Walk through the actual checkout UI in dev: apply a valid code, watch the discount and tax
   update, place a real order (Authorize.net sandbox), and confirm the sandbox charge amount
   matches the discounted total shown on screen.
2. Run a read-only script confirming the resulting `orders` row has the correct
   `coupon_discount_amount` and `coupon_code_id`, that exactly one `coupon_code_uses` row was
   created, and that the coupon's `current_uses` incremented by exactly 1.
3. Try an expired code and a code below its minimum order amount and confirm both are rejected
   with no discount applied and no charge attempted.

---

# PHASE 2: appliesTo scoping (category / manufacturer / product coupons)

Right now every coupon is global only because nothing, not the admin UI, not checkout, ever
reads or writes `appliesTo` / `targetIds` as anything else. This phase makes those two columns
real.

## E. Reuse the existing scoping pattern, do not invent a new one

`artifacts/web/src/staff/pages/admin/Shipping.tsx` already has this exact shape of problem
solved for shipping rules: a scope selector (`site_wide` / `category` / `manufacturer` /
`product`), a category `Select`, a manufacturer `Select`, and a `ProductPicker` component
(search-and-add, local to that file) for product-level targeting. Reuse this pattern in the
coupon dialog in `Discounts.tsx`. Two differences from the shipping-rule version to build
correctly, not copy blindly:

- Coupon `appliesTo` uses the value `"global"` for "everything," shipping rules use
  `"site_wide"`. Use the coupon's own naming, do not rename the coupon enum to match shipping.
- Coupon `targetIds` is a JSONB array (`number[]`) by schema design, meaning it is meant to hold
  more than one id. Shipping rule category/manufacturer scope is single-select (one category,
  one manufacturer). For coupons, make the category and manufacturer selects multi-select so
  the array column can actually hold more than one value. Product scope can reuse `ProductPicker`
  as-is, it is already multi-select.

Do this for both the coupon code dialog AND the discount event dialog in the same file, since
Phase 3 needs discount_events to have real scoping too and this is the same UI work either way.
This is UI-only: `adminDiscounts.ts` already accepts and persists `appliesTo`/`targetIds` for
both coupons and events, so do not change the route, only `Discounts.tsx`.

**Checkpoint: stop here and show Karen the admin UI for creating a category-scoped and a
product-scoped coupon before touching checkout logic.**

## F. Extend the matching to cart lines

Add a shared matching function (same file as the Phase 1 validator,
`artifacts/api-server/src/lib/couponPricing.ts`) that takes a coupon-or-event row and a list of
cart lines (each with `productId`, `categoryId`, `manufacturerId`) and returns which lines
qualify:

- `appliesTo = "global"`: every line qualifies.
- `appliesTo = "category"`: a line qualifies if its `categoryId` is in `targetIds`.
- `appliesTo = "manufacturer"`: a line qualifies if its `manufacturerId` is in `targetIds`.
- `appliesTo = "product"`: a line qualifies if its `productId` is in `targetIds`.

This is a real modeling decision with no existing precedent to check it against (nothing has
ever read `targetIds` before now), written down here for Karen to confirm or correct on review,
not silently assumed.

## G. Update the Phase 1 validator to use real scoping

Replace the Phase 1 placeholder (step 3 in section C1) with:

- Run the matching function against the current cart lines.
- If zero lines qualify: "This code doesn't apply to anything in your cart," no discount.
- `minOrderAmount` continues to check against the FULL cart subtotal (not just qualifying
  lines), matching the plain reading of "minimum order amount."
- The discount itself (percentage or fixed) is computed only against the qualifying lines'
  subtotal, not the full cart subtotal. A fixed-dollar discount caps at the qualifying
  subtotal, not the full cart subtotal, same reasoning as the Phase 1 cap.

Update both `/checkout/quote` and the `/checkout` preflight to pass cart lines with
`categoryId`/`manufacturerId` into the validator (the preflight already selects these fields
for shipping calculation, reuse that same query result rather than adding a second query).

**Checkpoint: stop here.** Test a category-scoped and a product-scoped coupon end to end
(cart with qualifying and non-qualifying items mixed) before moving to Phase 3.

---

# PHASE 3: wire discount_events into checkout, make "Stackable" real

Today `discount_events` are not read anywhere in checkout. This phase makes automatic,
no-code sales actually apply, and makes a coupon's "Stackable" toggle mean something. This is
the riskiest phase because it changes pricing on every order, not just ones with a code typed
in, so build and verify Phases 1 and 2 completely first, and give this phase its own careful
walkthrough.

## H. Pricing decision (locked, no open questions)

How discounts combine is decided. Do not treat any of this as needing confirmation.

**Multiple active discount_events do not stack.** At most ONE automatic event applies to an
order: the one that produces the largest total dollar discount for this specific cart. "Largest"
means the largest resulting DOLLAR amount computed against the cart, not the largest `value`
field. A percentage event and a fixed event cannot be compared by their raw values (10 vs 5 is
meaningless); compute each event's actual dollar discount on its qualifying lines first, then
pick the biggest. Do not build per-line event stacking.

**A coupon and the winning automatic event combine as follows:**
- If BOTH the coupon's `isStackable` AND that event's `isStackable` are true: they stack. Apply
  the automatic event first, then the coupon on the remaining amount.
- Otherwise (either one not stackable): best-wins. The customer gets whichever single discount,
  the coupon or the event, saves them more. The larger one applies; the smaller is suppressed.
  This is true best-wins: an entered code does NOT automatically beat a larger sale.

Each event's own dollar discount is computed the same way a coupon's is (section G): percentage
is that percent of its qualifying-line subtotal; fixed is `min(value, qualifying-line subtotal)`.

**Customer-facing note.** In the Order Summary panel near the coupon input, show this static
text: "Coupons can't be combined. The highest savings will be applied to your order." It is a
plain informational line, always visible, not conditional on any state.

## I. Backend

Look up currently-active `discount_events`: `isActive` true, and the current time inside
`startDate`/`endDate` when those are set. Run each through the Phase 2 matching function against
the cart lines (discount_events use the same `appliesTo`/`targetIds` shape as coupons). Discard
any event with zero qualifying lines. Of the rest, pick the single largest-dollar event, then
combine with any applied coupon per section H (stack if both stackable, otherwise best-wins).
Wire into both `/checkout/quote` (so the customer sees the automatic discount before doing
anything) and the `/checkout` preflight (authoritative, same pattern as Phase 1).

Order of operations for tax: subtract BOTH the automatic discount and the coupon discount from
the subtotal, then compute tax on that post-both-discounts figure. The full formula becomes:

`total = subtotal - automatic_discount_amount - coupon_discount_amount + delivery_amount + tax_amount`

`CheckoutQuoteResponse` needs an additional field, `automaticDiscount: string`, separate from
the coupon `discount` field, so the frontend can show "sale" and "code" as distinct line items.
No new field is needed on `PlaceOrderRequest`: an automatic discount takes no customer input, it
is computed and applied server-side the same way tax and shipping already are.

On the `orders` table, add one more column here (Phase 1 already added `coupon_discount_amount`,
so nothing gets renamed): `automatic_discount_amount`, numeric(10,2), not null, default `"0"`.
Set it on the order insert alongside the coupon fields.

`coupon_code_uses.discountApplied` stays the COUPON portion only, never the automatic portion.
The automatic event does not get a `coupon_code_uses` row (it is not a coupon and has no usage
table). If reporting on automatic-event redemptions is wanted later, that is a separate future
item, flag it to Karen rather than inventing a table here.

## J. Frontend

Show an automatic discount (if any) as its own line in the order summary, separate from the
coupon discount line added in Phase 1, so a customer can see a sale was applied even if they
never touch the coupon field.

Add the static informational note near the coupon input: "Coupons can't be combined. The highest
savings will be applied to your order." Always visible, small muted text, not conditional on
whether a code or sale is present.

**Checkpoint: stop here for a full Phase 3 walkthrough.** Test each case and confirm the charged
amount matches: an active site-wide sale with no coupon entered (sale applies automatically); a
20%-off sale plus a non-stackable 10% code (best-wins: customer gets the 20% sale, code
suppressed); a 10%-off sale plus a non-stackable 20% code (best-wins: customer gets the 20%
code, sale suppressed); a sale plus a code where BOTH are marked stackable (both apply, event
first then code on the remainder); and two active events that both match the cart (only the one
yielding the larger dollar discount applies). Also confirm the "Coupons can't be combined" note
is visible in the Order Summary panel.

---

## What not to touch

- `order_items.discount_amount` (the unrelated per-line staff discount feature)
- Any shipping calculation logic
- Anything in `authorizeNet.ts` beyond the amount already passed in

## Final step: reality-test the whole thing, not just a green build per phase

Per Karen's standing rule, a green typecheck proves nothing at any phase. The task is not done
until all three phases have had a hands-on UI walkthrough in dev AND a read-only DB script
confirming the resulting rows are correct, not just that the build compiled.

*End of brief*
