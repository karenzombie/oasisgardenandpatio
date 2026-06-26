# Avalon - proposed build spec (review before insert)

Read-only. Nothing written. Sources: 2026 Frankford MSRP price book P.33 (pricing/SKUs); frankfordumbrellas.com Avalon PDP (specs/dimensions - SKUs match). Avalon is not in the print catalog. All sale prices = ceil(MSRP x 0.90).

## Product row
- name: The Avalon   (website display name)
- sku: 844FWB-01 (lead variant, confirmed)   slug: the-avalon
- category_id: 38 (Umbrellas)
- umbrella_type: Beach   umbrella_shape: (varies by variant: Hexagonal / Octagon)   lift_mechanism: Manual (FWB)   tilt_mechanism: (none)   pole_material: Ash Wood
- frame finish: Ash Wood (ASH) - single option shown on the site, no upcharge, no selectable choice
- product price/msrp = lead variant 844FWB-01 Grade A = MSRP 445 / sale 401
- weight: 14 lb   pricing_mode: fixed   available_online: true   show_price_online: true
- dimensions (product-level): Overall Height: 94" | Upper Pole: 55"/139cm | Lower Pole: 38"/96.5cm | Weight: 14 lbs./6.4 kg.
- collection: null   sub_category: null (one later pass)
- description: Modern fiberglass beach umbrella. Manual lift. 8mm flexible fiberglass ribs and struts. 1.375" diameter solid ash wood center pole (pointed bottom for sand) with stainless steel hardware throughout. 4-layer fabric protection and closed-stitching pocket. Note: overall height is the full length of the umbrella and varies depending on how far the pole is placed in the sand.
- short_description: "Fiberglass Beach Umbrella"

## Variants (4) and grade prices
All variants: FINISH = Ash Wood. MSRP -> sale (ceil x0.90).

### 639FWB-01  -  6.5' Hex / 2M  -  Valance, No Vent
| Grade | MSRP | Sale |
|---|---:|---:|
| A | 383 | 345 |
| A+ | 478 | 431 |
| B | 530 | 477 |
| C | 603 | 543 |
| D | 676 | 609 |
| E | 750 | 675 |
| F | 848 | 764 |

### 844FWB-01  -  7.5' Octagon / 2.3M  -  Valance, No Vent
| Grade | MSRP | Sale |
|---|---:|---:|
| A | 445 | 401 |
| A+ | 542 | 488 |
| B | 599 | 540 |
| C | 671 | 604 |
| D | 745 | 671 |
| E | 819 | 738 |
| F | 918 | 827 |

### 844FWB-02  -  7.5' Octagon / 2.3M  -  Valance / Vent
| Grade | MSRP | Sale |
|---|---:|---:|
| A | 488 | 440 |
| A+ | 584 | 526 |
| B | 646 | 582 |
| C | 719 | 648 |
| D | 793 | 714 |
| E | 865 | 779 |
| F | 964 | 868 |

### 844FWB-03  -  7.5' Octagon / 2.3M  -  No Valance / Vent
(Same MSRP/sale as 844FWB-02.)
| Grade | MSRP | Sale |
|---|---:|---:|
| A | 488 | 440 |
| A+ | 584 | 526 |
| B | 646 | 582 |
| C | 719 | 648 |
| D | 793 | 714 |
| E | 865 | 779 |
| F | 964 | 868 |

## Finishes
None. Ash wood pole, no finish picker.

## Fabric
- Copy the shared acrylic canopy pool (same 1041 product_fabric_options copied for Nova/Eclipse).

## Per-variant dimensions / weight
Source: frankfordumbrellas.com Avalon PDP (SKUs match ours). All four variants share the same height, pole lengths, and weight; only canopy size and valance/vent config differ (the Catalina/Laurel pattern). So the product-level dimensions string covers all variants and the variants can stay null and fall back.
- Overall Height: 94"  (inches only; the cm conversion is dropped as suspect - the Avalon page shows 228cm and the Emerald page shows 238cm for the same 94". Client to be advised these height specs may be off.)
- Upper Pole: 55"/139cm
- Lower Pole: 38"/96.5cm
- Weight: 14 lbs./6.4 kg

## Accessories / recommended (product_recommendations, source_sku=844FWB-01; DB-verified SKUs)
Beach umbrella - no plate base (pointed pole goes into sand). Accessories confirmed present in the database:
- 30-SA "Drill Bit Sand Auger"  -  RECOMMENDED (is_recommended=true, display_order 0)
- CB01 "Navy Blue Cotton Beach Umbrella Carry Bag"  -  alternative (is_recommended=false)
- Sand Anchor "Sand Anchor"  -  alternative (is_recommended=false)

## Admin / staff portal (editability requirement)
All Avalon data must be editable through the admin/staff UI, not hardcoded - including PRICING (variant grade prices), variant dimensions/weight, the canopy fabric pool, and the recommended accessories. Use the same hydrate/save round-trip as other admin-editable product fields.

## Images
- Folder: additional_frankford_images_6-25-26/Avalon_Fiberglass_Beach/
- Rule: the file ending in _primary loads as primary (display_order 0); all other files load as secondary in order.

## OPEN ITEMS
None. Avalon is fully specced and ready.

Settled this pass: name "The Avalon" (slug the-avalon); short_description "Fiberglass Beach Umbrella"; lead variant 844FWB-01; finish Ash Wood (single, no upcharge); dimensions/weight from the Frankford PDP (height in inches only, cm dropped as suspect, client to be advised); recommended accessory 30-SA with CB01 and Sand Anchor as alternatives; fabric = shared acrylic pool; all admin-editable including pricing.
