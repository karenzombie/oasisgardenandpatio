#!/bin/bash
set -e

pnpm install --frozen-lockfile
pnpm --filter db push

# Sync production data (all scripts are idempotent — safe to re-run on every deploy)
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/syncProd.ts
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/seedGaltech.ts
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/seedFrankfordPricing.ts
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/seedTropitoneFinishes.ts
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/seedTelescopeFinishes.ts
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/seedTelescopeFabricFinishes.ts
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/seedNorthcapeProducts.ts
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/importTreasureGardenPrices.ts

# Galtech umbrellas/covers: drop Sunbrella fabrics for Galtech's own fabrics and
# remove pricing (quote-only). Idempotent + safe.
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/removeSunbrellaUmbrellaPricing.ts

# Treasure Garden market umbrellas: (re)build grade-priced, purchasable
# Finish × Wind Vent variants from the CSV price list. Idempotent. Runs last so
# it is the final authority over TG umbrella pricing/variant/fabric state.
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/loadTgUmbrellaPricing.ts

# Galtech market umbrellas: (re)build grade-priced, purchasable Finish × Wind
# Vent variants from the revised CSV price list (+ AA/BB Sunbrella-sourced
# fabrics, fabric notes, size-aware fabric availability). Idempotent. Runs after
# seedGaltech (which resets Galtech umbrellas to quote-only) and after
# removeSunbrellaUmbrellaPricing, so it is the final authority over Galtech
# umbrella pricing/variant/fabric state.
DATABASE_URL=$PROD_DATABASE_URL pnpm --filter @workspace/scripts exec tsx src/loadGaltechUmbrellaPricing.ts
