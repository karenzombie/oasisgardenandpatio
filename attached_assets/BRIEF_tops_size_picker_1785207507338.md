# Agent Brief: Size picker for quote-only products (O.W. Lee table tops)

## Context and problem

O.W. Lee table tops are modeled as a parent product with size VARIANTS
(`product_variants`, `option_label = 'Size'`). Example: parent "Dakota Porcelain
Tops" (id 5492, SKU `D-TOPS`) has 18 size variants (`#D-24D`, `#D-42D`, etc.).

These products are quote-only (`quote_only = true`, `available_online = false`),
so on the PDP they render the "Available through a sales agent" branch in
`artifacts/web/src/pages/Product.tsx`. That branch currently shows
`ProductOptionPickers` (finish / fabric / tile) and the `WishlistButton`, but it
renders NO size/variant selector at all. Result:

1. The customer cannot choose a size.
2. The page shows the parent's placeholder SKU (`D-TOPS`) instead of a real
   variant SKU, because `selectedVariant` is never set (see `dynamicSku`, which
   falls back to `data.sku` when no variant is selected).
3. The spec/dimension display can't reflect the chosen size.
4. The saved wishlist entry has no way to record which size the customer wanted.

The PURCHASABLE branch already has a working variant picker (see Product.tsx
around lines 1607-1660, the `variantIsFinish` block and the `FabricSwatchDialog`
usage). The fix is to give the quote-only branch an equivalent SIZE picker and
wire the selection through to the SKU display, the specs, and the wishlist.

## Goal (one coherent feature)

When a quote-only product has size variants, the PDP must:
1. Render a Size selector in the quote-only branch.
2. On selection, show that variant's real SKU (e.g. `#D-24D`) instead of the
   parent SKU.
3. Drive the displayed dimensions/specs from the selected variant (the page
   already has `displayVariant` / `effectiveDimensions` / `effectiveWeight`
   logic, lines ~969-975, that prefers the selected variant, reuse it).
4. Save the chosen size to the wishlist so staff can see which size the customer
   wanted.
5. The same size selection must work in the STAFF order picker
   (`artifacts/web/src/staff/pages/agent/NewOrder.tsx`), consistent with how
   every other variant product works there.

## Hard rules (read carefully)

- **Do NOT make these products purchasable.** They stay quote-only: no
  add-to-cart, no checkout, no price shown to the customer. The size picker feeds
  the WISHLIST only, never the cart.
- **Do NOT touch any payment or cart code** (`checkout.ts`, `cart.ts`,
  `Cart.tsx`, `lib/authorizeNet.ts`). This feature does not go near them.
- **Do NOT touch pricing.** Variant prices are loaded separately by Karen via
  direct DB update. Do not add, compute, or display any price for these tops.
- **Do NOT change the purchasable variant picker.** Reuse its pattern, don't
  modify it.
- **Do NOT alter the finish/fabric/tile pickers** that already work in the
  quote-only branch. You are ADDING a size selector alongside them.
- Label the selector using the variant's `optionLabel` ("Size"), not a
  hardcoded "Finish", since for these products the variant is a size.
- If you cannot determine something, write "I could not determine this" rather
  than guessing.

## How the wishlist stores the size

The `wishlist_items` table already has a `variant_label text` column (nullable).
The staff and customer wishlist views ALREADY render `variantLabel` when present
(this was wired in the prior wishlist task). Nothing currently writes it. This
feature makes the customer wishlist-add path capture the selected size into
`variant_label`.

Concretely:
- The add-to-wishlist request body (`AddWishlistItemRequest`) needs a new
  optional field to carry the size. Simplest correct choice: send the selected
  variant's display name (e.g. `24" Round`) as `variantLabel`, OR send the
  variantId and have the server resolve the name. Pick ONE and state which in
  your check-in. (If you send variantId, resolve to the variant name server-side
  before storing in `variant_label`; do not store a raw id in a label column.)
- The wishlist insert in `routes/wishlist.ts` then writes `variant_label`.
- `WishlistButton` must accept and forward the selected size the same way it
  forwards `selectedFinishId` etc.
- If these request/response shapes are orval-generated from an OpenAPI source,
  update the SOURCE spec and regenerate. Do not hand-edit generated files. State
  which source file you changed and the regeneration command.

## Precise implementation facts (verified in the code, use these)

These save you time and prevent breakage. All confirmed by reading Product.tsx:

