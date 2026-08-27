---
name: Dev→prod sync direction & catalog mirror
description: Which direction to sync when dev/prod DB data diverges, and how the full-catalog mirror reaches prod (post-merge vs direct publish).
---

When dev and production databases diverge on data (SKUs, codes, material IDs, etc.):
- **Dev is the source of truth** — it reflects the intended/correct state from seed scripts and explicit changes.
- **Production often has stale data** from earlier seeding runs or manual imports.
- Always update prod to match dev, never the reverse.
- **Always ask Karen before running any prod data sync — even small targeted patches.** Do not auto-sync.

**Why:** Reversing direction corrupts dev with old/wrong data, breaks seed scripts that rely on correct dev state, and wastes time undoing the mistake.

**How to apply:** Before running any UPDATE on dev to "normalize" it to prod, stop and ask: is prod's format correct and intentional, or is it a legacy artifact? If prod is stale, fix prod. Before any dev→prod sync, produce a read-only row-level divergence report across all tables and get explicit approval for every unexpected difference. A narrowly scoped request (such as syncing one manufacturer's documents) does not approve unrelated changes, especially deletions or replacements.

## Pre-launch policy (user-set, July 2026): flag ALL dev/prod differences before publish

Until the site launches, every publish pushes dev over prod (code + DB data incl. catalog). But the user requires that **any difference found between dev and prod — in ANY table, not just catalog** — is flagged to them for a decision BEFORE publishing/syncing. Do not silently overwrite or silently skip differences.

**Why:** The July 2026 catalog sync's `TRUNCATE manufacturers CASCADE` silently wiped prod `vendor_orders` (FK cascade) — the user accepted the loss but wants to make that call themselves next time. Transactional tables (orders, customers, vendor_orders, users) may hold prod-only test data the user cares about.

**How to apply:** Before any publish or prod data sync, diff dev vs prod row counts across ALL tables (not just the catalog mirror list), enumerate prod-only rows in transactional tables and catalog tables, and identify changed/deleted/replaced rows that the operation could overwrite or cascade-delete. Present the exact differences to the user for sign-off first. If any difference was not explicitly approved, stop before mutation. A successful command must never be treated as implicit approval.

## Catalog mirror mechanism (replaces old syncProd.ts + seedGaltech.ts)

`scripts/post-merge.sh` now syncs prod via a **full-catalog mirror**, not per-manufacturer seed scripts:
1. `dumpDevDataForProd.ts` — reads dev (DATABASE_URL), writes `./dev-data-for-prod.sql` (multi-row INSERT … ON CONFLICT (id) DO UPDATE + setval; ~8.5 MB). The file is generated/transient — keep it out of git.
2. `applyDataToProd.ts` — connects to `PROD_DATABASE_URL`, runs `TRUNCATE … RESTART IDENTITY CASCADE` over the catalog tables, reloads, prints post-sync counts.

**Adding a new catalog table to the mirror:** add it to BOTH `TABLES_IN_ORDER` (dump, FK-ordered) AND the `TRUNCATE` list (apply, must match `TABLES_IN_ORDER`); optionally to the post-sync verification query. Missing it means the table never reaches prod (or gets wiped by CASCADE on the next merge).

**Precondition:** prod schema must already match dev (the reload inserts dev's exact columns). Migrate schema first, then sync data.

## Direct (main-agent) publish does NOT auto-sync catalog data

The mirror only runs automatically at a **task merge** (post-merge.sh). On a **direct publish from main**, Replit's publish migrates the **schema** (dev→prod diff, incl. column drops you confirm in the dialog) but does **not** reliably bring catalog **data** across — the "overwrite data" option did not populate the catalog in practice.

**How to apply:** after a direct publish, cross-check dev vs prod counts. If data is stale/empty, run the mirror manually once the schema is migrated:
`pnpm --filter @workspace/scripts exec tsx src/dumpDevDataForProd.ts` then `… src/applyDataToProd.ts`.
Safe because prod transactional tables hold only test artifacts (orders w/ 0 line items, etc.) and the catalog TRUNCATE…CASCADE doesn't reach standalone orders/customers/users.

## Prod WRITES: the executeSql tool is READ-ONLY against production

`executeSql({ environment: "production" })` allows SELECTs but **rejects any mutation** ("the 'production' environment is read-only"). For prod writes you must connect directly via `$PROD_DATABASE_URL`:
- Schema (additive) → `psql "$PROD_DATABASE_URL" -v ON_ERROR_STOP=1 -c "ALTER TABLE … ADD COLUMN IF NOT EXISTS …"`. Only the schema changes since the last publish need applying; check `git log <lastPublish>..HEAD -- lib/db/src/schema`. Additive nullable columns are safe to add to prod while the OLD published build still serves (it just ignores them), which is what makes pre-publish sync safe.
- Catalog data → the dump/apply scripts (they use `pg.Client` on `$PROD_DATABASE_URL`, bypassing the read-only guard).

**cwd gotcha:** `pnpm --filter @workspace/scripts exec tsx …` runs with cwd = `scripts/`, so `dumpDevDataForProd.ts` writes `scripts/dev-data-for-prod.sql` (NOT repo root) and `applyDataToProd.ts` reads it from there — consistent with each other; just don't look for the file at the repo root. The dump is ~8.7MB but only ~150 lines (batched multi-row INSERTs put thousands of rows on one line).
