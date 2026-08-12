# Addendum 1 to the Phase 3 brief

Everything in the original Phase 3 brief remains in force. This addendum adds no
new scope decisions. It records four reads of `products.price` that your Step 0
recon surfaced, that were not in the original brief's tables. All four were
verified against the current code and confirmed in scope by Karen. Addendum 2
working rules (from Phase 2) still apply to every step.

Fold each item into the step named. Do not start editing until Karen has
confirmed you may proceed past Step 0.

---

## Correction to the original GROUP B table

The original brief listed `products.ts` `~1201` under "product detail response
(add msrp)". That was wrong. Line `~1201` is the CUSTOMER PDP stem-options
select, not a product-level detail select. Treat it under Addition 1 below, as
GROUP A. Drop `~1201` from the GROUP B product-detail line; the real
product-level detail selects are `~337`, `~726`, and the object at `~1352`.

---

## Addition 1 (GROUP A, goes in Step 2), customer PDP stem pricing

File: `artifacts/api-server/src/routes/products.ts`, the stem-options block
(select `~1201`, resolution `~1229-1238`).

This is the customer-side twin of the staff order-builder stem pricing in
`adminProducts.ts` `~1195`, which the original brief already classifies GROUP A.
Treat it identically:

- Add `msrp` to the stem select (`~1201`).
- Change the `unitPrice` fallback from `s.price` to `s.msrp` (keep the
  `sale_price` preference: `sale_price` when set and greater than 0, else `msrp`).
- Build the response `msrp` field from `s.msrp`, not `s.price`.

Do this alongside the rest of the GROUP A work in Step 2. Include it in the
Step 2 behavior audit of `products.ts`.

---

## Addition 2 (GROUP A, goes in Step 3), staff wishlist price resolution

File: `artifacts/api-server/src/routes/adminWishlists.ts`.

Two spots resolve a staff-wishlist price with a fallback to `price`:

- The `livePrice` helper (`~46`), which returns `money(salePrice) ?? money(price)`,
  used for the subtotal at `~305`.
- The email-copy price at `~490`, which is the same `money(salePrice) ?? money(price)`
  pattern inline.

Re-point both fallbacks from `price` to `msrp`. This depends on `msrp` being on
the selects at `~254` and `~458`, which the original brief already covers under
GROUP B in Step 3. So in Step 3, for `adminWishlists.ts`, do both: add `msrp` to
the selects AND re-point these two resolutions. The customer wishlist and the
set response in Step 3 stay additive only (no resolution there).

Note: the affected products all have `sale_price` set, so they already resolve
correctly here through the `sale_price` branch. This re-point is for consistency
and for any future product priced by `msrp` with no `sale_price`, not to fix a
current break.

Add this to the Step 3 behavior audit of `adminWishlists.ts`: only the two
fallbacks changed, subtotal and email logic otherwise intact.

Step 3 test list, add:
- Open a staff wishlist that has one of the affected items. The line price and
  the subtotal should be correct, and for existing items unchanged, since
  `price` and `msrp` match on them.

---

## Addition 3 (GROUP C, goes in Step 5), the "vs. frame only" delta

File: `artifacts/web/src/staff/pages/agent/NewOrder.tsx`, the "vs. frame only"
delta hint at `~1914`:

`(+{fmtMoney(Number(picked.price) - Number(detail.data.frameOnlyPrice))} vs. frame only)`

Change `picked.price` to `picked.msrp` so it follows the rest of the NewOrder
re-point. This is a cosmetic display hint. Include it in the Step 5 behavior
audit of `NewOrder.tsx`.

---

## Confirmed NOT changing

The customer wishlist route (`artifacts/api-server/src/routes/wishlist.ts`)
passes the price fields straight through to the web with no server-side price
resolution. It is fully covered by the existing GROUP B (add `msrp` to the
select) and GROUP C (web display) entries. No extra work there.
