# Agent Brief: Wishlist selections must display like cart items (customer + staff)

## Context and problem

When a customer saves a quote-only / non-purchasable product to their wishlist,
the PDP already lets them pick a finish, fabric, and/or table-top tile. Those
selections ARE being saved to the database (columns `selected_finish_id`,
`selected_fabric_id`, `selected_table_top_tile_id` on `wishlist_items`). The bug
is purely on the READ / DISPLAY side:

1. The customer wishlist page (`Wishlist.tsx`) and account wishlist
   (`AccountWishlist.tsx`) do not render the saved selections at all.
2. The customer wishlist API (`GET /wishlist`, `loadWishlist` in
   `routes/wishlist.ts`) returns raw IDs but never resolves them to names.
3. The staff wishlist API (`routes/adminWishlists.ts`) selects only
   `variant_label` (a column nothing writes) and never selects or resolves the
   three ID columns.
4. All staff surfaces (`WishlistDetail.tsx`, `WishlistPrint.tsx`,
   `wishlistPdf.tsx`, `email.ts`) display only `variantLabel`, which is always
   empty.

The **cart already solves this exact problem correctly**. See
`routes/cart.ts` lines ~124-166: it leftJoins `productVariantsTable`,
`fabricsTable`, `finishesTable` on the stored IDs and returns
`variantName` / `fabricName` / `finishName`. `Cart.tsx` (lines ~142-158) then
renders `Finish: {variantName}` and `Fabric: {fabricName}`. The fix is to make
the wishlist do the same thing.

## What this task is NOT

Read these carefully. Violating any of them is a failed task.

- **Do NOT make wishlist items purchasable.** Wishlist items must never gain an
  add-to-cart, checkout, buy, or "convert to order" path. Their entire purpose
  is to be saved WITHOUT entering the cart. You are only adding read-only display
  of already-saved selections. Do not add any mutation, any price calculation,
  any cart insertion.
- **Do NOT touch any payment path.** Do not modify, import, or call anything in
  `lib/authorizeNet.ts` or any cart/checkout/payment route. This task does not go
  near payment. If you find yourself editing a payment file, stop, you are off
  course.
- **Do NOT modify the cart** (`routes/cart.ts`, `Cart.tsx`). It is the reference
  implementation to COPY FROM, not to change.
- **Do NOT change the wishlist WRITE path.** The insert in
  `routes/wishlist.ts` (the `POST /wishlist` handler) already saves the three IDs
  correctly. Do not alter it.
- **Do NOT add or drop database columns.** No schema migration. The columns
  already exist. This is a read/join/render task only.
- **Do NOT repurpose `variant_label`.** Leave that column and its existing
  display logic alone. A future task will use it for size variants. It is out of
  scope here.
- **Do NOT "fix" anything else you notice.** If you spot other issues, list them
  at the end of your report. Do not touch them.

## Files in scope (only these)

Server:
- `artifacts/api-server/src/routes/wishlist.ts` (customer GET / loadWishlist)
- `artifacts/api-server/src/routes/adminWishlists.ts` (staff wishlist API)

Client (customer):
- `artifacts/web/src/pages/Wishlist.tsx`
- `artifacts/web/src/pages/AccountWishlist.tsx`

Client (staff):
- `artifacts/web/src/staff/pages/admin/WishlistDetail.tsx`
- `artifacts/web/src/staff/pages/admin/WishlistPrint.tsx`

Server-rendered documents:
- `artifacts/api-server/src/lib/wishlistPdf.tsx`
- `artifacts/api-server/src/lib/email.ts` (wishlist outreach email only)

API contract (only if a response type needs the new fields):
- The relevant zod response schemas for the wishlist GET and admin wishlist
  endpoints. If these are orval-generated from an OpenAPI source, update the
  SOURCE spec and regenerate, do not hand-edit generated files. State clearly in
  your report which source file you changed and what regeneration command you ran.

## The three selection types to resolve

