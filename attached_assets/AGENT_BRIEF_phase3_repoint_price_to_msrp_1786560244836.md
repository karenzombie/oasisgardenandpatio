# Agent Brief, Phase 3: re-point sell-price reads from `price` to `msrp` / `sale_price`

Verified against GitHub HEAD `5cda010` (current dev). DEV ONLY. Prod is handled
separately by Karen and is out of scope for this brief.

Addendum 2 working rules are in force for every step of this brief. If any rule
blocks the direct path, STOP and ask Karen. Do not route around it.

---

## What this is

Today the product-level `price` (sell) field is the field the storefront and
checkout read for the "list / strikethrough" price and as the charged-price
fallback. We are moving those reads to the new fields:

- `msrp` becomes the list / strikethrough price.
- `sale_price` stays the charged price.
- Wherever a read falls back to `price`, it falls back to `msrp` instead.

After this phase, nothing reads `products.price` for pricing except the product
edit form, which keeps its editable `price` input on purpose (see below). The
`price` column is NOT dropped in this phase. Dropping it and removing the edit
field is Phase 4, separate.

## What this is NOT

- NOT dropping the `price` column. It stays.
- NOT removing or changing the editable `price` input on the product edit form
  (`ProductEdit.tsx`). Karen is keeping it so she can test end to end. Leave it
  exactly as is.
- NOT touching any frozen snapshot. `cart_items.price`, `order_items.unit_price`,
  `order_items.unit_cost_snapshot`, and every other stored line value are the
  price that was resolved at the time the line was created. They are history.
  Do not re-point, recompute, or backfill them. This phase only changes what a
  NEW resolution reads, never what a stored line holds.
- NOT the 653-A vendor-order picker problem (fabric not collected, so cost does
  not resolve). That is a separate deferred item. Do not touch it here.

---

## Locked decisions (do not re-derive these)

1. End state: `msrp` = list / strikethrough, `sale_price` = charged, `price` no
   longer read for pricing anywhere except the edit form.
2. Charged-price fallback becomes: `sale_price` when it is set and greater than
   0, otherwise `msrp`. (It was: otherwise `price`.)
3. This is behavior-preserving for existing products. `price` equals `msrp` on
   346 of 348 price-set products, and the 2 exceptions (419-O, 421-CC) are
   grade-priced, so they resolve from grade rows and never read product-level
   `price`. No customer will be charged a different amount as a result of this
   change.
4. The edit form `price` input stays (item above).
5. The bulk price-adjustment tool stays on `price` (it edits the `price` field,
   which still exists).
6. Frozen snapshots are untouched (item above).

---

## Authoritative footprint

Every read below was located in the current code. Step 0 has you re-confirm this
list and flag anything not on it. Do NOT edit anything in Step 0, only classify.

### GROUP A, RE-POINT the resolution / gates / sort / starting-price (server)

These decide charged amounts, purchasability, ordering, and the "From $X"
teaser. This is the money-and-storefront-logic group.

| File | Location | Today | Becomes |
| --- | --- | --- | --- |
| `artifacts/api-server/src/routes/cart.ts` | add-to-cart base resolution (`basePriceStr`, ~816-823) | `sale_price` else `price` | `sale_price` else `msrp` |
| `artifacts/api-server/src/routes/cart.ts` | `hasUsablePrice` gate (~394-396) | `price>0` OR `sale_price>0` | `msrp>0` OR `sale_price>0` |
| `artifacts/api-server/src/routes/cart.ts` | stem add-to-cart pricing (~998, used ~1024) | `sale_price` else `price` | `sale_price` else `msrp` |
| `artifacts/api-server/src/routes/checkout.ts` | purchasable-at-checkout gate (`productPrice`, select ~325, used ~402-403) | `productPrice>0` OR `productSalePrice>0` | `msrp>0` OR `sale_price>0` |
| `artifacts/api-server/src/routes/products.ts` | price sort key (`effectivePrice`, ~301) | `COALESCE(sale_price, price)` | `COALESCE(sale_price, msrp)` |
| `artifacts/api-server/src/routes/categories.ts` | online-category "has a price" gate (~38-39) | `price IS NOT NULL AND price>0` | matches new has-price: `msrp>0 OR sale_price>0` |
| `artifacts/api-server/src/lib/startingPrices.ts` | base+adjustment branch (76, 79, 85) | `p.price` for list and fallback | `p.msrp` for list and fallback |
| `artifacts/api-server/src/routes/adminProducts.ts` | admin list price sort (~399, `case "price"`) | `products.price` | `COALESCE(sale_price, msrp)` |
| `artifacts/api-server/src/routes/adminProducts.ts` | stem-option pricing for staff order builder (`stemOptionRows`, ~1195) | `sale_price` else `price` | `sale_price` else `msrp` |

