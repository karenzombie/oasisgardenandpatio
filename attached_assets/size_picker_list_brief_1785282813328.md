# Agent Brief: Convert the size picker to a plain list (no image slots)

## Context and problem

On quote-only table-top products (O.W. Lee porcelain, Dekton, Micro Mesh, and
Reclaimed tops), the PDP renders a "Choose a size" modal that lays each size out
as a card with an image thumbnail. Sizes have no images, so every card shows a
blank thumbnail. See the "Choose a size" modal on
`/shop/city-series-porcelain-tops`.

The reason: the size picker does not have its own component. It reuses the shared
`FabricSwatchDialog` (the same modal the fabric picker uses) and passes the size
variants in with `swatchImageUrl: null`. The dialog then draws its swatch-card
grid with empty image slots.

We do NOT want to build per-size images. The fix is to render the size selector
as a plain, searchable LIST of size names, with no image slots at all. Product
imagery is handled separately at the product level (normal gallery images) and is
out of scope for this brief.

## Exactly what to change (one site only)

There is ONE size picker. In `artifacts/web/src/pages/Product.tsx`, inside the
`data.quoteOnly` branch, gated by `variants.length > 0 && !variantIsFinish`,
around lines 1198 to 1245. It renders:

- a "Browse sizes" button that sets `variantPickerOpen`, and
- a `FabricSwatchDialog` with `noun="size"`, `nounPlural="sizes"`,
  `title={`Choose a ${variantOptionLabel.toLowerCase()}`}`, whose `fabrics`
  array is built from `variants` with `swatchImageUrl: v.swatchImageUrl ?? null`.

Replace ONLY this size picker's rendering with a plain searchable list of sizes.
The trigger button and the surrounding label line (the
`variantOptionLabel` / `selectedVariant.name` / `SelectionCheck` line above it)
can stay as they are.

## Full footprint: what this piece is wired to and MUST keep working

The size picker is not just a display. Selecting a size drives several downstream
behaviors, all keyed off the same state. After the change, every one of these
must behave exactly as it does today:

1. **Selection state.** On confirm the current code calls
   `onConfirm={(id) => setVariantId(id)}`. The new list MUST call the same
   `setVariantId(id)` on selection. Everything below keys off `variantId` and the
   derived `selectedVariant`. Do not introduce a new state variable for this.
2. **Real SKU display.** `dynamicSku` shows the selected variant's real SKU (for
   example `#D-24D`) instead of the parent placeholder SKU (`D-TOPS`). This
   depends on `selectedVariant` being set from `variantId`.
3. **Spec and dimension display.** The displayed dimensions and specs reflect the
   chosen size through the existing `selectedVariant` / effective dimensions and
   weight logic.
4. **Price and grade logic.** Any grade prices, min order quantity, MSRP, sale
   price, and surcharge that read from `selectedVariant` must continue to work.
5. **Current-selection highlight.** The dialog currently passes
   `selectedFabricId={variantId}` so the active size shows as selected. The list
   must show the currently selected size as selected in the same way.
6. **Search.** The picker currently supports search (`Search sizes...`). Keep a
   search or filter box in the list, including a sensible empty result when a
   search matches nothing. These products have up to 18 sizes.
7. **Single-variant case.** When `variants.length === 1` the code already shows a
   plain label instead of the dialog. Leave that branch as is.
8. **Wishlist size capture.** Below the picker, `WishlistButton` receives
   `selectedVariantLabel={selectedVariant?.name ?? null}` and
   `selectedVariantId={variantId}`. This is the size-to-wishlist capture that was
   just built. It must keep working unchanged, which it will as long as
   `setVariantId` still drives `selectedVariant`.

## Hard guardrails: what you must NOT touch or regress

- **Do not change `FabricSwatchDialog` behavior for its other consumers.** The
  shared `artifacts/web/src/components/FabricSwatchDialog.tsx` is used in several
  other places (the frame-finish picker, the frame-plus-weave-color picker, the
  tile picker, the finish picker, the stem picker, and finish-driven variant
  pickers). Every one of those must render and behave byte-for-byte the same
  after this change. The preferred approach is to build a small dedicated
  size-list component and leave `FabricSwatchDialog` completely untouched. If you
  instead choose to add a list mode to `FabricSwatchDialog` behind a prop, the
  prop must default to the current card behavior so every existing consumer is
  visually and behaviorally identical. State which approach you took and why in
  your check-in.
- **Do not touch the finish-swatch variant picker** (`variantIsFinish` branch,
  `noun="finish"`, "Browse swatches"). That is a separate picker and must be left
  exactly as it is.
- **Do not touch the staff order picker** (`NewOrder.tsx`). It already uses a
  plain dropdown for size. No change there.
- **Do not touch the product image gallery.** The main PDP image area renders
  `data.images` where `imageKind === 'gallery'`. It is unrelated to the size
  picker. Product images are loaded as data separately and are out of scope here.
- **Do not touch cart, checkout, payment, or pricing.** These products are
  quote-only, so there is no cart path, but the rule stands.
- Do not modify any file that is not required by this one change.

## Files likely in scope

- `artifacts/web/src/pages/Product.tsx` (replace the size picker rendering in the
  `data.quoteOnly` branch with a plain list; keep `setVariantId` wiring intact)
- Optionally a small new size-list component under
  `artifacts/web/src/components/` (preferred over editing the shared dialog)

If any other file turns out to be needed, use it, but never touch the guardrail
areas above.

## Steps with check-in gate

Do this as one coherent change, then STOP at the check-in and paste raw evidence.
Do not proceed past the check-in until told to continue.

### Step 1 - Replace the size picker with a plain searchable list

In the `data.quoteOnly` branch of `Product.tsx`, render the size selector as a
plain list of size names (no image thumbnails, no card grid). Keep the search or
filter box. On selecting a size, call `setVariantId(id)` exactly as the current
`onConfirm` does. Show the currently selected size as selected. Leave the
single-variant label branch and the surrounding label line as is.

### Check-in - paste all of the following before continuing

- The raw diff.
- A statement of which approach you took (dedicated component, or prop-gated list
  mode on the shared dialog) and why.
- Using the City Series Porcelain Tops page (`/shop/city-series-porcelain-tops`,
  the one currently showing blank cards), confirm by screenshot or description:
  - The size selector shows a plain list of sizes with no blank image slots.
  - Before any selection the page shows the parent placeholder SKU (the `-TOPS`
    code). After choosing a size, the displayed SKU changes to that size's real
    variant SKU (the short per-size code, not the `-TOPS` placeholder), and the
    dimensions or specs update to that size.
  - The currently selected size shows as selected when the list is reopened.
  - Saving that product at the chosen size to the wishlist still records the size
    (paste the `variant_label` value on the wishlist row or the API response).
- Confirm, by loading a product that uses the fabric picker and one that uses the
  finish or tile picker, that those pickers render and behave exactly as before.
