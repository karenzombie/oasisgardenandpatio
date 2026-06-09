---
name: Dev/prod category taxonomy drift
description: Prod category set can lag dev; data scripts keyed on category slugs must tolerate missing slugs in prod.
---

# Dev/prod category taxonomy drift

The `categories` table can differ between dev and prod. Observed: dev had
`outdoor-rugs` and `protective-covers` categories that prod did NOT have (prod
also has `cat-lighting`). Prod taxonomy generally lags dev.

**Why:** category rows are seeded/edited in dev first and not always pushed to
prod, so a data script that hard-requires a slug (e.g. validates all rule slugs
exist) will throw on prod even though no rows actually need that category.

**How to apply:** any data/categorization script that maps to category *slugs*
should SKIP rules whose slug is absent in the target DB (warn, don't throw),
not fail-fast. The keyword categorization script (`scripts/src/categorizeProducts.ts`)
does this. If you need a missing category in prod, add the category row to prod
first, then re-run.
