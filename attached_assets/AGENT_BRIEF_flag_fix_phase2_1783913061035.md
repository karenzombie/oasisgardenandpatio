# Agent brief: visibility flag fix, Phase 2 (schema + code)

## Context

A code audit and data audit established that `available_online` is carrying two meanings at
once: the storefront listing queries read it as "appears in listings" while the admin UI
(per the visibility flags brief) writes it as "can be purchased online." This phase separates
the two meanings with one new column and a small set of code changes.

Phase 1 (data coherence) is already committed. Do not modify any product row data in this
phase. This phase is schema and code only.

## Ground rules

- Dev environment only.
- ADDITIVE schema change only. Do not drop, rename, or alter any existing column.
- Do not modify any data in `products` beyond the single backfill statement specified below.
- Do not refactor anything outside the files and lines named here.
- If anything is ambiguous or does not match what you find in the code, STOP and ask Karen.
  Do not improvise.
- Complete the steps IN ORDER and check in with Karen after each numbered step.

## Step 1 -- new column

Add to the `products` schema (Drizzle) and push:

    catalog_visible: boolean, NOT NULL, DEFAULT true

Backfill in the same change, one statement:

    UPDATE products SET catalog_visible = available_online;

This copies today's visibility truth into the new column. After this step, `catalog_visible`
answers "does this product appear in customer listings" and nothing reads it yet, so nothing
changes behavior. Verify: `SELECT COUNT(*) FROM products WHERE catalog_visible IS DISTINCT
FROM available_online;` must return 0.

## Step 2 -- storefront listing queries switch to catalog_visible

Replace the `eq(productsTable.availableOnline, true)` base condition with
`eq(productsTable.catalogVisible, true)` in exactly these places:

- `products.ts` line ~201 (GET /products base conditions)
- `products.ts` line ~379 (/catalog/collections)
- `products.ts` line ~443 (/catalog/facets buildConditions)
- `categories.ts` line ~34 (existence filter)
- `manufacturers.ts` line ~29 (existence filter)

Because the backfill made the two columns identical, this switch changes NO behavior today.
That is intentional. It makes the later semantic separation safe.

Do NOT touch:
- `cart.ts` line ~374 (`if (!product.availableOnline)`) -- purchasability check, stays
- `checkout.ts` line ~358 -- stays
- The `onlineOnly=true` filter blocks (quoteOnly / inStoreOnly conditions) -- stay
- The wishlist and PDP routes -- stay as they are

## Step 3 -- server-side price safety net in cart

In `cart.ts`, in POST /cart/items after the existing availableOnline and quoteOnly checks
(lines ~374-381), add a guard: if the product has no usable price (price, sale_price and msrp
all null or zero, matching however the PDP computes hasPrice -- check `Product.tsx` line ~834
for the exact fields used and mirror them), reject with 400 and a message consistent with the
existing rejection messages.

Mirror the same guard in `checkout.ts` where line ~348 validates cart lines.

This is Karen's requirement: a product that is visible and purchasable but has no price must
never be sellable. Today that guard exists only in the frontend.

## Step 4 -- admin UI: expose the two toggles distinctly

In the product edit screen (ProductEdit.tsx), Visibility and Flags section:

- Add a "Visible in catalog" toggle wired to `catalog_visible`. Place it in the Product
  status group, above Available Online.
- Tooltip On: "Product appears in customer search, category, and manufacturer listings."
- Tooltip Off: "Product does not appear in any customer listing. Use for component products
  (cushion inserts, top covers) that customers select through options on another product's
  page."
- The existing Available Online toggle keeps its current wiring (available_online +
  show_price_online + quote_only per the original visibility brief Section 2B). Its meaning
  is now purely purchasability, which is what its tooltip already says.

## Step 5 -- status bar rewrite

Same file, VisibilityStatusBar (~lines 3343-3391). Replace the branch logic with:

1. `!isActive` -> red: "Product is archived and hidden from customers. Toggle Active to
   restore it."
2. `!catalogVisible` -> grey: "Not shown in customer listings. Reachable only through
   product options or a direct link."
3. `catalogVisible && !quoteOnly` -> green: "Live and purchasable online."
4. `catalogVisible && quoteOnly && !showPriceOnline` -> amber: "Inquiry mode -- price
   hidden, customers must call or request a quote."
5. `catalogVisible && quoteOnly && showPriceOnline` -> blue: "Inquiry mode -- price
   visible, but customers must call or request a quote to purchase."

## Step 5B -- warn on flipping an unpriced product to purchasable

The client will routinely flip products from inquiry mode to purchasable via the Available
Online toggle. If the product has no usable price at that moment (same hasPrice logic as
Step 3), the server-side guard from Step 3 will correctly block checkout, but the client
would have no idea why.

In the product edit screen: when Available Online is toggled ON and the product has no
usable price, show a clearly visible warning in or directly beneath the status bar:

  "This product has no price. Customers will see Add to Cart but will not be able to
  complete checkout until a price is entered."

Warn only. Do not block the save. The client may be entering the price immediately after.

## Step 6 -- Active tooltip rewording

The Active toggle currently says Off means "permanently archived... retire a product for
good." Karen's intent is a reversible hide (discontinued or out-of-stock items) with no
product ever deleted. Reword:

- On: "Product is live in the system and subject to the other visibility controls."
- Off: "Product is hidden from all customer pages and staff order screens. It stays in the
  admin product list and can be re-activated at any time. Products are never deleted."

No logic change. Wording only.

## What success looks like

- `catalog_visible` exists, backfilled, and drives all five listing queries
- No product's storefront behavior changed in this phase (the backfill guarantees it)
- Cart and checkout reject unpriced items server-side
- The admin edit screen shows both toggles with the new status bar
- No column dropped, no data modified beyond the single backfill

## Verification the agent must run and report

1. `SELECT COUNT(*) FROM products WHERE catalog_visible IS DISTINCT FROM available_online;`
   -> 0
2. Storefront search for "Timber" returns the newly visible tables (unchanged from before
   this phase)
3. SKU 2542SBSH appears in Shadow Rock listings (unchanged from before this phase)
4. SKU 9435P does NOT appear in any listing (component, hidden)
5. A product with no price cannot be added to cart via a direct API call
