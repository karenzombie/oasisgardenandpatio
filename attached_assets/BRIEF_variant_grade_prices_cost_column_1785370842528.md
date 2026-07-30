# Agent Brief: Add staff-only `cost` column to `variant_grade_prices`

## Objective

Add a `cost` column to the `variant_grade_prices` table so per-grade cost can be
stored alongside the existing `msrp` and `sale_price`. Surface it in the staff
product config UI where grade prices are edited. It is staff-only and must never
appear on any customer-facing surface.

Do the schema and code work only. Do NOT populate or backfill any cost values.
The data load is handled separately outside this task.

---

## Absolute constraints (do not violate)

1. **`cost` is staff-only and permanent.** It must never be readable by a
   customer through any endpoint, payload, PDP, cart, wishlist, or quote view.
   `variant_grade_prices` already feeds customer-facing pricing (grade-mode PDP),
   so the real danger is cost riding along in that same serializer. Adding the
   column is easy. Keeping it out of the customer path is the actual job.

2. **Do NOT run `drizzle-kit push`.** Apply the column to the database with a
   plain SQL `ALTER TABLE`, and update the Drizzle schema file to match. Then
   prove schema and DB agree with zero drift using this repo's own drift-check
   method (report that method in Gate 1). No push, ever.

3. **Dev only.** Do not touch the production database in this task.

4. **Do not modify anything outside this column's footprint.** Do not change the
   existing `msrp` or `sale_price` columns, existing pricing logic, the customer
   PDP pricing math, cart, checkout, or wishlist behavior. Do not refactor
   adjacent code.

5. **Do not backfill or write any cost values.** The column is created empty
   (NULL) for all existing rows. Populating it is a separate shell task.

6. **Reporting export of cost is out of scope.** Do not build any export.

---

## Column spec

- Table: `variant_grade_prices`
- New column: `cost`
- Type: mirror the exact type and precision of the existing `msrp` column on
  the same table (numeric). Do not guess precision, copy what `msrp` uses.
- Nullable: YES. Existing rows (for example umbrella fabric grades) have no cost
  and must stay NULL. A NOT NULL column would break the migration on existing
  rows.
- No default value.

---

## Gate 1: Discovery. Report before changing anything.

Paste **raw command output and file excerpts, not prose summaries.** Do not
proceed to Gate 2 until this is reviewed and approved.

Report the following:

1. The current Drizzle schema definition of `variant_grade_prices` (paste the
   actual table definition block from the schema file, with its file path).

2. Every location that reads or serializes `variant_grade_prices` rows. Grep the
   codebase and list each file and line where grade-price rows are selected,
   mapped into a response, or sent to a client. For each one, state whether it is
   a **customer-facing** path (PDP, cart, wishlist, quote, public product API) or
   a **staff-facing** path (admin/staff product config, internal tooling).

3. The staff product config UI component(s) where grade prices (`msrp` /
   `sale_price`) are currently displayed and edited (paste file path and the
   relevant JSX/handler lines).

4. Whether grade prices flow through an OpenAPI spec / generated client
   (for example `openapi.yaml` + Orval). If yes, identify the schema object for
   grade prices and note which generated types would need the field.

5. How this repo verifies schema-vs-database drift (the configured drizzle-kit
   commands and migration workflow). Do not push. Just report the method so
   Gate 2 can use it.

6. **Staff-only path vs shared path.** State clearly whether there is a
   staff-only serializer/endpoint for grade prices that customers never hit, or
   whether staff and customers read grade prices from the same shared endpoint.
   If the ONLY path that serves grade prices is shared with customers, **STOP
   after Gate 1 and report that.** Do not add `cost` to a shared payload and do
   not improvise role-gating on your own. We will decide the approach together
   before any code changes.

---

## Gate 2: Schema + database column. Report with proof.

Paste **the raw schema diff, the exact ALTER SQL, and real command output.** Do
not proceed to Gate 3 until reviewed and approved.

1. Add `cost` to the `variant_grade_prices` definition in the Drizzle schema
   file, mirroring the `msrp` column's type, nullable.

2. Apply to the dev DB with plain SQL:
   `ALTER TABLE variant_grade_prices ADD COLUMN cost numeric;`
   (match msrp's exact type in place of `numeric` if msrp is more specific).

3. Prove the column exists and is nullable by pasting the output of an
   `information_schema.columns` query for `variant_grade_prices`.

4. Prove no Drizzle drift using the repo's drift-check method reported in Gate 1
   (NOT push). Paste the output showing schema file and DB now agree with no
   pending changes.

5. Confirm existing rows are untouched: paste a count showing existing
   `variant_grade_prices` rows still exist and their `cost` is NULL.

---

## Gate 3: Staff UI + staff serializer only. Report with proof of exclusion.

Paste **raw diffs and the exclusion proof.** After this gate, UI verification is
done by Karen (the agent cannot screenshot its own work).

1. Surface `cost` in the staff product config UI beside `msrp` and `sale_price`
   in the grade-price editor: display it and allow staff to enter/edit it. Mirror
   exactly how `msrp` handles input, validation, and formatting. Do not invent
   new validation rules.

2. Add `cost` to the staff-facing read and write path for grade prices only
   (and the OpenAPI/generated types for that staff path if applicable).

3. **Prove customer exclusion.** For every customer-facing path identified in
   Gate 1, paste the code showing `cost` is NOT selected into or returned in that
   payload. If any customer path does a broad `SELECT *` or spreads the whole row
   into a response, that path must be changed to explicitly exclude `cost`, and
   you must paste the before/after diff proving the exclusion.

4. Run the typecheck/build and paste the result. It must pass. (A passing build
   does not prove behavior is correct; Karen still verifies the UI. But a failing
   build must be fixed before handing back.)

5. List every file changed in this gate with a one-line reason each.

---

## Out of scope (do not do)

- Populating or backfilling any `cost` values.
- Any cost reporting or export feature.
- Any change to `msrp`, `sale_price`, or existing pricing math.
- Any production database change.
- Any customer-facing display of cost.

---

## Verification (Karen)

After Gate 3, Karen walks the staff product config UI to confirm the cost field
displays and edits correctly, and confirms cost does not appear on the customer
PDP / cart / wishlist. The agent does not perform UI screenshots.
