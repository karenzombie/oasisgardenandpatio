# Agent brief: visibility flag code audit (READ ONLY)

## This is an audit. Change nothing.

Do not modify any code. Do not modify the database. Do not modify the schema. Do not "fix"
anything you find. Do not refactor. Do not clean up.

The only deliverable is a written report answering the questions below. If you find something
broken, report it. Do not repair it. A fix will be scoped separately once the report is in.

If any question below cannot be answered from the code with certainty, say so plainly. A
truthful "I could not determine this" is more useful than a confident guess. Do not fill gaps
with assumptions.

## Why

The `products` table has five visibility-related boolean columns:

- `is_active`
- `available_online`
- `show_price_online`
- `quote_only`
- `in_store_only`

A data audit of all 3,612 products found that 2,858 of them (79 percent) are in a flag
combination that the visibility flags brief says should not be possible. The three columns
`available_online`, `show_price_online` and `quote_only` disagree with each other on most of
the catalog. Depending on which column a given piece of code reads, it will reach a different
conclusion about the same product.

Before any data or code is changed, we need to know exactly what the code currently reads and
what each read controls.

## The single most important question

Answer this first, explicitly, before anything else.

**For a product where `is_active = true` and `available_online = false`:**

1. Does it appear in site search results? Yes or no, and name the file and condition.
2. Does it appear in category listings? Yes or no, file and condition.
3. Does it appear in manufacturer product listings? Yes or no, file and condition.
4. Does it appear in the direct ship filter results? Yes or no, file and condition.
5. Is its product detail page reachable at its URL? Yes or no, file and condition.
6. Can a customer add it to their wishlist? Yes or no, file and condition.
7. Can a customer add it to cart or purchase it? Yes or no, file and condition.

A concrete product to trace: SKU `2542SBSH`, product id 5928, Homecrest, Shadow Rock
collection. Its current flags are `is_active=true, available_online=false,
show_price_online=false, quote_only=true, in_store_only=false`.

Do not answer from the admin portal UI text. Answer from the storefront query and route code.

## Full flag read inventory

Search the entire codebase for every read of each of the five columns. For each occurrence
report:

- file path and approximate line
- the exact condition or expression
- what it gates (which query, which route, which UI element)
- whether it is a storefront read, an admin/staff read, or an API read

Cover at minimum: storefront product queries, search, category pages, manufacturer pages,
the direct ship filter, product detail pages, cart and checkout, wishlist, staff order
creation screens, and any API endpoints that return product lists.

Include reads in ORM query builders, raw SQL, and any frontend filtering done after fetch.

## Specific questions

**`in_store_only`.** It is `false` on all 3,612 products. It has never been set to true. Is it
read anywhere in the codebase at all? If yes, where and what does it do?

**`show_price_online` and `quote_only`.** The brief says these two continue to do the backend
work behind the Available Online toggle. Where exactly is each one read, and what does each
one control that the other does not? If they are redundant, say so.

**The admin status bar.** The product edit screen currently shows, for a product with
`available_online = false`, the text: "Hidden from storefront. This product is not visible to
customers and cannot be purchased online."

The visibility flags brief, Section 3, specifies that this state should show an amber bar
reading: "Inquiry mode, price hidden, customers must call or request a quote."

Report which is correct as a description of actual storefront behavior. Is the product hidden,
or is it visible in inquiry mode? Where is this status bar text defined?

**The admin product list.** Does the admin product list or search filter on any of these flags?
Karen searched for `2542SBSH` and could not find it, though it exists and is active.

## Output format

A markdown report. Structure it as:

1. Direct answers to the seven numbered storefront questions above, each with file and condition
2. The full flag read inventory, grouped by column
3. Answers to the specific questions
4. Anything you found that contradicts the visibility flags brief

No code changes. No database changes. Report only.
