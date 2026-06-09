#!/bin/bash
set -e

pnpm install --frozen-lockfile
pnpm --filter db push

# Sync production data (all scripts are idempotent — safe to re-run on every deploy)
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/syncProd.ts
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/seedGaltech.ts
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/seedFrankfordPricing.ts
