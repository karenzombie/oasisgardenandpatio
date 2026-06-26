# Emerald Coast - proposed build spec (review before insert)

Read-only. Nothing written. Sources: 2026 Frankford MSRP price book P.33 (pricing/SKUs); frankfordumbrellas.com Emerald Coast PDP (specs/dimensions - SKUs match). Emerald is not in the print catalog. All sale prices = ceil(MSRP x 0.90).

VINYL RULE APPLIED: the MSRP grid color-codes variants. The green blocks are heavy-gauge vinyl and are OMITTED per your acrylic-only rule. Only the two red (acrylic) variants are kept. Omitted: 639W vinyl (6.5' Hex) and 845AT vinyl (7.5' Octagon).

## Product row
- name: The Emerald Coast   (website display name)
- sku: 845W (lead variant, confirmed)   slug: the-emerald-coast
- category_id: 38 (Umbrellas)
- umbrella_type: Beach   umbrella_shape: (varies by variant: Hexagonal / Octagon)   lift_mechanism: Manual (W)   tilt_mechanism: (none)   pole_material: Ash Wood
- frame finish: Ash Wood (ASH) - single option shown on the site, no upcharge, no selectable choice
- product price/msrp = lead variant 845W Grade A = MSRP 381 / sale 343
- weight: 15 lb   pricing_mode: fixed   available_online: true   show_price_online: true
- dimensions (product-level): Overall Height: 94" | Upper Pole: 55"/139cm | Lower Pole: 38"/96.5cm | Weight: 15 lbs./6.8 kg.
- collection: null   sub_category: null (one later pass)
- description: Classic steel-frame beach umbrella. Manual lift. 5mm steel ribs. 1.375" diameter solid ash wood center pole (pointed bottom for sand) with stainless steel hardware throughout. Non-twisting end tips. Marine-grade acrylic canopy. Steel bell cap.
- short_description: "Steel frame beach umbrella"

## Variants (2 acrylic; vinyl omitted) and grade prices
All variants: FINISH = Ash Wood. MSRP -> sale (ceil x0.90).

### 639W  -  6.5' Hex / 2M  -  Valance, No Vent  (acrylic)
| Grade | MSRP | Sale |
|---|---:|---:|
| A | 355 | 320 |
| A+ | 450 | 405 |
| B | 497 | 448 |
| C | 571 | 514 |
| D | 644 | 580 |
| E | 718 | 647 |
| F | 817 | 736 |

### 845W  -  7.5' Octagon / 2.3M  -  Valance, No Vent  (acrylic)
| Grade | MSRP | Sale |
|---|---:|---:|
| A | 381 | 343 |
| A+ | 476 | 429 |
| B | 527 | 475 |
| C | 601 | 541 |
| D | 672 | 605 |
| E | 747 | 673 |
| F | 846 | 762 |

## Finishes
None. Ash wood pole, no finish picker.

## Fabric
- Copy the shared acrylic canopy pool (same 1041 product_fabric_options copied for Nova/Eclipse). Acrylic only; no vinyl pool.

## Per-variant dimensions / weight
Source: frankfordumbrellas.com Emerald Coast PDP (SKUs match ours). Both variants share the same height, pole lengths, and weight; only canopy size differs (the Catalina/Laurel pattern). So the product-level dimensions string covers both variants and the variants can stay null and fall back.
- Overall Height: 94"  (inches only; cm dropped as suspect - the Emerald page shows 238cm and the Avalon page shows 228cm for the same 94". Client to be advised these height specs may be off.)
- Upper Pole: 55"/139cm
- Lower Pole: 38"/96.5cm
- Weight: 15 lbs./6.8 kg

## Accessories / recommended (product_recommendations, source_sku=845W; DB-verified SKUs)
Beach umbrella - no plate base (pointed pole goes into sand). Accessories confirmed present in the database:
- 30-SA "Drill Bit Sand Auger"  -  RECOMMENDED (is_recommended=true, display_order 0)
- CB01 "Navy Blue Cotton Beach Umbrella Carry Bag"  -  alternative (is_recommended=false)
- Sand Anchor "Sand Anchor"  -  alternative (is_recommended=false)

## Admin / staff portal (editability requirement)
All Emerald data must be editable through the admin/staff UI, not hardcoded - including PRICING (variant grade prices), variant dimensions/weight, the canopy fabric pool, and the recommended accessories. Use the same hydrate/save round-trip as other admin-editable product fields.

## Images
- Folder: additional_frankford_images_6-25-26/Emerald_Coast_Classic_Steel_Beach/
- Rule: the file ending in _primary loads as primary (display_order 0); all other files load as secondary in order.

## OPEN ITEMS
None. Emerald Coast is fully specced and ready.

Settled this pass: name "The Emerald Coast" (slug the-emerald-coast); short_description "Steel frame beach umbrella"; lead variant 845W; finish Ash Wood (single, no upcharge); dimensions/weight from the Frankford PDP (height in inches only, cm dropped as suspect, client to be advised); recommended accessory 30-SA with CB01 and Sand Anchor as alternatives (mirrors Avalon); fabric = shared acrylic pool, vinyl omitted; all admin-editable including pricing.

639W SKU check: verified against the live Frankford product pull - 639W is NOT an existing SKU, so loading it as Emerald's acrylic hex variant creates no conflict. (The vinyl line that shared 639W is omitted.)
