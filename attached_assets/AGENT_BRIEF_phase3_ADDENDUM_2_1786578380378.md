# Addendum 2 to the Phase 3 brief, correction to Step 5

Step 5 changed the staff order picker's base price incorrectly. The brief said to
move `baseEffectivePrice` from `picked.price` to "`sale_price` else `msrp`" (prefer
the sale price, fall back to MSRP). The change that landed reads only `picked.msrp`
and drops the sale-price preference, so the staff order charges the full price
instead of the sale price. The customer side correctly uses the sale price, so the
two diverge.

This is one targeted edit. No other scope. Addendum rules still apply: targeted
edit only, paste the diff and typecheck as literal text, behavior audit, STOP.

## The fix

File: `artifacts/web/src/staff/pages/agent/NewOrder.tsx`, the `baseEffectivePrice`
flat (non-grade, non-frame-only) branch. It is the ONLY place in the file that
matches `picked?.msrp != null ? Number(picked.msrp)` (verified: exactly one
occurrence, at ~line 1832; the other `picked.msrp` at ~1914 is the frame-only
delta hint and is NOT the line to change).

`picked` is typed `AdminProduct`, which declares `salePrice: string | null`
(verified in the generated types). So `picked.salePrice` compiles as written. Do
NOT add a type cast, and do NOT read `salePrice` from `detail.data` or anywhere
else. Use `picked.salePrice`.

Match the file's EXACT existing indentation: 6 spaces before the `:`, and 8
spaces before the `(selectedVariant` line. Read those two lines from the file
first, then replace exactly them. Do not reformat any surrounding lines.

Replace exactly these two lines:

```
      : (picked?.msrp != null ? Number(picked.msrp) : 0) +
        (selectedVariant ? Number(selectedVariant.priceAdjustment) || 0 : 0);
```

with:

```
      : (picked?.salePrice != null && Number(picked.salePrice) > 0
          ? Number(picked.salePrice)
          : (picked?.msrp != null ? Number(picked.msrp) : 0)) +
        (selectedVariant ? Number(selectedVariant.priceAdjustment) || 0 : 0);
```

The logic: prefer `salePrice` when it is set and greater than 0, otherwise fall
back to `msrp`, then add the variant adjustment exactly as before.

Do NOT change anything else: not the grade branch (it already prefers sale
correctly), not the frame-only branch, and not the two display badges at ~1201
and ~1867 (those show the list/MSRP as a reference and are not the charged
price).

## Verify

- Paste the diff and a clean `pnpm run typecheck`.
- Behavior audit of `baseEffectivePrice`: confirm the grade and frame-only
  branches are unchanged and only the flat branch gained the sale-price
  preference.
- Push to GitHub, then STOP.

## What Karen will re-test

- Create New Order, add a flat product that has a sale price (e.g. the AKZ13
  Rolling Base: sell/MSRP 1380, sale 1035). The line should now charge the sale
  price (1035), matching the customer cart, not the MSRP.
- Add a flat product with NO sale price. It should charge the MSRP (unchanged).
- Add a grade-priced line and a frame-only line. Both should be unchanged from
  before (they were already correct).
