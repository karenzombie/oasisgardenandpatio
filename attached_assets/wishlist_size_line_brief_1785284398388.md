# Agent Brief: Show the saved variant size on the customer wishlist

## Context and problem

When a customer saves a product with a size (variant) selection to the wishlist,
the size is stored correctly. The row carries `wishlist_items.variant_label`
(for example `24" Square`) and `wishlist_items.variant_id`, and the real variant
SKU already displays. But the customer wishlist pages do not show the size
anywhere. The customer sees the SKU and the finish, with no size line.

This is customer-side only. The staff wishlist detail, staff wishlist print, the
wishlist PDF, and the outreach email already render the size. They work because
the admin response schema (`AdminWishlistItem`) declares `variantLabel`. The
customer path does not, end to end:

1. The customer GET handler in `artifacts/api-server/src/routes/wishlist.ts`
   selects `finishName`, `fabricName`, `tileName`, and the resolved variant SKU,
   but never selects `wishlist_items.variant_label`.
2. The `WishlistItem` schema in `lib/api-spec/openapi.yaml` (near line 8853) has
   `finishName`, `fabricName`, `tileName`, but no `variantLabel` property.
3. The GET response is validated with generated zod (`GetWishlistResponse.parse`)
   which strips any field the schema does not declare, so even a returned
   `variantLabel` would be dropped.
4. The two customer pages have no `variantLabel` field on their generated type,
   so they cannot render it.

## Goal (one coherent change, universal)

Surface the saved size on both customer wishlist pages, for any product from any
manufacturer that has a variant selection. The size must render as the bare
stored value (for example `24" Square`) with no prefix label, matching exactly
how the staff detail, print, PDF, and email already render it. Do not add a
`Size:` prefix. The stored data is bare, and the label is never stored, so
nothing new is hardcoded.

## The full chain to change (do all four, in this order)

The pieces depend on each other. The type must exist before the pages can render
it, so do the contract and backend first, then the UI.

1. **OpenAPI schema** (`lib/api-spec/openapi.yaml`, `WishlistItem` schema near
   line 8853). Add a `variantLabel` property as `type: ["string","null"]`, exactly
   like the sibling nullable fields (`finishName`, `fabricName`, `tileName`). Then
   add `variantLabel` to this schema's `required` list. Every property in this
   schema is listed as required, including the nullable ones, so `variantLabel`
   belongs there too. Reference: the `AdminWishlistItem` schema near line 6142
   already declares `variantLabel` the same way. Do not change `AdminWishlistItem`.

2. **Regenerate the client and zod** from the spec. Orval has TWO targets and
   both must be regenerated, because the customer flow depends on both:
   - the React client (`lib/api-client-react`), which gives the two pages a
     `variantLabel` field on their type, and
   - the server zod (`lib/api-zod`), whose `GetWishlistResponse` schema is what
     the GET handler runs `.parse()` through. That parse is exactly what strips
     `variantLabel` today, so if only the client is regenerated, the field still
     never reaches the page.

   The single command that does both is the `codegen` script in
   `lib/api-spec/package.json` (`orval --config ./orval.config.ts` followed by the
   libs typecheck). Run that script, do not hand-run orval for one target, and do
   not hand-edit any generated file. State the exact command you ran.

3. **Customer GET handler** (`artifacts/api-server/src/routes/wishlist.ts`, the GET
   select near line 160). Add `variantLabel: wishlistItemsTable.variantLabel,` to
   the select, alongside `finishName` / `fabricName` / `tileName`. The response
   map already spreads `...r`, so once selected and once the schema allows it, it
   flows through. This select lives in the shared loader that every wishlist
   endpoint returns through (the GET plus add and remove all funnel through it),
   so this one edit covers all of them and the required field is always supplied.
   Do not change the SKU resolution (`sku: r.variantSku ?? r.sku`) or anything
   else in that handler.

4. **Both customer wishlist pages.** In `artifacts/web/src/pages/AccountWishlist.tsx`
   and `artifacts/web/src/pages/Wishlist.tsx`, add a size line rendered as the
   bare `item.variantLabel`, placed immediately AFTER the `SKU {item.sku}` line
   and before the Finish line, so the size sits with the SKU. Guard it with
   `item.variantLabel ? ( ... ) : null` so products with no variant show no line.
   Style it like the sibling option lines already in that block (the same
   `text-xs` treatment), but with NO prefix span. It is just the value.

## Hard guardrails: what you must NOT touch or regress

- **Do not touch the write path.** The POST add-to-wishlist handler already
  stores `variant_label` and `variant_id` correctly. Leave it alone.
- **Do not touch the staff or admin wishlist surfaces**, the wishlist PDF, or the
  outreach email. They already render the size. This change is customer pages
  only, plus the customer GET, the `WishlistItem` schema, and regen.
- **Do not change `AdminWishlistItem`** or any admin schema or query.
- **Do not hand-edit generated files.** Change `openapi.yaml` and regenerate.
- **Do not change the SKU resolution** or the finish / fabric / tile lines, their
  order, or their styling.
- **Do not add a `Size:` prefix** or any hardcoded label. Bare value only.
- Do not modify any file not required by this change.

## Files in scope

- `lib/api-spec/openapi.yaml` (`WishlistItem` schema: add `variantLabel`)
- Generated client and zod (via regeneration only, not by hand)
- `artifacts/api-server/src/routes/wishlist.ts` (customer GET select)
- `artifacts/web/src/pages/AccountWishlist.tsx` (render bare size line)
- `artifacts/web/src/pages/Wishlist.tsx` (render bare size line)

## Check-in gate

Do the whole chain, then STOP and paste all of the following. Do not deploy.

- The `openapi.yaml` diff for `WishlistItem`.
- The exact regeneration command you ran, and diffs showing `variantLabel` is now
  present in BOTH generated outputs: the customer React client wishlist item type,
  AND the `GetWishlistResponse` server zod schema in `lib/api-zod`.
- The `routes/wishlist.ts` GET select diff.
- The diffs for both customer pages.
- Evidence the data now arrives: paste the customer GET wishlist response JSON for
  the account that has the City Series Porcelain Tops row saved, showing the item
  now carries `variantLabel` (for example `"24\" Square"`). This is a plain page
  load and API call, no click or dialog needed.
- Evidence it renders: show the customer wishlist page displaying the bare size
  under the SKU, with no `Size:` prefix.
- Confirm a wishlist item with NO variant (any finish-only product) shows no
  stray size line (the guard renders nothing when `variantLabel` is null).
- Confirm you did not touch the staff wishlist, the PDF, or the email.
