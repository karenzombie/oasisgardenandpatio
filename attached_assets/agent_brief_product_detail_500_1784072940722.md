# Agent Brief: Product detail pages returning 500 (investigate first, do not fix yet)

## Ground rules, read these first

1. **This is an investigation task, not a fix task.** Your FIRST and ONLY deliverable right
   now is a written analysis. Do NOT edit any file, run any migration, or change any data
   until a human reviews your analysis and explicitly tells you to proceed. There is a
   STOP gate at the end of Phase 1. Honor it.

2. **Do not assume you know the cause.** A specific hypothesis is described below, but treat
   it as ONE candidate, not the answer. Investigate the whole failure, find every cause, and
   report all of them. If you fix only the named symptom and miss a second one, that is a
   failure of this task.

3. **Read-only until told otherwise.** Inspect code and query the database read-only. Do not
   write to the database. Do not modify schema. Do not "helpfully" apply a fix you are
   confident in. Confidence is not authorization here.

4. **Report evidence, not check marks.** Every claim in your analysis must be backed by a
   pasted query result, a file-and-line reference, or a reproduced error. "Verified" or a
   green check with no evidence is not acceptable.

## The symptom

Some customer-facing product detail pages return HTTP 500. The product appears in search
results (the list query works) but its detail page fails. Confirmed reproduction: the
Couture Jardin "Zoom Table" products (slugs `zoom-table-cj`, `zoom-table-white-cj`,
`zoom-table-anthracite-cj`) and at least one other Couture Jardin product.

The 500 response body is a `ZodError` thrown at:

    artifacts/api-server/src/routes/products.ts  (the res.json(...parse(payload)) call in the
    "catalog product by slug" handler)

The error reports, for many array indices, that `finishCollections[N].manufacturerName` is
`"expected": "string", "received": "undefined", "message": "Required"`.

## One candidate cause (verify or refute, do not assume)

In that same handler, the query that builds `finishCollections` selects `manufacturerId`,
`collectionName`, `panelImageUrl`, `displayOrder`, and `id` from the finish collections
table, but may not select or join a manufacturer NAME. The response schema
(`GetCatalogProductBySlugResponse`, and whatever sub-schema types a finish collection entry)
appears to require `manufacturerName` as a non-optional string. Compare against the
`fabricOptions` mapping in the same handler, which DOES populate `manufacturerName`. If the
finish-collections path never populates it, Zod validation fails and the whole response 500s.

Treat this as a lead. Confirm it against the actual code and schema. Then keep going, because
there may be more.

## Phase 1: INVESTIGATE and REPORT (do this, then STOP)

Produce a written report covering all of the following. Paste evidence for each.

1. **Confirm the failing handler and line.** Identify the exact route handler, the payload
   object it builds, and the `.parse()` call that throws. Quote the relevant lines.

2. **Confirm the schema requirement.** Find the Zod schema for the by-slug response and the
   type used for a finish collection entry. State exactly which fields it requires and whether
   `manufacturerName` (and any sibling fields) are required vs optional.

3. **Confirm what the query actually returns.** Show the finish-collections query in the
   handler. State every field it selects. State specifically whether a manufacturer name is
   selected/joined. Do the same audit for EVERY other array the schema validates in this
   payload (fabricOptions, finishOptions, addonOptions, stemOptions, coverOptions, images,
   recommendations, anything else). For each, confirm whether the query populates every field
   the schema marks required. The goal is to find ALL mismatches, not just the finish one.

4. **Determine the blast radius.** The finish-collections query is filtered by the product's
   `manufacturer_id`. Report:
   - Which manufacturer(s) own rows in the finish collections table.
   - How many products belong to each such manufacturer.
   - Therefore, how many product detail pages are currently at risk of this 500.
   Give real counts from the database, read-only.

5. **Determine when this broke.** Check whether this is a recent regression or long-standing.
   Look at git history / blame for the handler and the schema around the finish-collections
   mapping and the `manufacturerName` requirement. Report whether the requirement was added
   after the query, or the query changed, or neither. If you cannot determine it, say so
   rather than guessing. Do NOT assume recent database category/sub_category changes are
   related; a taxonomy edit was done today, but the finish collections table has no category
   dependency. State whether you find any actual connection.

6. **List every distinct root cause you found**, ranked, each with the file/line and the
   precise fix you would propose. Do not apply them.

### >>> STOP HERE. Post the Phase 1 report and wait for explicit human approval. <<<
Do not proceed to Phase 2 on your own.

## Phase 2: FIX (only after a human approves the Phase 1 report)

Once approved, and only then:
- Apply the approved fixes, one root cause at a time.
- Prefer the minimal correct change. For a missing field, populate it the same way the
  working sibling does (e.g. match how `fabricOptions` supplies `manufacturerName`), rather
  than making the schema field optional, UNLESS the human decides optional is correct.
- After changes, run the definitive codegen check and paste the raw output:
  `pnpm --filter ./lib/api-spec run codegen && git status --short`
- Verify the fix by loading (or curling) the previously-failing product detail endpoints and
  confirming a 200 with a valid body. Paste the evidence.
- Do not deploy. Do not touch production. Dev only. A human handles promotion to prod
  separately.

## Out of scope
- No schema migrations unless the human explicitly asks.
- No changes to product data, categories, or sub-categories.
- No deploy, no production access.