For each GROUP A file you must ADD `msrp` (and `sale_price` if not already
selected) to the query that resolves the value, then change the resolution.

### GROUP B, ADD `msrp` to the response so the display side can read it (server)

These are pass-through selects that expose product pricing to the web. KEEP the
existing `price` field in the response (the edit form and other things still use
it). ADD `msrp` alongside it.

| File | Location | Action |
| --- | --- | --- |
| `artifacts/api-server/src/routes/products.ts` | storefront list response (~88 select, ~131 object) | add `msrp` |
| `artifacts/api-server/src/routes/products.ts` | product detail response (~337, ~726, ~1201 selects; ~1352 object) | add `msrp` |
| `artifacts/api-server/src/routes/wishlist.ts` | customer wishlist response (~135) | add `msrp` |
| `artifacts/api-server/src/routes/adminWishlists.ts` | staff wishlist responses (~254, ~458) | add `msrp` |
| `artifacts/api-server/src/routes/adminSets.ts` | set items response (`productPrice`, ~75) | add `productMsrp` |

### GROUP C, RE-POINT the display (web)

These read the response fields and render the price. Move the strikethrough /
list to `msrp`, keep the charged/current value on `sale_price` falling back to
`msrp`, and drive the sale badge off `sale_price < msrp`.

Customer-facing:

- `artifacts/web/src/pages/Product.tsx` (PDP): `onSale` (~893), current-price
  fallback (~901-903), `strikePrice` (~929-931), `hasPrice` (~1078-1080), and
  the reference-price display (~2192-2193).
- `artifacts/web/src/pages/Shop.tsx`, `Search.tsx`, `ManufacturerProducts.tsx`,
  `Home.tsx`: the list-card price.
- `artifacts/web/src/pages/Wishlist.tsx`, `AccountWishlist.tsx`: the wishlist
  price. (These matter: the 69 wishlist-only O.W. Lee items show here.)

