---
name: CSV duplicate-SKU collisions during import
description: A source CSV can have two distinct product rows sharing one raw SKU string; verify both landed in the DB before trusting a remap script's intent.
---

Frankford's non-umbrella import CSV had two distinct rows both using the raw SKU "SS-DB (4)" (a plain wedge-anchor and a "Marella"-specific variant with different qty/description). The seed script's SKU_REMAP was written to disambiguate them into separate SKUs, but only one product ended up in the DB — the other was silently dropped, likely on a duplicate-SKU insert conflict during the original seeding run.

**Why:** Reading a remap/dedup script's *intent* is not evidence it succeeded for every row. Import-time conflicts (unique constraint hits) can silently drop rows without failing the whole batch, especially with onConflictDoNothing-style upserts.

**How to apply:** When a task references a SKU group by name and one expected SKU can't be resolved, check the DB directly for actual row count instead of trusting the seed/remap script's designed behavior. Cross-reference the original source CSV for the true expected count. Never fabricate a missing product to satisfy a naming pattern — flag the gap for the user instead (do not guess).
