---
name: Running seed scripts against prod
description: How to target the prod DB from seed scripts, the ESM hoisting trap, the ALLOW_PROD guard, and avoiding timeouts on large link tables.
---

# Running seed scripts against the production DB

DB identities: **dev = `heliumdb`** (local Postgres at host `helium`, workspace-only) and
**prod = `neondb`** (Neon-hosted, what `PROD_DATABASE_URL` points to and what the
deployed customer-facing site reads). The `executeSql` tool's `environment: 'production'`
target is neondb. The name "PROD_DATABASE_URL → neondb" has caused confusion — never
identify a DB by assumption; verify with `SELECT current_database()`.

## Targeting prod correctly — the ESM hoisting trap
**Rule:** Override the connection in the SHELL, never inside the script:
`ALLOW_PROD=1 DATABASE_URL="$PROD_DATABASE_URL" pnpm --filter @workspace/scripts exec tsx src/<script>.ts`

**Why:** `process.env.DATABASE_URL = process.env.PROD_DATABASE_URL` at the top of a
script does NOT work — ESM hoists `import { db } from "@workspace/db"` above the
assignment, so the pool silently connects to dev while the script claims to hit prod.
This caused a real incident (queries "against prod" were actually against dev).

Also: an `import { db }` that is never *used* may be dropped by tsx/esbuild, so the
guard/module never even executes — always actually call `db.execute(...)` when testing.

## ALLOW_PROD guard
`lib/db/src/index.ts` refuses at module load to connect to any non-local host
(not helium/localhost/127.0.0.1/::1) unless `ALLOW_PROD=1` is set, except in real
deployments (`REPLIT_DEPLOYMENT=1` — deliberately NOT `NODE_ENV`, which is too easy to
spoof locally). It prints a `[db guard] Connected target: <db> @ <host>` banner in
non-deployment runs — check that banner to confirm which DB a script actually hit.

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
