---
name: Recovering which rows a dev-only mutation touched
description: Prod is NOT a reliable snapshot for reversing a dev mutation; recover the affected row-set with a text-equality join + count gate.
---

When a dev-only bulk UPDATE has already destroyed the marker that distinguished
the affected rows (e.g. nulled a column so "was-duplicate" and "was-already-null"
rows now look identical), do NOT assume prod is a clean pre-mutation snapshot to
recover the set.

**Why:** dev is source of truth and prod lags; dev/prod drift is normal. In one
case prod showed 277 "duplicate" rows for a manufacturer while the dev mutation
had only touched 238, and 37 prod SKUs didn't even exist in dev. A naive
"apply prod's set to dev" would have corrupted ~39 rows — a safety gate on the
expected count caught it.

**How to apply:**
1. Gate on the known affected count; abort if the candidate set differs.
2. Recover the exact set with a JOIN that matches on a stable key (SKU) AND on the
   *unchanged* column's text (here `description`, which the mutation never touched):
   load prod candidates into a TEMP table via `\copy`, then
   `JOIN ... ON sku AND dev.untouched_col = prod.text`. Text-equality excludes
   drift rows (same SKU, different text) automatically.
3. Verify the matched count equals the mutation's reported row count before writing.
   In the real case this produced exactly 238 (= the original UPDATE count), with
   the 2 SKU-matches-but-text-differs rows correctly excluded and flagged.
4. Cross-DB writes: `pg` is not importable from the workspace root in the JS
   sandbox — use `psql` (heredoc + `\copy` to a temp table) for dev writes.
