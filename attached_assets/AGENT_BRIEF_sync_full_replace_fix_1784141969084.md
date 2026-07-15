# Agent brief: fix the dev-to-prod sync (one small code change)

## What this is

The dev-to-prod catalog sync has been failing silently. The cause is isolated:
`scripts/src/dumpDevDataForProd.ts` upserts some tables with `ON CONFLICT (id)`,
which is wrong for tables whose real identity is a natural key, not their `id`.
When dev and prod hold the same row under different ids, the insert collides and
the whole sync aborts.

The fix is to add six tables to the existing `FULL_REPLACE_TABLES` set so those
tables are wiped and reinserted from dev instead of upserted on `id`. All six
have zero incoming foreign keys, so wiping them cannot cascade into any other
table. Dev is the source of truth for all six.

This is a SOURCE EDIT ONLY. Do not run the sync, do not deploy, do not touch the
dev or prod database.

## The one change to make

File: `scripts/src/dumpDevDataForProd.ts`

Find this block:

```ts
const FULL_REPLACE_TABLES = new Set([
  "product_images",
  "product_fabric_pools",
  "product_finish_pools",
]);
```

Replace it with this block (the only difference is the six added table names and
the comment):

```ts
const FULL_REPLACE_TABLES = new Set([
  "product_images",
  "product_fabric_pools",
  "product_finish_pools",
  // Added 2026-07-15: same id-drift class as the three above. No incoming FKs,
  // dev is source of truth. variant_grade_prices had confirmed id drift; the
  // rest are added to prevent the same silent sync failure recurring.
  "variant_grade_prices",
  "finish_collections",
  "product_cover_options",
  "product_cover_finish_prices",
  "product_stem_options",
  "product_addon_grade_prices",
]);
```

## Rules

1. Change ONLY the `FULL_REPLACE_TABLES` set shown above. Do not modify any other
   line, function, comment, or file. Do not reformat or refactor anything else.
2. Do NOT run `dumpDevDataForProd.ts`, `applyDataToProd.ts`, `deploy-sync.sh`, or
   any deploy or sync command.
3. Do NOT connect to, read from, or write to the dev or prod database.
4. Do NOT commit yet.

## Report back and stop

After making the edit, show the `git diff` of the file and stop. Confirm that the
diff contains only the six added table names plus the comment, and nothing else.

Wait for approval before doing anything further. The commit, and the separate
generate / review / apply / verify steps, will be handled after the diff is
reviewed.
