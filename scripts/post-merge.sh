#!/bin/bash
set -e

pnpm install --frozen-lockfile
pnpm --filter db push

# ── Production data sync ──────────────────────────────────────────────────────
# Full-catalog mirror: dump the entire dev catalog and reload it into production
# (TRUNCATE CASCADE + batched reload). This supersedes the previous per-manufacturer
# seed/image scripts — instead of replaying each loader (which repeatedly drifted
# because new scripts were forgotten here), we copy dev's exact catalog state, so
# production always matches dev after a merge.
#
# Synced tables (see scripts/src/dumpDevDataForProd.ts TABLES_IN_ORDER):
#   manufacturers, materials, categories, fabrics, finish_collections, finishes,
#   products, product_variants, product_images, product_attributes,
#   product_fabric_pools, product_fabric_options, product_finish_pools,
#   product_finish_options, product_finial_options, variant_grade_prices,
#   product_sets, product_set_items, product_addon_options,
#   product_addon_grade_prices.
#
# NOT synced (intentionally): transactional / user / inventory tables
#   (orders, customers, users, carts, inventory, etc.). These hold no real prod
#   data today and are wiped by TRUNCATE CASCADE during the reload.
#
# Prerequisite: the prod schema must already match dev (the reload inserts dev's
# exact columns). `pnpm --filter db push` above keeps dev current; apply the same
# schema changes to prod before relying on this sync if a migration adds columns.
pnpm --filter @workspace/scripts exec tsx src/dumpDevDataForProd.ts
pnpm --filter @workspace/scripts exec tsx src/applyDataToProd.ts