- The SKU display (`{dynamicSku}` in the Meta `<dl>`, around line 2540) is
  OUTSIDE the quote-only/purchasable conditional, so it renders for these
  products already. `dynamicSku` for these tops resolves to
  `selectedVariant?.sku ?? data.sku`. Therefore the ONLY thing needed to fix the
  SKU is to set `variantId` (which sets `selectedVariant`). Do not add a separate
  SKU display; the existing one updates automatically.
- `variantId`, `selectedVariant`, and `displayVariant` are top-level component
  state, NOT gated to any branch. Your Size selector in the quote-only branch
  must set the SAME `variantId` state (via `setVariantId`), not a new parallel
  state. Then `dynamicSku`, `displayVariant`, `effectiveDimensions`, and
  `effectiveWeight` all update with zero extra wiring.
- `displayVariant = selectedVariant ?? variants[0]` (line ~969) intentionally
  defaults specs/dimensions to the first size on page load before the customer
  picks. DO NOT change this to a blank/null default; leave it so a real size
  shows immediately.
- **DO NOT touch `CompatibleRecommendations sku={data.sku}` (line ~2535).** It
  intentionally uses the parent SKU and feeds a separate recommendations feature
  that is built in a later task. Do not change it to `dynamicSku` or the variant
  SKU. Leave it exactly as is.

## Files likely in scope

- `artifacts/web/src/pages/Product.tsx` (add size picker to quote-only branch;
  ensure `dynamicSku` and spec display use the selected variant)
- `artifacts/web/src/components/WishlistButton.tsx` (forward selected size)
- `artifacts/api-server/src/routes/wishlist.ts` (accept + store `variant_label`)
- `artifacts/web/src/staff/pages/agent/NewOrder.tsx` (size selection in the staff
  order picker for these products)
- The OpenAPI source for the wishlist add request (if generated), plus regen.

Do not touch files outside what the feature actually requires. If a needed file
isn't listed here, that's fine, use it, but never touch cart/payment/pricing.

## Numbered steps with check-in gates

Do these IN ORDER. After each step STOP and paste the raw diff plus the
requested evidence. Do not proceed until told to continue.

### Step 1 — Size picker renders + drives the SKU on the PDP
In `Product.tsx`, in the quote-only branch, render a Size selector when the
product has variants. On selection, set the variant so `dynamicSku` shows the
real variant SKU and the spec/dimension display reflects the chosen size. Use
the variant's `optionLabel` as the selector label.

**Check-in:** paste the diff. Using the Dakota tops product (parent id 5492,
SKU `D-TOPS`), describe or screenshot: before selection the page shows the size
options; after choosing "24\" Round" the displayed SKU reads `#D-24D` (NOT
`D-TOPS`) and the dimensions update.

### Step 2 — Save the selected size to the wishlist
Add the size to the add-to-wishlist path (request body + `WishlistButton` +
`routes/wishlist.ts` insert into `variant_label`). Regenerate types if the
contract is generated.

**Check-in:** paste the diffs. Show that saving a Dakota top at "24\" Round" to
the wishlist writes `variant_label = '24" Round'` (paste the DB row or the API
response). Confirm the customer AND staff wishlist views now show that size
(they already render `variantLabel`).

### Step 3 — Staff order picker size selection
In `NewOrder.tsx`, ensure staff can pick the size for these variant products in
the order picker, consistent with existing variant products. (These are
quote-only, but staff order creation still needs to reference the correct
variant SKU.)

**Check-in:** paste the diff. Describe selecting a size for a tops product in the
staff New Order flow and confirm the correct variant SKU is used.

### Step 4 — Typecheck + build
Run the full workspace typecheck and build. Paste the actual command output. Fix
only what your own changes broke; report anything else.

## Definition of done

For a quote-only product with size variants (O.W. Lee tops): the PDP shows a Size
selector, selecting a size displays the real variant SKU (e.g. `#D-24D`) and
size-specific dimensions, the chosen size saves to the wishlist and appears in
both customer and staff wishlist views, and the staff order picker can select the
size. No product became purchasable, no cart/payment/pricing code was touched,
and the existing finish/fabric/tile pickers still work.

## Note for verification (Karen)
After this lands, the acceptance test for the whole tops workstream is: no fake
`-TOPS` parent SKU should be findable or displayed in either the customer or
staff UI. A customer/staff should always land on a real variant SKU. Confirm the
parent SKU no longer surfaces on the PDP once a size is selected.
