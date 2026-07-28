# Agent Brief: Wishlist items must store and display the REAL variant SKU

## Why this matters (read first)

The SKU is the product's real, orderable identity, the string the vendor
(O.W. Lee) actually recognizes. A parent placeholder like `D-TOPS` is NOT a real
SKU; it means nothing to the vendor and cannot be ordered. When a customer saves
a Dakota top in "24\" Round" to their wishlist, the wishlist MUST record the real
variant SKU `#D-24D`, not the parent `D-TOPS`, and not merely a text label like
"24\" Round" (a label is a description, not an identity). If this wishlist ever
converts to a real order, the variant SKU is the only thing that lets staff order
the correct item from the vendor.

Currently the wishlist stores only `product_id`, so it can only ever show the
parent SKU `D-TOPS`. That is the bug. This brief makes the wishlist store the
chosen VARIANT and display the real variant SKU everywhere.

## Two defects this brief fixes

1. **The selected size is not being saved at all.** A prior task was supposed to
   capture the size but the wiring did not land (there is currently no
   `selectedVariantLabel`/`variantLabel` handling in `Product.tsx`,
   `WishlistButton.tsx`, or `routes/wishlist.ts`). Verify and fix.
2. **The wishlist shows the parent SKU `D-TOPS`** instead of the real variant SKU
   `#D-24D`, because the wishlist item has no variant reference.

## The correct data model

Add a nullable `variant_id` to `wishlist_items` referencing
`product_variants.id`. When a customer saves a product with a selected size/
variant, store that `variant_id`. Every wishlist SKU display then resolves to the
variant's `variant_sku` when a variant is set, falling back to the product's
`sku` only when there is no variant.

Keep `variant_label` too (it is fine as a human-readable snapshot), but the SKU
shown must come from the real variant, not the label.

## Hard rules

- Real SKUs only. Never display a parent/placeholder SKU when a variant is
  selected. After this brief, saving a sized top and viewing the wishlist (customer
  AND staff) must show `#D-24D`, never `D-TOPS`.
- Do NOT make wishlist items purchasable. No cart, no checkout, no payment code
  (`checkout.ts`, `cart.ts`, `Cart.tsx`, `lib/authorizeNet.ts`) — do not touch.
- Do NOT touch pricing. No price fields, no price computation for these tops.
- Schema change is via a plain SQL `ALTER TABLE` that KAREN runs herself. You
  provide the exact SQL; you do NOT run migrations and you do NOT run
  `drizzle-kit push`. You DO update the Drizzle schema file to match.
- Preserve the existing guest/localStorage wishlist behavior. The new column is
  nullable and additive.
- If request/response shapes are orval-generated from an OpenAPI source, edit the
  SOURCE and regenerate; never hand-edit generated files.

## Files in scope

Schema / DB:
- `lib/db/src/schema/wishlist.ts` (add `variantId` column to the Drizzle table)
- (Karen runs the matching `ALTER TABLE` SQL you provide)

Save path:
- `artifacts/web/src/pages/Product.tsx` (pass the selected variant id to the
  WishlistButton in the quote-only branch)
- `artifacts/web/src/components/WishlistButton.tsx` (accept + forward variantId)
- `artifacts/api-server/src/routes/wishlist.ts` (accept variantId, store it,
  include it in the dedup key so two sizes of the same product are distinct saves)
- OpenAPI source for `AddWishlistItemRequest` + regenerate

Display path (all must resolve to the real variant SKU):
- `artifacts/api-server/src/routes/wishlist.ts` customer GET (`loadWishlist`):
  leftJoin `product_variants` on the new `variant_id` and return the variant SKU
  as the item's `sku` when present, else the product sku
- `artifacts/api-server/src/routes/adminWishlists.ts`: same resolution in BOTH
  query blocks (currently `sku: r.productSku` at ~line 297; make it
  variantSku ?? productSku)
- The customer pages (`Wishlist.tsx` line 148, `AccountWishlist.tsx` line 117)
  and staff surfaces (`WishlistDetail.tsx` ~line 420, `WishlistPrint.tsx` ~line
  155, `wishlistPdf.tsx` ~line 284) already render whatever `sku` the API sends,
  so once the APIs resolve correctly these display the variant SKU with no change.
  Confirm each shows the real SKU; only change them if they source SKU some other
  way.

## Numbered steps with check-in gates

Do these IN ORDER. After each step STOP and paste the raw diff plus the requested
evidence. Do not proceed until told.

### Step 1 — Schema: add variant_id
Add `variantId: integer("variant_id").references(() => productVariantsTable.id,
{ onDelete: "set null" })` (nullable) to `wishlistItemsTable`. Provide the exact
`ALTER TABLE wishlist_items ADD COLUMN variant_id integer REFERENCES
product_variants(id) ON DELETE SET NULL;` SQL for Karen to run. Do NOT run it
yourself, do NOT run drizzle-kit push.

**Check-in:** paste the schema diff and the exact SQL. STOP. (Karen runs the SQL
before you continue.)

### Step 2 — Save the variant id
Wire the selected variant id from the quote-only PDP through WishlistButton, the
add request body, and into the insert. Add variantId to the dedup key so
different sizes of the same product are separate saves (currently the dedup key
is product + finish/fabric/tile; add variant). Update OpenAPI source + regen.

**Check-in:** paste all diffs. Save a Dakota top at "24\" Round" and paste the DB
row showing `variant_id` populated with the `#D-24D` variant's id.

### Step 3 — Resolve the real SKU in both APIs
Customer `loadWishlist` and admin wishlist queries: leftJoin product_variants on
variant_id, return `sku = variantSku ?? productSku`.

**Check-in:** paste diffs. Paste the customer GET and admin detail JSON for that
saved item, showing `sku` is now `#D-24D`, not `D-TOPS`.

### Step 4 — Confirm every display surface shows the real SKU
Verify customer Wishlist, AccountWishlist, staff WishlistDetail, WishlistPrint,
and PDF all now show `#D-24D` for the saved item. Change a surface only if it
doesn't pick up the API's sku.

**Check-in:** paste any diffs (may be none) and confirm on the running dev site
that the customer wishlist and staff wishlist both show `#D-24D`, not `D-TOPS`.

### Step 5 — Typecheck + build
Full workspace typecheck + build. Paste actual output.

## Definition of done

Saving a sized O.W. Lee top to the wishlist stores the real variant_id, and every
wishlist surface (customer + staff + print + PDF) displays the real variant SKU
(e.g. `#D-24D`), never the parent `D-TOPS`. The size also still shows via
variant_label. No product became purchasable, no cart/payment/pricing touched,
guest wishlist behavior preserved.
