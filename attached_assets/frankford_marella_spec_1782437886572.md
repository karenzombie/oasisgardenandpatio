# Marella - proposed build spec (review before insert)

Read-only. Nothing written. Source: 2026 Frankford catalog P.16-18 and MSRP price book P.13-14. All sale prices = ceil(MSRP x 0.90).

NOTE: A and A+ share one frame price on Marella (the grade grid has six columns: A/A+, B, C, D, E, F). Both grades load at the A/A+ value.

## Product row
- name: Marella Resort Cabana   (website display name)
- sku: 883MLA-SQ   slug: marella-luxury-resort-cabana
- category_id: 38 (Umbrellas)   (or a Cabana category if you prefer; see OPEN ITEMS)
- umbrella_type: Cabana   umbrella_shape: Square   lift_mechanism: (none, fixed cabana)   tilt_mechanism: (none)   pole_material: Aluminum   finial: VF-SS Stainless Steel Vertex
- frame finish: SR Platinum (standard) + 6 upcharge finishes (below)
- product price/msrp = 883MLA-SQ Grade A = MSRP 8650 / sale 7785
- weight: 285 lb   pricing_mode: fixed   available_online: true   show_price_online: true
- dimensions (product-level, 883MLA-SQ): Footprint: 120"x120"/3m x 3m | Height: 127.8"/323.1cm | Clearance: 91.9" | Leg Pole Diameter: 2"/5cm | Weight: 285 lbs./129.27 kg.
- collection: null   sub_category: "Cabana" (NET-NEW sub_category - does not yet exist in the project; first tracked addition for the later Frankford sub_category pass)
- description (Features field): The Marella is a 10ft x 10ft square luxury pool, beach, and resort cabana. Complete marine-grade extruded aluminum frame with Type II, Class I performance marine anodizing and 316L stainless steel hardware and couplings throughout. 2" diameter (.125" thick) corner mounting posts, 1.5" diameter (.125" thick) 45-degree corner structure supports, and 2mm thick canopy ribs for added strength against the wind. Easy drop-in canopy attachment with barrel bolt connections, engineered for simplified assembly.
  Included: four (4) MLA-8ST2 8" stainless steel stems, four (4) full-corner accent curtains, and the VF-SS stainless steel vertex finial.
  Wind rating: engineered to withstand sustained 35 mph winds. The wind rating is null and void when full or split walls are in use.
- short_description: "Custom Lead Times, Call for Details"  (set on Marella for all selections)

## Variant (1) and grade prices
### 883MLA-SQ  -  10' x 10' Square / 3M
| Grade | MSRP | Sale |
|---|---:|---:|
| A | 8650 | 7785 |
| A+ | 8650 | 7785 |
| B | 9372 | 8435 |
| C | 9645 | 8681 |
| D | 9910 | 8919 |
| E | 10180 | 9162 |
| F | 10460 | 9414 |

## Finishes (standard + flat upcharges; sale = ceil x0.90)
SR Platinum is the standard/included finish. Upcharges are flat (not per-grade).
| Finish | Code | MSRP up | Sale up |
|---|---|---:|---:|
| Platinum | SR | std | - |
| Golden Oak | WG | +980 | +882 |
| Heather Willow | HW | +980 | +882 |
| Onyx | BK | +550 | +495 |
| Desert Bronze | BZ | +550 | +495 |
| Alpine White | WH | +550 | +495 |
| Carbon | CB | +550 | +495 |

