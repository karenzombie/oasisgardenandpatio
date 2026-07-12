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
#   product_finish_options, product_finial_options, product_cover_options,
#   product_cover_finish_prices, product_stem_options, product_recommendations,
#   variant_grade_prices, product_sets, product_set_items,
#   product_addon_options, product_addon_grade_prices, shipping_rules,
#   shipping_rule_products, shipping_weight_tiers.
#
# NOT synced (intentionally): transactional / user / inventory tables
#   (orders, customers, users, carts, inventory, etc.). These hold no real prod
#   data today and are wiped by TRUNCATE CASCADE during the reload.
#
# Prerequisite: the prod schema must already match dev (the reload inserts dev's
# exact columns). `pnpm --filter db push` above keeps dev current; apply the same
# schema changes to prod before relying on this sync if a migration adds columns.
# Pre-sync cleanup: remove prod-only catalog rows that no longer exist in dev
# (e.g., merged duplicates, superseded series). ON DELETE CASCADE cleans up
# their associated option/junction rows; the sync below then repopulates from dev.
pnpm --filter @workspace/scripts exec tsx src/cleanupProdOnlyRows.ts

pnpm --filter @workspace/scripts exec tsx src/dumpDevDataForProd.ts
pnpm --filter @workspace/scripts exec tsx src/applyDataToProd.ts
