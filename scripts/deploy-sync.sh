#!/bin/bash
set -e

# Runs automatically after every successful production build (deployment.postBuild).
# Syncs the full dev catalog to prod: categories, products, images, fabrics,
# finishes, variants, options, shipping rules, etc.
# Transactional tables (orders, customers, users, carts, inventory) are intentionally
# excluded and are never touched.
# If prod-only catalog rows are detected, cleanup stops and requires the user-approved
# APPROVE_PROD_CATALOG_DELETIONS=1 flag before any such rows can be removed.

echo "→ Pruning pnpm store..."
pnpm store prune

echo "→ Removing prod-only catalog rows..."
pnpm --filter @workspace/scripts exec tsx src/cleanupProdOnlyRows.ts

echo "→ Removing prod-only junction rows..."
pnpm --filter @workspace/scripts exec tsx src/cleanupProdOnlyJunctionRows.ts

echo "→ Dumping dev catalog..."
pnpm --filter @workspace/scripts exec tsx src/dumpDevDataForProd.ts

echo "→ Applying catalog to prod..."
pnpm --filter @workspace/scripts exec tsx src/applyDataToProd.ts

echo "✓ Prod catalog sync complete."
