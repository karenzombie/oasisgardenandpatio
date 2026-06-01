---
name: Running seed scripts against prod
description: How to target the prod DB from seed scripts and avoid timeouts on large link tables.
---

# Running seed scripts against the production DB

The `@workspace/scripts` seed scripts connect via `DATABASE_URL`. To target
production, override it inline:
`DATABASE_URL="$PROD_DATABASE_URL" pnpm --filter @workspace/scripts run <script>`.

Object storage is **shared** between dev and prod, so image uploads only need to
run once (the dev run suffices); prod re-runs just overwrite the same keys.

## Bulk inserts for link/junction tables
**Rule:** When a seed inserts into a large junction table (e.g. product↔fabric),
use a single bulk `insert().values(rows).onConflictDoNothing({ target: [...] })`
per parent row, not per-link SELECT-then-INSERT.

**Why:** Per-link round-trips (e.g. 12k fabric links = ~24k round-trips) time out
over the remote prod connection (>2 min). One bulk insert per product completes
in seconds and stays idempotent via the unique constraint.

**How to apply:** Confirm the table's unique constraint first (`\d <table>`),
then target those columns in `onConflictDoNothing`. `.returning()` length gives
the actual rows-created count.
