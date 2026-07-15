# Phase 2 Approval: fix the finishCollections 500 (Option B)

Phase 1 report reviewed and accepted. The diagnosis is correct: `finishCollections` in the
by-slug product payload is missing the required `manufacturerName`, broken since June 4 by a
schema change (`848f161f`) that was never matched in the query. 192 Couture Jardin product
detail pages are affected. Not related to any category work.

Proceed to Phase 2 with the following decisions. Do these on DEV only. Do not deploy, do not
touch production.

## Use Option B, NOT Option A

Implement the fix by joining the manufacturers table in the `finishCollectionRows` query and
selecting the manufacturer name from the finish collection's OWN manufacturer, exactly the way
`fabricOptions` already does it (see products.ts around 1039-1063 for the existing pattern):

- In the `finishCollectionRows` query (products.ts ~892-909), add an inner join to
  `manufacturersTable` on `manufacturersTable.id = finishCollectionsTable.manufacturerId`, and
  add `manufacturerName: manufacturersTable.name` to the selected fields.
- The payload mapping (products.ts ~1403-1406) then carries `manufacturerName` through
  naturally via the existing spread. Confirm it does; do not hardcode the name.

Do NOT use Option A (stamping `row.manufacturerName` onto each entry). Option A assumes the
finish collection's manufacturer always equals the product's manufacturer. That assumption is
currently true by business rule but is not enforced in the database, so Option A would hide a
future data error instead of surfacing it. Option B reads the actual linked manufacturer and
matches the existing fabricOptions convention.

## Verify (paste evidence for each)

1. Run the definitive codegen check and paste the raw output:
   `pnpm --filter ./lib/api-spec run codegen && git status --short`
   A clean tree confirms the generated files match.

2. Curl or load MORE THAN ONE Couture Jardin product, and ideally different TYPES, not just the
   Zoom tables. At minimum:
   - one of the Zoom tables (e.g. `zoom-table-cj`)
   - one Couture Jardin CHAIR or seating item
   - one more Couture Jardin item of any other type
   Confirm each returns HTTP 200 with a valid body, and that `finishCollections` entries now
   carry a real `manufacturerName`. Paste the status and a snippet showing the field populated.

3. Confirm a NON Couture Jardin product (one with no finish collections) still loads 200, so the
   change did not regress the empty-finish-collections path.

## Scope limits
- Dev only. No deploy. No production access.
- No schema migration. The schema is already correct; only the query/mapping needs to catch up.
- No changes to product data, categories, or sub_categories.
- One root cause, one change. If you believe you have found an additional issue, STOP and report
  it rather than fixing it.
