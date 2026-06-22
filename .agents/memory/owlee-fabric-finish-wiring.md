---
name: OW Lee fabric/finish product wiring
description: How OW Lee (mfr 13) finishes/fabrics attach to products, and the name-classification gotchas that bite bulk wiring.
---

Wiring uses explicit **options** rows (product_finish_options / product_fabric_options), NOT pools.

**Why not pools:** a pool = "every active finish/fabric from this manufacturer." OW Lee products carry product-specific extra finishes (ids 21+ on a handful of products), and fabrics split into cushion vs sling subsets — a pool would over-wire both. Options let you attach exactly the intended set.

## The wiring rules (business spec, keep consistent)
- **Finishes 11–20** (the 10 OW Lee frame finishes) → **every** OW Lee product, incl. tables, tops, fire pits.
- **Cushion fabrics** (active, item_number NOT like 'SL%') → all seats that are NOT sling: deep seating (lounge chairs, sofas, love seats, ottomans, sectionals), dining/bar/counter chairs, non-sling chaises.
- **Sling fabrics** (active, item_number ILIKE 'SL%') → products with "Sling" in the name (incl. sling chaise lounges).
- **No fabric** (finishes only): table bases, table tops, accent/coffee/side tables, Kensington/Quadra/Horizon tables, fire pits.
- Fire-pit hearth-top tile color and table-top porcelain fabric/grade are a SEPARATE follow-on task — not wired here.

## Classification gotchas (cost real debugging)
- `fabrics` SKU column is **item_number**, not `sku`.
- Match name keywords with **word boundaries** (`~* '\y(...)\y'`). Plain `table` matches inside "Adjus**table**" → wrongly flags "Adjustable Chaise" as a table.
- **Collection name ≠ table.** "Horizon"/"Kensington"/"Quadra" appear on both seats and tables. Detect tables by table-nouns (`table|top|console`), not collection names, or you exclude "Horizon Lounge Chair/Sofa/Ottoman".
- Table tops are named "… Top" ("Dekton Top", "Micro Mesh Top", "Porcelain Top") — `top` (word-bounded) is needed to catch them; `table` alone misses them.
- Sling products span categories (chaise lounges, dining/bar/counter chairs); classify by name+SKU, not category alone. cat-fire-tables and cat-coffee-side-tables are cleanly no-fabric by category.

**How to apply:** for any bulk catalog wiring, build the classification, then surface UNCLASSIFIED + seat/table keyword conflicts and eyeball them before INSERT … ON CONFLICT DO NOTHING. Write to dev (source of truth); the post-merge catalog mirror carries option rows to prod.
