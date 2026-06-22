---
name: Dev→prod sync direction & catalog mirror
description: Which direction to sync when dev/prod DB data diverges, and how the full-catalog mirror reaches prod (post-merge vs direct publish).
---

When dev and production databases diverge on data (SKUs, codes, material IDs, etc.):
- **Dev is the source of truth** — it reflects the intended/correct state from seed scripts and explicit changes.
- **Production often has stale data** from earlier seeding runs or manual imports.
- Always update prod to match dev, never the reverse.

**Why:** Reversing direction corrupts dev with old/wrong data, breaks seed scripts that rely on correct dev state, and wastes time undoing the mistake.

**How to apply:** Before running any UPDATE on dev to "normalize" it to prod, stop and ask: is prod's format correct and intentional, or is it a legacy artifact? If prod is stale, fix prod.

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
