---
name: Dev→prod sync direction
description: Which direction to sync when dev and prod DB data diverges; also covers the post-merge hook pattern.
---

When dev and production databases diverge on data (SKUs, codes, material IDs, etc.):
- **Dev is the source of truth** — it reflects the intended/correct state from seed scripts and explicit changes.
- **Production often has stale data** from earlier seeding runs or manual imports.
- Always update prod to match dev, never the reverse.

**Why:** Reversing direction corrupts dev with old/wrong data, breaks seed scripts that rely on correct dev state, and wastes time undoing the mistake.

**How to apply:** Before running any UPDATE on dev to "normalize" it to prod, stop and ask: is prod's format correct and intentional, or is it a legacy artifact? If prod is stale, fix prod.

**Post-merge hook:** scripts/post-merge.sh runs syncProd.ts + seedGaltech.ts against PROD_DATABASE_URL on every deploy. Add new idempotent prod-only data operations to syncProd.ts so they run automatically going forward.