Each wishlist_items row may carry any combination of:
- `selected_finish_id` -> resolve to `finishes.name` (join `finishesTable`)
- `selected_fabric_id` -> resolve to `fabrics.name` (and `fabrics.item_number`
  if you want to match the cart's "Aruba (5416)" format) (join `fabricsTable`)
- `selected_table_top_tile_id` -> this is also a row in `finishes` (table-top
  tiles are stored as finishes). Resolve to `finishes.name` via a SECOND join to
  `finishesTable` (aliased) on `selected_table_top_tile_id`.

All three are nullable. Use LEFT joins so an item with no selection still returns.
Render a line only when its name is non-null (mirror the cart's
`{item.fabricName ? (...) : null}` pattern).

## Display labels

Match the cart's visual style ("Finish: X", "Fabric: Y"). Use these labels:
- finish -> `Finish:`
- fabric -> `Fabric:`
- table-top tile -> `Tile:`

Keep it read-only text, same typographic treatment as the cart's selection lines.

## Numbered steps, each with a check-in gate

Do these IN ORDER. After each numbered step, STOP and paste the raw diff for
that step plus the actual command output requested. Do not proceed to the next
step until told to continue. Do not batch multiple steps into one diff.

### Step 1 — Customer GET resolves names
In `routes/wishlist.ts`, in the `loadWishlist` select, add LEFT joins to
`finishesTable` (twice, aliased: one for finish, one for tile) and `fabricsTable`
(for fabric), and add `finishName`, `fabricName`, `fabricItemNumber`, and
`tileName` to the selected columns. Model it directly on `cart.ts` lines 124-166.
Return these new fields in the response mapping.

**Check-in:** paste the diff of `wishlist.ts`. Paste the output of a curl (or
equivalent) to `GET /wishlist` for a test wishlist that has a finish+fabric saved,
showing the resolved names now appear in the JSON. If the response type is
schema-validated, show the schema change too.

### Step 2 — Customer wishlist pages render the names
In `Wishlist.tsx` and `AccountWishlist.tsx`, render the resolved
finish/fabric/tile lines under each item, only when present. Mirror the JSX from
`Cart.tsx` lines ~142-158.

**Check-in:** paste both diffs. Describe (or screenshot) the customer wishlist
now showing "Finish: … / Fabric: …" for a configured item.

### Step 3 — Staff wishlist API resolves names
In `adminWishlists.ts`, in BOTH query blocks that currently select
`variant_label` (around lines 241 and 431), add the same LEFT joins and select
`finishName` / `fabricName` / `fabricItemNumber` / `tileName`. Return them in
both response mappings (around lines 298 and 451). Leave `variantLabel` selection
in place, unchanged, alongside the new fields.

**Check-in:** paste the diff. Paste the JSON from the admin wishlist detail
endpoint for the same test wishlist, showing the resolved names.

### Step 4 — Staff surfaces render the names
In `WishlistDetail.tsx` and `WishlistPrint.tsx`, render the finish/fabric/tile
names for each line item (in addition to the existing `variantLabel` render,
which stays). Keep it consistent with how the rest of the staff line item is
displayed.

**Check-in:** paste both diffs. Confirm the staff wishlist detail view now shows
the selections.

### Step 5 — PDF and outreach email
In `wishlistPdf.tsx` and the wishlist outreach section of `email.ts`, add the
finish/fabric/tile names to each item (again, alongside existing `variantLabel`).

**Check-in:** paste both diffs. Note which email function you touched and confirm
you did not alter any other email.

### Step 6 — Full typecheck + build
Run the workspace typecheck and build. Paste the actual command and its full
output (not a summary). If anything fails, fix only what your own changes broke;
do not touch unrelated failures, report them instead.

## Guardrails restated

- Every change is additive display logic. No writes, no payment, no cart, no
  schema, no `variant_label` repurposing, no making wishlist items purchasable.
- If any step requires touching a file not in the "in scope" list, STOP and ask
  before doing it.
- If you cannot determine something, write "I could not determine this" rather
  than guessing.
- Report every file you changed with its path. A report with no file paths means
  you did not actually do the work.

## Definition of done

Customer wishlist page, account wishlist page, staff wishlist detail, staff
wishlist print, wishlist PDF, and wishlist outreach email all display the saved
finish / fabric / table-top-tile names for a configured wishlist item, resolved
from the existing ID columns exactly as the cart does, with zero change to write
paths, payment, cart, or schema, and wishlist items remain non-purchasable.
