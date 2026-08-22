---
name: Prod catalog full-sync (dump + apply)
description: How production catalog data is mirrored from dev and the non-obvious constraints that keep the dump+apply safe and fast.
---

# Production catalog sync = dump + upsert reload

`dumpDevDataForProd.ts` → `applyDataToProd.ts` mirrors the **catalog** allowlist
(`TABLES_IN_ORDER`) from dev to prod. As of the pre-launch phase where prod holds real
transactional data (customers/orders/vendor_orders/cart_items), this is **upsert-only**
(`INSERT ... ON CONFLICT (id) DO UPDATE`), wrapped in one `BEGIN/COMMIT` — it never runs a
blanket `TRUNCATE CASCADE`. Rows are never deleted from prod by this pipeline.

**Why:** per-manufacturer seed replay drifted constantly (loaders silently omitted from
post-merge). Copying dev's exact catalog rows is drift-proof, but once prod has live
transactional data, a destructive TRUNCATE CASCADE approach is no longer safe — hence upsert.

**The id-drift problem (recurring root cause of apply failures)**
Dev and prod catalog rows can carry the *same natural key* (SKU, or a composite
product+fabric/finish/manufacturer key) under *different* surrogate `id`s, because catalog
data evolved independently via reseeding on each side. `ON CONFLICT (id)` then fails on the
table's OTHER unique constraint (e.g. `products_sku_unique`,
`product_finish_pools_product_manufacturer_unique`), not on `id` — the insert never even
reaches the id-conflict path.

**Two fix patterns, chosen per table by whether its `id` is a live FK target:**
1. **No incoming FK on `.id`** (verified via grep across `lib/db/src/schema/*.ts`) → add the
   table to `FULL_REPLACE_TABLES`: `TRUNCATE ... RESTART IDENTITY` + plain INSERT, sidestepping
   id conflicts entirely. Used for `product_images`, `product_fabric_pools`,
   `product_finish_pools`.
2. **`.id` IS a live FK target** (e.g. `cart_items`/`order_items` hold a composite FK against
   `(product_id, fabric_id)` on `product_fabric_options`/`product_finish_options`) → TRUNCATE is
   unsafe (fails outright, or CASCADE would wipe live cart/order rows). Instead: upsert keyed on
   the table's natural unique constraint, **omit `id` from the INSERT list** so an existing
   matched row keeps its current id (protecting the live FK) while its other columns update to
   dev's values; unmatched rows get a fresh prod-assigned id.
Before adding any table to either bucket, grep the whole schema dir for
`referencesTableTable.id` / composite `foreignKey({...})` blocks naming it — don't assume from
the table's apparent role.

**How to extend**
- Adding a new catalog table? Add it to `TABLES_IN_ORDER` (parents before children, FK order).
  Decide id-safety per the above before assuming plain `ON CONFLICT (id)` upsert is fine.
- Emit batched multi-row INSERTs (~1000 rows/stmt) — one-per-row blows the 120s tool limit on
  remote prod round-trips.
- Run the apply in the foreground — Replit reaps detached/`setsid` processes mid-transaction.
- `product_materials` uses a natural-key upsert but is not removed by the current
  prod-only cleanup step; after any catalog sync, verify its exact key set and
  explicitly reconcile stale production-only links before declaring parity.
- **Prereq: prod schema must already match dev** — the reload inserts dev's exact columns; a
  schema mismatch fails the apply hard (clean rollback via the single transaction).
- **Both allowlist AND prod schema silently drift when new tables/columns are added.** A table
  invisible to `TABLES_IN_ORDER` never syncs; a table missing from prod schema entirely blocks
  the apply. Before any publish, diff dev vs prod `information_schema` fully, not just the
  allowlist.
- After a full sync, spot-check row counts per table (dev vs prod) AND diff for prod-only rows
  with no dev counterpart (`comm -13` on sorted id lists) — these are orphans from prod's
  independent reseed history and must be flagged to the user, never silently deleted.