(SR Platinum is the only free finish. The six finishes above are the complete set of upcharge options. Brushed Silver/MS is NOT a Marella finish; it appears only on the catalog's full-palette swatch row and is Nova's standard finish, not Marella's.)

## Add-on options (selectable on the product page - agent to build the selector)

Selector behavior (confirmed):
- DEFAULT: none. No wall option is selected unless the customer clicks one. "None" is a valid state (cabana with the four included accent curtains only).
- MULTI-SELECT: customer can choose none, or any/all of the 3 wall options. Additive pricing (each selected option adds its upcharge to the total).
- ENFORCED PAIRING: if the customer selects MLA-FW or MLA-SW (either wall), MLA-HC (Entrance Half Curtains) is automatically required and added. The half curtains cap the wall ends. (Reuse the existing add-on/multi-select pattern already built for other items/manufacturers.)
- Each option shows its own image when offered for selection (images below).
- Priced by fabric grade (A/A+ shared), NOT flat. Each option's upcharge is pulled from the column matching the canopy fabric grade. CONFIRMED: the walls use the same fabric and grade the customer picks for the main canopy. (Deferred/future: allowing a different fabric for the walls than the canopy - not built now, only if the client later wants it.)
- Sale = ceil x0.90.

Confirmed image-to-SKU mapping (website display name in quotes):
- MLA-FW "Full Privacy Tension Wall"  ->  image MARELLA_-FULL-WALL.jpg
- MLA-SW "Full Curtain Split Wall"    ->  image MARELLA_-FULL-BACK.jpg
- MLA-HC "Entrance Half Curtains" (pair)  ->  image MARELLA_-FULL-BREEZE_1.jpg

Features-section informational copy (standalone, from the site; not a priced field):
"Optional Add-Ons - Enhance the presence of your Marella with configurable curtain and enclosure options. Each element can be layered together, including full-turn accent curtains, to shape the environment exactly how you envision it."
- Full Privacy Tension Wall: "Designed to pair with a required lower tension rail, each full privacy wall includes a support rail for stability and clean lines."
- Full Curtain Split Wall: "This privacy wall allows for movement and airflow while maintaining coverage. Pair two split walls together to create a more secluded enclosure without sacrificing elegance."
- Entrance Half Curtains: "Sold as a pair, these half curtains can zip into a full or split wall configuration, capping the ends and defining the entrance with tailored precision."

### MLA-FW (1)  -  Full Privacy Tension Wall  (image: MARELLA_-FULL-WALL.jpg)
| Grade | MSRP | Sale |
|---|---:|---:|
| A/A+ | 496 | 447 |
| B | 693 | 624 |
| C | 752 | 677 |
| D | 817 | 736 |
| E | 915 | 824 |
| F | 1039 | 936 |

### MLA-SW (1)  -  Full Curtain Split Wall  (image: MARELLA_-FULL-BACK.jpg)
| Grade | MSRP | Sale |
|---|---:|---:|
| A/A+ | 346 | 312 |
| B | 543 | 489 |
| C | 602 | 542 |
| D | 667 | 601 |
| E | 765 | 689 |
| F | 889 | 801 |

### MLA-HC (Pair)  -  Entrance Half Curtains  (image: MARELLA_-FULL-BREEZE_1.jpg)
| Grade | MSRP | Sale |
|---|---:|---:|
| A/A+ | 160 | 144 |
| B | 266 | 240 |
| C | 296 | 267 |
| D | 326 | 294 |
| E | 356 | 321 |
| F | 396 | 357 |

### MLA-8ST2 (1)  -  Replacement Stainless Steel Stem  (flat)
- MSRP 216 / sale 195. Weight 6 lbs. Spec 8" x 2".

## Minimum order quantity rule (agent logic)
Mirror the existing striped-fabric minimum-quantity logic already in Replit, extended to finish:
- Trigger A (existing): striped fabric selected -> minimum quantity 5.
- Trigger B (new): any frame finish OTHER than SR Platinum selected (i.e. WG, HW, BK, BZ, WH, CB) -> minimum quantity defaults to 5.
- In both cases the customer may increase the quantity but cannot go below 5.
- Conflict case (striped fabric AND a non-Platinum finish at the same time): minimum quantity 5, and show a display note to the customer that the quantity cannot be reduced due to the selected finish.
- Basis: the Marella finish upcharge grid in the MSRP carries "Minimum Order Quantity 5" for the additional (non-Platinum) finishes.

## Admin / staff portal (editability requirement - applies to everything below)
All of the new Marella configuration must be stored as data and editable through the existing admin/staff UI portal, not hardcoded in the frontend. The client must be able to maintain it without a developer. This explicitly includes:
- The three wall add-on options (MLA-FW, MLA-SW, MLA-HC): their existence, display names, selector images, enabled state, and PER-GRADE pricing (MSRP and sale) - all editable in admin.
- The replacement stem (MLA-8ST2) price.
- The frame finishes and their upcharge pricing.
- The main product variant grade prices.
- The minimum-order-quantity threshold and the display note text (where the existing striped-fabric pattern allows).
Build with the same hydrate/save round-trip used for other admin-editable product fields (e.g. the per-variant dimensions field just added). PRICING UPDATES in particular must be doable from the admin portal.

## Fabric
- Copy the shared acrylic canopy pool (same 1041 product_fabric_options copied for Nova/Eclipse). Default canopy shown in catalog: Recasens R-099 White (Grade A) with R-126 Linen Vent (Grade A).

## Recommended bases (product_recommendations, source_sku=883MLA-SQ) - DB-VERIFIED SKUs
All Marella bases confirmed present in the live database under Marella-specific SKUs. Do NOT use the generic DP-ST / IG-ST - those are the Giant (Nova) versions, not Marella.

Freestanding plates (four required to fully support, but NOT forced - see note):
- 30G-MLA Round (100 lb)  -  RECOMMENDED (cheapest plate; storefront MSRP 810 / sale 729)
- 36G-MLA Round (150 lb)  -  optional
- 36G-SQ-MLA Square (200 lb)  -  optional
- 30Gx2-MLA Round stack (200 lb)  -  optional
- 30G+24G-MLA Round stack (170 lb)  -  optional

Permanent-install mounts (alternatives to freestanding plates):
- DP-ST-MLA "DP-ST (Marella)" surface mount deck plate  -  optional
- IG-ST-MLA "IG-ST (Marella)" in-ground stem mount  -  optional
- SS-DB-4-Marella "SS-DB (4) Marella" anchors  -  optional

(MLA-8ST2 stem is included x4 and also exists as a replacement SKU; handled by the add-on/replacement path, not the base recommendation.)

Wiring: 30G-MLA is_recommended=true (display_order 0); all others is_recommended=false.
DO NOT force a quantity of 4. The "4 plates required" note is informational only - a customer may want a single replacement plate.
DEFERRED: the on-page wording should make "4 plates required when pairing with Marella" read as a clear requirement without forcing the quantity. The base PDPs already carry a generic "4 plates required" line; tightening it for the Marella pairing is deferred to the end-of-cleanup overall Frankford data review, not built now.

## Per-variant / product dimensions and weight
Source: Oasis website PDP for SKU 883MLA-SQ (SKU verified matching; values consistent with catalog footprint/uprights/ribs).
- Footprint: 120"x120" (10'x10' / 3m x 3m)
- Height: 127.8"/323.1cm
- Clearance: 91.9"
- Leg Pole Diameter: 2"/5cm
- Weight: 285 lbs./129.27 kg
Single variant (883MLA-SQ), so the product-level dimensions string above carries these; the variant can stay null and fall back.
- The three add-on walls (MLA-FW, MLA-SW, MLA-HC) have NO published specs/dimensions anywhere. They carry no dimension data (selector options only).

## Images
- Folder: additional_frankford_images_6-25-26/Marella_Luxury_Cabana/
- Gallery rule: the file ending in _primary loads as primary (display_order 0); all other files load as secondary in order.
- ROUTING EXCEPTION: three add-on config images live in this same folder and must NOT load into the product gallery. Route these to the add-on selector instead:
  - MARELLA_-FULL-WALL.jpg  -> MLA-FW selector image
  - MARELLA_-FULL-BACK.jpg  -> MLA-SW selector image
  - MARELLA_-FULL-BREEZE_1.jpg  -> MLA-HC selector image
  Only the remaining files (the _primary file plus any other gallery shots) follow the gallery rule.

## OPEN ITEMS
None. Marella is fully specced and ready.

Settled this pass: name "Marella Resort Cabana"; finishes SR Platinum free + 6 upcharges (no MS); dimensions/weight from the verified 883MLA-SQ PDP; recommended base 30G-MLA with the other Marella-specific plates/mounts optional and no forced quantity; category Umbrellas (id 38) with net-new sub_category "Cabana"; add-on wall selector default none, multi-select, enforced MLA-HC pairing, grade-priced additive, image-routed; min-qty-5 on striped fabric or non-Platinum finish; short_description "Custom Lead Times, Call for Details"; everything admin-editable including pricing. The add-on selector still needs an agent brief to build it (the data and rules are all specified here).
