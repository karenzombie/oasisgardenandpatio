---
name: Prod catalog full-sync (dump + apply)
description: How production catalog data is mirrored from dev and the non-obvious constraints that keep the dump+apply safe and fast.
---

# Production catalog sync = full dump + reload

`scripts/post-merge.sh` syncs the **catalog** to prod by dumping dev's exact rows and
reloading them into prod (`dumpDevDataForProd.ts` → `applyDataToProd.ts`), NOT by replaying
per-manufacturer seed/image scripts.

**Why:** per-manufacturer seed replay drifted constantly — every new loader had to be
remembered and added to post-merge, and several never were, causing large silent prod gaps.
Copying dev's exact catalog state is drift-proof.

**How to apply / extend**
- Adding a new catalog table? Add it to BOTH the dump `TABLES_IN_ORDER` and the apply
  `TRUNCATE` list, parents before children (FK order). The two lists must stay in lockstep or
  the apply leaves orphaned/missing rows.
- Dump emits `INSERT ... ON CONFLICT (id) DO UPDATE`; apply prepends
  `TRUNCATE ... RESTART IDENTITY CASCADE`, runs via `psql -f` (ON_ERROR_STOP) in one
  transaction, then `setval`s sequences.

**Non-obvious constraints**
- **Emit batched multi-row INSERTs (~1000 rows/stmt), not one-per-row.** One INSERT per row =
  tens of thousands of statements; `psql -f` round-trips each to remote prod and blows the
  120s tool limit. Batched = seconds.
- **Run the apply in the foreground.** Replit reaps detached/`setsid` processes; the single
  transaction then rolls back mid-load.
- **Excluded on purpose:** transactional/user/inventory tables. TRUNCATE CASCADE wipes them in
  prod on every run — safe ONLY while prod holds disposable test data. `inventory` does NOT
  gate purchasing (`products.availableOnline` does), so empty prod inventory is functionally
  safe; it's display/admin only. If prod ever holds real transactional data, this pipeline
  becomes destructive and must be reworked.
- **Prereq: prod schema must already match dev.** The reload inserts dev's exact columns; a
  schema mismatch makes the apply fail hard (clean rollback, but blocks the sync).
- **The allowlist + prod schema BOTH silently drift when new tables are added.** A new catalog
  table is invisible to this pipeline until added to BOTH lists, AND its table must be created in
  prod first (the apply only inserts rows, never DDL). Whole tables can be missing from prod
  schema entirely (e.g. cover/stem/finial option tables, shipping_rules/_products/_weight_tiers).
  **Before any publish, diff the FULL dev vs prod table list (information_schema), not just the
  allowlist** — a feature can be live in merged code yet query a table that doesn't exist in prod,
  500ing on republish. shipping_* tables are queried by loadShippingConfig (cart/checkout) and are
  NOT catalog-synced, so they must be schema-created + data-loaded in prod independently.
