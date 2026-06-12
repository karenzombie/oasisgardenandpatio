---
name: Telescope finish seeding — two scripts, one gap
description: How Telescope finishes are seeded and the bug that caused MGP/PC/Accents finishes to be missing from prod
---

Telescope finishes are seeded by TWO scripts that cover different subsets:

1. **`seedTelescopeFinishes.ts`** — reads `telescope_frame_finishes_*.csv` (Powdercoat + MGP frame colors, ~17 rows). Upserts by `(manufacturer_id, finish_code)`. Stores **differentiated names**: "Beachwood PC" for Powdercoat type, "Beachwood MGP" for MGP type. Special cases: `White→White Txt PC`, `Graphite→Graphite Txt PC`, `Desert→Desert Sand MGP`.

2. **`seedTelescopeFabricFinishes.ts`** — reads `telescope_finishes_*.csv` (Sling, Ultraleather, Strap, Rustic Polymer, MGP Accent — ~125 rows). Upserts by `(manufacturer_id, item_number)`. Skips `Powdercoat` and `MGP` rows (owned by the other script). Uses `name` as `item_number` fallback when SKU is blank (Rustic Polymer rows have no SKU).

**Why the gap occurred:** The original `seedTelescopeFabricFinishes.ts` had `if (!name || !description || !itemNumber) continue` — which skipped all Rustic Polymer / no-SKU rows. It also pointed at an older CSV that didn't have the Rustic Polymer and MGP Accent entries. And `seedTelescopeFinishes.ts` was storing plain names (`Beachwood`) instead of differentiated names.

**How to apply:** When updating either CSV path, verify both scripts are consistent: no overlap (seedTelescopeFabricFinishes.ts skips Powdercoat/MGP), and no Rustic Polymer rows silently skipped.
