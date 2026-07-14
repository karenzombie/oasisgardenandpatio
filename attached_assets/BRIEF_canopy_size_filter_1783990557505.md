# Brief: Canopy Size Filter (Umbrellas)

## Scope

Add a canopy size filter to the Umbrellas sidebar. This brief covers **schema, API, and
frontend only**.

**Do NOT leave data in the table.** Population is handled by a separate script that runs outside
this task. A bounded smoke test is allowed and described in section 6, but the table must be
**empty when you finish**. Do not decide on your own to fill it.

**Do NOT touch `products.umbrella_shape` or `products.umbrella_type`.** Shape is explicitly out
of scope. It was never requested by the client and its CHECK constraint cannot represent several
manufacturers' values. Leave both columns exactly as they are.

---

## 1. Schema

New junction table. It mirrors `product_materials` in query shape and filter behavior, but see
section 3 for one important way it differs.

```sql
CREATE TABLE product_umbrella_sizes (
  product_id  integer NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size_label  text    NOT NULL,
  PRIMARY KEY (product_id, size_label)
);

CREATE INDEX idx_product_umbrella_sizes_size_label
  ON product_umbrella_sizes (size_label);
```

Notes:

- A product can have many sizes. Most Frankford umbrellas have four or five. The composite
  primary key enforces uniqueness. Do not add a surrogate `id` column.
- `size_label` is free text on purpose. There is no enum, no lookup table, and no CHECK
  constraint. The label set is data, not code, and it grows as manufacturers are added.
- Add the matching Drizzle schema definition alongside the existing `product_materials`
  definition.

### drizzle-kit push warning

`drizzle-kit push` compares the code schema against the live DB and will offer to **drop any
table it does not recognize**. There are raw-SQL backup tables in this database
(`flag_fix_backup_*`, `display_order_prod_backup_*`) that it does not know about.

**Never accept a push that drops them.** If push proposes any destructive action, abort and use
a direct `CREATE TABLE` / `CREATE INDEX` instead. Report exactly what push offered to do.

---

## 2. Where the facet options come from

**Read this before writing the facet. It is the one place where copying `product_materials`
will lead you wrong.**

The materials facet is backed by a `materials` lookup table with `id`, `name`, and
`display_order`, and the sidebar reads its option list from that table.

**There is no equivalent lookup table for sizes, and you must not create one.** The option list
is derived from the data itself: the distinct `size_label` values present in
`product_umbrella_sizes`, scoped to the products in the current result set, the same way the
facet decides which materials to show.

So: no `umbrella_sizes` table, no enum, no hardcoded array of labels in the frontend. Distinct
values out of the junction table, sorted per section 3.

---

## 3. Label ordering

**Alphabetical sorting is wrong** and will look broken: it puts `10'` and `11'` ahead of `7.5'`
and buries `9'` at the bottom. There is also no `display_order` column to lean on, because there
is no lookup table.

Sort in application code, with three keys in this order:

1. **Single-dimension labels before multi-dimension labels.** A label containing a lowercase `x`
   is multi-dimension.
2. **Numeric, ascending, on the leading number.** Parse the number at the front of the label.
   `7.5` before `9` before `10`.
3. **Numeric, ascending, on the second number** for multi-dimension labels. This key matters:
   `8'x8'`, `8'x10'`, and `8'x11'` all tie on the leading number, and without a third key they
   land in arbitrary order.

The full expected ordering, once populated:

```
6'   7.5'   9'   10'   11'   11.5'   13'
3.5'x7'   6'x6'   8'x8'   8'x10'   8'x11'   10'x10'   10'x13'
```

Numbers may be decimal (`7.5`, `11.5`, `3.5`). Parse accordingly. Do not rely on the database to
return options in order.

---

## 4. Filter behavior

- Filter with an `EXISTS` subquery against `product_umbrella_sizes`. Do not JOIN, and do not
  reach for `SELECT DISTINCT` to clean up duplicated product rows.
- Multi-select within the facet is **OR**. Checking `9'` and `11'` shows both.
- Across facets it is **AND**. Size AND collection AND material.
- A product with no rows in the junction table never matches a size filter. It still appears
  normally when no size is selected. This is correct and expected.

**No bucketing.** Labels are flat and exact. Someone searching for `6.5'` must not be offered
`6'`. Do not group, round, or range these values anywhere.

### Where the facet renders

Only where umbrella sizes actually exist in the current result set. It should appear on the
Umbrellas category page and on umbrella-carrying manufacturer pages, and must not appear on, for
example, the O.W. Lee brand page, which has no umbrellas. Follow whatever the materials facet
already does to decide whether to render itself.

---

## 5. API and codegen

- Add the size filter as a query parameter on the product list endpoints, matching how the
  materials filter parameter is already declared. It is an array of strings.
- Update the openapi spec.
- **Run codegen. Do not hand-write generated files.**

That is not a style preference. On the previous task, generated files were written by hand, they
compiled cleanly, they passed typecheck, and they were **missing an entire file plus an enum
entry**. A green typecheck proved nothing. The generator is the source of truth.

`pnpm-workspace.yaml` already pins `js-yaml: '>=4.2.0 <5'`. That pin is what makes codegen work.
Do not change it and do not remove the upper bound.

---

## 6. Smoke test (optional, and it must clean up after itself)

The table ships empty, which means you cannot see the filter do anything. If you want to verify
it end to end, you may insert a small number of temporary rows, confirm the facet renders and
filters, and then **delete every row you inserted**.

Hard requirement: `SELECT count(*) FROM product_umbrella_sizes` must return **0** when you are
done. Any row you leave behind is wrong data that will collide with the population script.

If you run a smoke test, say so, and say what you inserted and that you removed it.

---

## 7. Verification

Report the actual observed result of each item. Do not report a phase complete without having
observed its result.

1. `product_umbrella_sizes` exists with the composite primary key and the index. Verify by
   querying `information_schema.columns`, `information_schema.table_constraints`, and
   `pg_indexes` (**do not assume `psql` is available in this shell**; Node's `pg` module is not,
   so use Python and psycopg2). Paste the query output.
2. `SELECT count(*) FROM product_umbrella_sizes` returns **0**.
3. Codegen was **run**, not hand-written. State the command, paste its output, and confirm which
   generated files changed on disk.
4. `products.umbrella_shape` and `products.umbrella_type` are unchanged.
5. No lookup table for sizes was created, and no size labels are hardcoded in the frontend.
6. With the table empty, the size facet correctly does not render (there are no options). Say
   that explicitly rather than claiming the filter "works."
7. No backup tables were dropped.

If any step cannot be completed, stop and say which one and why. A partial result reported
honestly is far more useful than a completed-sounding summary. Do not self-certify.