Staff-facing (swept in for consistency, Karen's call):

- `artifacts/web/src/staff/pages/agent/NewOrder.tsx`: the base unit-price
  resolution (`baseEffectivePrice`, ~1832) moves `picked.price` to
  `sale_price` else `msrp`; the two display spots (~1201, ~1867) show `msrp`.
  This is the original $0 defect. Fixing it here is the point.
- `artifacts/web/src/staff/pages/admin/Products.tsx`: admin list price display.
- `artifacts/web/src/staff/pages/admin/SetEdit.tsx`: set-item price display.
- `artifacts/web/src/staff/pages/agent/Products.tsx`: agent list price display.

### LEAVE ALONE (verified out of scope)

- `artifacts/web/src/staff/pages/admin/ProductEdit.tsx`: the editable `price`
  input and everything around it. Stays.
- `artifacts/api-server/src/routes/adminProducts.ts` detail response (~233): it
  feeds the edit form and already returns both `price` and `msrp`. Leave it.
- `artifacts/api-server/src/routes/adminProductsBulk.ts` (~253): bulk price-edit
  write path. Leave it.
- `artifacts/api-server/src/lib/email.ts` (~369): the order confirmation email
  reads the ORDER LINE's stored price (a snapshot), not `products.price`. Leave
  it. It will show up in a `.price` grep, do not touch it.
- `artifacts/api-server/src/routes/adminProductsImport.ts` (~309, 363, 483, 516):
  the CSV importer WRITES `products.price` from the uploaded file. It is a write
  path like the edit form. Leave it. Karen has deferred updating it (to also
  write `msrp`) to Phase 5; the client is not using CSV import yet, so the gap
  is accepted for now. Do not touch this file in this brief.
- `artifacts/web/src/staff/pages/admin/ProductEdit.tsx`: already listed above.
  Note it also has an editable `msrp` input, so staff can set the display price
  through the same form. Leave the whole file alone.
- Every frozen snapshot column. Leave them.

### CONTRACT

The generated types are produced by `orval` from an OpenAPI spec. Do NOT hand
edit any file under `lib/api-zod/src/generated` or `lib/api-client-react/src/generated`,
those are outputs and get overwritten.

- Source of truth: `lib/api-spec/openapi.yaml`. The customer product schemas
  there (the ones the storefront and PDP read, near the `price` / `salePrice` /
  `priceVaries` blocks) carry `price` and `salePrice` but no product-level
  `msrp`. Add `msrp` to each CUSTOMER product schema, declared the same way
  `price` is (nullable string). Do NOT add it to variant, grade, addon, cover,
  or stem schemas, those already have their own `msrp`.
- The admin product schema already declares `msrp`, so admin responses that add
  `msrp` need only a regeneration, not a spec edit. Confirm.
- Regenerate with: `cd lib/api-spec && pnpm codegen` (this runs orval and then
  typechecks the libs). This regenerates both `lib/api-zod` and
  `lib/api-client-react`.
- After regenerating, prove `msrp` is present at the product level in the
  generated customer types (for example, grep the generated `catalogProduct`
  type for `msrp`).

---

## Steps (each is a STOP gate)

At every STOP: paste every diff and every command output as literal text in your
message (Addendum 2 Rule 4). For every file you modify, include the before/after
behavior audit of the whole file (Rule 2). Targeted edits only, no whole-file
rewrites (Rule 1). Report anything off, do not repair it (Rule 5). Verify or
ask, never assume (Rule 6).

Run a clean typecheck (`pnpm run typecheck`) at every STOP and paste the output.
A green typecheck means the code compiles, not that the behavior is right, so it
never replaces the behavior audit or Karen's dev testing.

### Step 0, RECON only. No edits. STOP.

Walk the codebase and produce the complete list of every read of
`products.price` (server Drizzle `productsTable.price`, server raw SQL
`p.price` / `products.price`, and web `.price` on a product object). For each,
paste `file:line`, a one-line snippet, and its classification: GROUP A, GROUP B,
GROUP C, or LEAVE, using the table above.

Then explicitly answer: is every read in the code accounted for by the table
above? If you find a read that is not in the table, list it, classify what you
think it does, and STOP for Karen to decide. Do not edit it.

STOP. Wait for Karen to confirm the list before any edit.

### Step 1, GROUP B customer responses + contract regen. STOP.

Do this in order, because the server response is typed against the generated
contract, so the schema has to carry `msrp` before the response can return it:

1. Add product-level `msrp` to the customer product schemas in
   `lib/api-spec/openapi.yaml` (see CONTRACT above).
2. Run `cd lib/api-spec && pnpm codegen`.
3. Add `msrp` to the customer product responses in `products.ts` (list + detail
   selects and the objects they build).

Nothing on the web reads `msrp` yet, so this is additive and safe.

Paste: the spec diff, the codegen command and its output, the `products.ts`
diff, and a grep proving the generated customer product type now includes
`msrp`.

Behavior audit of `products.ts`: confirm no existing response field changed,
only `msrp` added.

Karen test list:
- Go to any product page on the storefront. It should look exactly as before
  (the new field is not displayed yet).
- Go to the shop grid and a manufacturer page. Same, no visible change.
- If anything on those pages changed, that is a problem, note it.

STOP.

### Step 2, GROUP A resolution and gates. STOP.

Re-point every GROUP A location. Add `msrp` (and `sale_price` where missing) to
each resolving query first, then change the resolution / gate / sort / starting
price. This is the charged-price and purchasability group, treat it as the
highest-risk step.

DATA ASSUMPTION behind the gate changes: flipping the purchasability gates from
`price` to `msrp` is only safe if no orderable product has `price` set but
`msrp` null, because such a product would flip from sellable to blocked. Our
recon confirmed this holds (zero cases where `price` and `msrp` both set and
differ; the only 2 products with `price` set and `msrp` null are grade-priced,
which are gated by the variant/grade path, not the product-level gate). If more
products were loaded since that recon, re-run it before this step and confirm
the count is still zero. Do NOT flip the gates until that is confirmed.

Paste every diff. Behavior audit of every file touched (`cart.ts`,
`checkout.ts`, `products.ts`, `categories.ts`, `startingPrices.ts`,
`adminProducts.ts`), covering the whole file, confirming every OTHER pricing
path (grade mode, absolute variants, frame-only, add-ons, stems, covers) is
unchanged.

Karen test list (customer checkout, end to end):
- Add a normal in-stock product to the cart and go all the way through checkout.
  The unit price and total must match what you expected, unchanged from before.
- Do the same with a product that is on sale. The charged price should be the
  sale price, unchanged.
- Add a wishlist-only item is NOT expected to be orderable, confirm it still is
  not.
- Try to add a product that has no price at all, confirm you still get the
  "no price, contact us" message and cannot buy it.
- Sort a category by price low-to-high and high-to-low, confirm the order looks
  right.
- Adjacent to check: the "From $X" teaser on a product that has options, and
  the staff order builder stem picker if you use one, confirm prices resolve.

STOP.

### Step 3, GROUP B remaining responses. STOP.

Add `msrp` to the wishlist, admin wishlist, and set responses. Additive.

Paste diffs and any regen output. Behavior audit: only `msrp` added.

Karen test list:
- Open a customer wishlist and a staff wishlist view, confirm they look the same
  as before (still no visible change yet).

STOP.

### Step 4, GROUP C customer display. STOP.

Re-point the PDP, the list cards, and the wishlist price display to read `msrp`
for the strikethrough/list and `sale_price` (falling back to `msrp`) for the
current price, with the sale badge on `sale_price < msrp`.

Null handling: when `msrp` is null (which should not happen on a flat product,
but guard anyway), show nothing rather than `$0`. Do not render a zero price or
a strikethrough on a missing value. Mirror however the current code already
guards a missing `price`, do not invent new behavior.

Paste diffs. Behavior audit of `Product.tsx` in full (it is large), plus each
list page and wishlist page.

Karen test list:
- On a normal product page, the price shown should be unchanged.
- On a sale product, the struck-through price should now be the MSRP and the
  sale price shown as active, with the SALE badge.
- Open a wishlist-only O.W. Lee item on a wishlist. It should now show its MSRP
  (struck if there is a sale price) instead of blank.
- Check the shop grid, search results, a manufacturer page, and the Home page
  featured items, prices should render, no blanks where there used to be a
  price.
- If a product that should show a price shows nothing, note it.

STOP.

### Step 5, GROUP C staff display + the $0 fix. STOP.

Re-point the staff order picker base price (`NewOrder.tsx`) and the admin/agent
list and set displays.

Paste diffs. Behavior audit of `NewOrder.tsx` in full, confirming the grade
mode and frame-only paths are unchanged and only the flat base path moved from
`price` to `sale_price` else `msrp`.

Karen test list:
- Staff, Create New Order. Pick an O.W. Lee side table base (for example
  6-ST01, the one that used to come in at $0). The unit price should now
  populate correctly, not $0.
- Pick a normal flat-priced product, confirm its unit price is right.
- Pick a grade-priced product and a frame-only product, confirm those still
  resolve exactly as before (they were never on this path).
- Admin, Products list: prices should show, including for items that used to be
  blank.
- Admin, Sets editor: set item prices should show.

STOP.

### Step 6, vendor-order label change. STOP.

Karen wants the vendor order Items table to read "Unit cost" and "Total cost"
instead of "Cost" and "Total". The new-order screen already says "Unit cost";
the detail screen says "Cost" and "Total".

CAUTION: `VendorOrderDetail.tsx` has several tables, and some "Total" headers are
quantity totals, not cost. Do NOT blanket-rename. First paste every "Cost" and
every "Total" header you find with its `file:line` and which table it belongs to
(items, receive, cancel, history). Then rename ONLY the main vendor-order Items
table headers to "Unit cost" and "Total cost", matching the new-order screen.
List any other "Cost"/"Total" header you are unsure about and STOP for Karen
rather than renaming it.

Paste diffs. Confirm the printed PO and the PO email are unaffected (they show
no prices at all, so they should not change).

Karen test list:
- Open a vendor order detail. The Items table should read "Unit cost" and
  "Total cost".
- Compare with the create-new-vendor-order screen, the labels should match.
- Any other table on the page (received, cancelled) should be unchanged.

STOP. End of brief.
