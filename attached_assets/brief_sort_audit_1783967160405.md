# BRIEF: Read-Only Audit of Product Sort Order and Base Recommendation Logic

## THIS IS AN AUDIT. YOU WILL FIX NOTHING.

You are **forbidden** from changing any code, schema, or data in this task.

- Do not "fix" anything you find, no matter how obviously broken it looks.
- Do not refactor, tidy, rename, or improve.
- Do not add a migration. Do not run `drizzle-kit push`.
- Do not touch the database at all.

Your only output is a written report. If you find a bug, **write it down and leave it alone.**
We will decide what to do about it. A helpful repair here can break the live catalog.

If you cannot determine something, write **"I could not determine this"** and say what you
looked at. Do not guess. Do not infer. A guess presented as a finding is worse than a gap.

---

## Required evidence standard

Every single finding must include:

- The **file path**
- The **line number or line range**
- The **actual code**, pasted

A finding with no file path will be rejected as not having actually looked. Prose summaries
are not acceptable. Show the code.

---

## Check in after each numbered step

Do steps 1 through 5 in order. **Stop after each one and report before moving to the next.**
Do not batch all five and deliver at the end.

---

## Background you need

The `products` table has a column `display_order`, type `integer`, `NOT NULL DEFAULT 0`.

Confirmed by direct query, so treat these as facts, not hypotheses:

- 3,612 products total
- 3,260 have `display_order = 0`
- 352 have a non-zero `display_order`
- Those 352 belong to only two manufacturers: O.W. Lee (248) and Treasure Garden (104)
- **All 239 products in the Replacement Parts category have `display_order = 0`**

That last one matters. Replacement parts are reportedly being pushed to the bottom of listings
already. It is **not** `display_order` doing it, because every one of them is at 0. Something
else is doing it. Finding out what is a core goal of this audit.

---

## STEP 1: Find every product sort

Locate **every** query, route, or component that returns a list of products to a user, on the
customer storefront and in the admin. For each one, report:

- File path and line range
- The exact `ORDER BY` clause, or the sort function if it sorts in JavaScript
- What surface it powers, in plain terms (example: "the category listing page sidebar results")
- Whether it references `display_order`, and if so, exactly how

Known surfaces to cover, though this list may not be complete and you should say so if you find
more:

- Category listing pages
- Manufacturer product listing pages
- The products menu / main product browse
- Search results
- Any "direct ship" or "purchase online" filtered view
- The admin products list

Files already known to contain listing queries, as a starting point and not a limit:

- `products.ts` (around lines 201, 379, 443, 668)
- `categories.ts` (around line 34)
- `manufacturers.ts` (around line 29)

---

## STEP 2: Find what sinks Replacement Parts

Something is causing Replacement Parts to sort to the bottom rather than alphabetically.
It is not `display_order`. Find what it actually is.

Report:

- The file path and line number of the rule
- The exact code
- Whether it is hardcoded to the Replacement Parts category specifically, or to a category ID,
  or to a name pattern, or something else
- **Which surfaces it applies to, and which it does not.** This is the key question. If it was
  only added to one query, then parts sink on one page and float on the others.

If you cannot find any such rule, say so explicitly. It is possible the behavior was never
actually implemented, or was implemented and later lost.

---

## STEP 3: Determine whether `display_order = 0` is a real rank or a null stand-in

Given 3,260 products sit at 0 and 352 do not, and given 0 sorts before 1 in an ascending
integer sort, answer:

- Does any storefront query sort by `display_order`?
- If yes, do the 3,260 zero-value products therefore appear **before** the curated ones?
- Is there any special handling of 0, such as `NULLIF`, a `CASE`, a conditional, or a
  secondary sort key?
- What is the tiebreaker when two products share a `display_order` value?

Trace these two **real** products, both in the Umbrella Bases category, both Treasure Garden:

| SKU | Name | display_order |
|---|---|---|
| `BA150` | Commercial | 28 |
| `AMK-G` | In-Ground Mount Kit | 0 |

On the customer-facing Umbrella Bases listing, **which of these two appears first, and why?**
Answer with the code path that decides it, not with an assumption.

---

## STEP 4: Determine how base recommendations are built

Umbrella product pages show recommended umbrella bases. The recommendations are manufacturer
scoped: Galtech umbrellas recommend Galtech bases, Treasure Garden recommends Treasure Garden,
Frankford recommends Frankford.

Find the code that produces these recommendations and answer **precisely one** of the
following, with the code to prove it:

- **(A)** It reads explicit rows from the `product_recommendations` table
- **(B)** It derives the match at query time from product fields such as `manufacturer_id`,
  `category_id`, `sub_category`, `umbrella_type`, or similar
- **(C)** Something else entirely, which you will describe

**This is the highest-stakes question in the audit.** If the answer is (B) and it reads
`sub_category`, then `sub_category` is load-bearing in code and we cannot safely reorganize it.
If the answer is (A), we can.

Trace this **real** product: Galtech umbrella SKU `737`, "Deluxe Auto Tilt Umbrella 9'",
product id `3376`, category 38, sub_category "Market".

Show the exact code path that produces its recommended bases, and state which fields that code
reads.

---

## STEP 5: Report the admin bulk update surface

There is an existing bulk update modal on the admin products list. It appears when products are
selected and currently offers: Status, Featured, In-store only, Available online, Category,
Brand / vendor, a pricing adjustment section, Fabric brand pools, and Individual fabric picks.
Every field defaults to "No change."

Report:

- The file path of the bulk update modal component
- The file path of the API route or handler that applies the bulk update
- How a new field would be added to it, described in terms of the actual files that would need
  to change
- Whether `sub_category` is currently exposed anywhere in the admin UI at all, either on the
  bulk modal or on the individual product edit page, and if so where

Do not add anything. Just report what is there and what adding to it would involve.

---

## What you must NOT touch

- Any database table, in dev or prod
- Any schema file or Drizzle definition
- The `flag_fix_backup_phase1`, `flag_fix_backup_phase1b`, and `flag_fix_backup_phase3` tables,
  which must never be dropped
- Any listing query, sort, or recommendation logic
- Any admin component

---

## Deliverable

A written report, one section per step, every finding carrying a file path, a line number, and
the actual code.

Where you are unsure, say **"I could not determine this."** That is a perfectly acceptable
answer and is far more useful than a confident guess.
