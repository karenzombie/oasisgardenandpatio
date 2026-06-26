# Nova - proposed build spec (review before insert) [UPDATED]

Read-only. Nothing written. Two sizes only; 883NGU-SQ (10' square) is a minimum-order special-order item and is omitted from the site.

Decisions resolved (were open in the earlier draft):
- Grade sale rounding = round UP always (ceil of MSRP x 0.90). This sets Grade B sale = 7881 and Grade D sale = 8361. The old "round-to-nearest" values (7880 / 8360) are NOT used.
- sub_category = null (all sub-categories handled in one later pass).

## Product row
- name: Nova Giant Telescoping Market   (adjustable)
- sku: 896NGU   slug: nova-giant-telescoping-market
- category_id: 38 (Umbrellas)
- umbrella_type: Market   umbrella_shape: Octagon   lift_mechanism: Crank   tilt_mechanism: (none)   pole_material: Aluminum
- product price/msrp = base variant (896NGU) Grade A = MSRP 7310 / sale 6579
- weight: 205 lb   pricing_mode: fixed   available_online: true   show_price_online: true
- dimensions (product-level, 896NGU): Open Clearance: 90.8"/230cm | Closed Clearance: 52"/132cm | Mast Diameter: 4"/10cm | Closed Mast Height: 168"/426cm | Weight: 205 lbs./93 kg.
- collection: null (matches existing)   sub_category: null
- description: catalog marketing paragraph (Nova, 9 oz marine-grade acrylic, 4-inch mast, telescoping, semi/non-permanent mounts)

## Variants (2) and grade prices
Sale = ceil(MSRP x 0.90), round up.

### 896NGU  -  16' Octagon / 5M
| Grade | MSRP | Sale |
|---|---:|---:|
| A | 7310 | 6579 |
| A+ | 8070 | 7263 |
| B | 8756 | 7881 |
| C | 9023 | 8121 |
| D | 9289 | 8361 |
| E | 9555 | 8600 |
| F | 9954 | 8959 |

### 8110NGU-SQ  -  13' x 13' Square / 4M x 4M
| Grade | MSRP | Sale |
|---|---:|---:|
| A | 7310 | 6579 |
| A+ | 8070 | 7263 |
| B | 8756 | 7881 |
| C | 9023 | 8121 |
| D | 9289 | 8361 |
| E | 9555 | 8600 |
| F | 9954 | 8959 |

## Per-variant dimensions (written inline by the insert into product_variants.dimensions)
The dimensions column is now live, so the Nova insert writes these directly; no separate loader pass needed. (Rerunning the variant-dimensions loader would also work, since these two rows are already in the dataset.)
- 896NGU: Open Clearance: 90.8"/230cm | Closed Clearance: 52"/132cm | Mast Diameter: 4"/10cm | Closed Mast Height: 168"/426cm | Weight: 205 lbs./93 kg.   (weight 205)
- 8110NGU-SQ: Open Clearance: 92"/233cm | Closed Clearance: 66"/167cm | Mast Diameter: 4"/10cm | Closed Mast Height: 168"/426cm | Weight: 195 lbs./88 kg.   (weight 195)

## Finishes (7 explicit rows; sale = round up)
| Finish | Code | MSRP up | Sale up |
|---|---|---:|---:|
| Brushed Silver | MS | std | - |
| Golden Oak | WG | +1400 | +1260 |
| Heather Willow | HW | +1400 | +1260 |
| Onyx | BK | +940 | +846 |
| Desert Bronze | BZ | +940 | +846 |
| Alpine White | WH | +940 | +846 |
| Carbon | CB | +940 | +846 |

## Fabric
- Copy Eclipse's 1041 product_fabric_options (same canopy pool all umbrellas share).

## Recommended bases (product_recommendations, source_sku=896NGU)
- NGU550 (recommended)
- NGU-DP
- IG-GIANT

## Images
- Folder: additional_frankford_images_6-25-26/Nova/
- Rule: the file ending in _primary loads as primary (display_order 0); all other files load as secondary in order.
- (Image files into object storage is the agent's step; the insert/admin references them once placed.)

## Post-insert
- After Nova exists with these exact SKUs (896NGU, 8110NGU-SQ), the two variant-dimensions rows the agent skipped will match. They are written inline here, so a loader rerun is optional, not required.
