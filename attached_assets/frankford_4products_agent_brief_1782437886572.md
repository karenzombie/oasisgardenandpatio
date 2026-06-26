# Frankford - Build 4 New Products + Add-On Schema - Replit Agent Brief

## What this is
Build and load four new Frankford Umbrellas products (manufacturer_id 28), plus the new
configurable add-on capability that one of them needs. All per-product data lives in four
review specs handed to you alongside this brief. This brief is the orchestration: what to
build, what to load, from where, and the rules.

Drop alongside this brief (the authoritative data, already reviewed - do not re-derive):
- frankford_nova_spec.md
- frankford_avalon_spec.md
- frankford_emerald_coast_spec.md
- frankford_marella_spec.md

The products:
1. Nova (Nova Giant Telescoping Market) - giant market umbrella, 2 variants
2. The Avalon - fiberglass beach umbrella, 4 variants
3. The Emerald Coast - steel-frame beach umbrella, 2 variants (vinyl omitted)
4. Marella Resort Cabana - 10x10 cabana, 1 variant, plus a configurable wall add-on system (NEW build)

Category for all four: Umbrellas (category_id 38). available_online true, show_price_online true.

## CRITICAL GUARDRAILS (read first)
- All values (names, SKUs, prices, dimensions, finishes) come ONLY from the four spec files.
  Do NOT fabricate, infer, or pull from any other source. If a value is missing, stop and ask.
- Sale prices in the specs are final (computed as ceil(MSRP x 0.90)). Load them exactly as written; do not recompute or round differently.
- Match on exact SKU. No prefix/suffix matching for any insert, update, or recommendation link.
- PREVIEW BEFORE COMMIT: before writing any product/pricing rows to the database, produce a
  preview/dry-run summary (per product: rows to insert, variant grade-price tables, finish
  upcharges, recommendation links) and get sign-off. Pricing data must be reviewable before it commits.
- Follow the existing contract-first OpenAPI pattern (OpenAPI schema -> codegen -> API routes ->
  admin), the same way the per-variant dimensions field was added.
- Everything new must be admin/staff-editable, INCLUDING pricing (see Admin editability below).

## Per-product data load (from the specs)
For each product, load: the products row; product_variants (with dimensions + weight where the
spec gives them); variant_grade_prices (grade -> msrp, sale_price); product_finish_options where
the product has finishes; product_fabric_options (copy the shared acrylic canopy pool from the live
Eclipse product - it is the same pool all the umbrellas share, about 1041 options; copy whatever
Eclipse currently has rather than assuming a fixed count); product_recommendations; and images.

All recommendation/base/accessory target SKUs ALREADY EXIST in the database (verified against a full
Frankford product pull). LINK recommendations to these existing SKUs - do NOT create new base or
accessory products. Confirmed existing: Nova bases NGU550 / NGU-DP / IG-GIANT; Marella plates and
mounts 30G-MLA / 36G-MLA / 36G-SQ-MLA / 30Gx2-MLA / 30G+24G-MLA / DP-ST-MLA / IG-ST-MLA /
SS-DB-4-Marella and the stem MLA-8ST2; beach accessories 30-SA / CB01 / Sand Anchor.

Product-specific notes:
- Nova: 2 variants (896NGU, 8110NGU-SQ). 7 finishes with upcharges. Recommended bases NGU550
  (recommended), NGU-DP, IG-GIANT. Variant dimensions are in the spec - write them inline (the
  product_variants.dimensions column already exists). After Nova exists with these exact SKUs, the
  two rows the variant-dimensions loader skipped last session are covered; a loader rerun is optional.
- The Avalon: 4 variants. Lead/default variant 844FWB-01. Finish is Ash Wood only (single, no
  upcharge, no picker). All 4 variants share the same dimensions/weight, so the product-level
  dimensions cover them (variants may stay null and fall back). Recommended accessory 30-SA;
  CB01 and Sand Anchor as alternatives.
- The Emerald Coast: 2 acrylic variants only (845W, 639W). The vinyl variants are OMITTED - do not
  load them. Lead variant 845W. Finish Ash Wood only. Both variants share dimensions/weight.
  Recommended accessory 30-SA; CB01 and Sand Anchor as alternatives. (639W is verified not to
  collide with any existing SKU.)
- Marella: 1 variant (883MLA-SQ). sub_category "Cabana" - this value does NOT exist in the project
  yet, so add it as a net-new sub_category. Finish SR Platinum standard + 6 upcharge finishes.
  Recommended base 30G-MLA (cheapest plate). Use the Marella-specific base SKUs only: the other
  Marella plates and the DP-ST-MLA / IG-ST-MLA / SS-DB-4-Marella mounts as optional. DO NOT use the
  generic DP-ST / IG-ST, which are the Giant/Nova versions. Do NOT force a quantity of 4 plates (the
  "4 plates required" note is informational). Plus the add-on system below.

## NEW BUILD 1 - Marella configurable wall add-on system
Marella has three wall add-on options the customer configures on the product page. This is the main
new build. Store them as data (not hardcoded) and make them admin-editable including pricing.

The three options (full data, including per-grade pricing, are in frankford_marella_spec.md):
- MLA-FW "Full Privacy Tension Wall"  (selector image: MARELLA_-FULL-WALL.jpg)
- MLA-SW "Full Curtain Split Wall"    (selector image: MARELLA_-FULL-BACK.jpg)
- MLA-HC "Entrance Half Curtains" pair (selector image: MARELLA_-FULL-BREEZE_1.jpg)

Selector behavior:
- DEFAULT none. No wall selected unless the customer clicks one. "None" is valid.
- MULTI-SELECT: none, or any/all of the three. Additive pricing (each selected option adds its upcharge).
- GRADE-PRICED: each option's upcharge is pulled from the column matching the fabric grade the
  customer chose for the main canopy. The walls use the SAME fabric and grade as the canopy.
  (Future, not now: allowing a different wall fabric than the canopy.)
- ENFORCED PAIRING: if the customer selects MLA-FW or MLA-SW, MLA-HC is automatically required and
  added (the half curtains cap the wall ends). Reuse the existing add-on/multi-select pattern already
  built for other items/manufacturers.
- IMAGE ON SELECT: each option shows its image (the three files above) in the selector.
- Replacement stem MLA-8ST2 (flat MSRP 216 / sale 195) is available as a flat-priced add-on/
  replacement; it is included x4 with the cabana, so this is for replacements.

## NEW BUILD 2 - Marella minimum-order-quantity rule
Mirror the existing striped-fabric minimum-quantity logic, extended to finish:
- Striped fabric selected -> minimum quantity 5 (existing behavior).
- Any frame finish OTHER than SR Platinum (WG, HW, BK, BZ, WH, CB) -> minimum quantity 5 (new).
- Customer can increase but never go below 5 while either condition holds.
- Conflict (striped fabric AND non-Platinum finish): minimum 5, plus a display note that the quantity
  cannot be reduced due to the selected finish.

## NEW BUILD 3 - net-new sub_category "Cabana"
Add "Cabana" as a sub_category value (does not exist yet) and assign it to Marella. The other three
products leave sub_category null for now (a later full sub_category pass handles them).

## Admin / staff portal editability (applies to ALL of the above)
Everything must be editable through the admin/staff UI, not hardcoded, so the client can maintain it
without a developer. This explicitly includes PRICING. Make editable: variant grade prices for all
four products; finish options and their upcharges; the three Marella wall add-ons (names, images,
enabled state, and per-grade pricing); the replacement stem price; the minimum-quantity threshold and
the display-note text (where the existing striped-fabric pattern allows); and recommendations. Use the
same hydrate/save round-trip used for the per-variant dimensions field.

## Images
All four image folders are in the workspace root under additional_frankford_images_6-25-26/ :
- Nova/
- Avalon_Fiberglass_Beach/
- Emerald_Coast_Classic_Steel_Beach/
- Marella_Luxury_Cabana/

Rules:
- In each folder, the file whose name ends in _primary is the primary image (display_order 0). All
  other files load as secondary gallery images in order.
- Upload the folder images into object storage and reference them in the product images JSON (the
  storefront expects /api/storage/objects/... URLs; the workspace files are not yet at those URLs).
- MARELLA ROUTING EXCEPTION: the Marella folder also contains the three wall add-on images
  (MARELLA_-FULL-WALL.jpg, MARELLA_-FULL-BACK.jpg, MARELLA_-FULL-BREEZE_1.jpg). These must NOT load
  into the product gallery. Route them to the add-on selector (mapping above). Only the remaining
  files (the _primary plus other gallery shots) follow the gallery rule.

## Post-build / deploy notes
- Schema parity: the product_variants.dimensions column added last session still needs to be added to
  PROD before the next deploy. Include this in publish-readiness.
- Any new tables/columns created for the wall add-on system also need to be migrated to prod before deploy.
- Typecheck, by-slug serialization, and check-image-urls should pass; request an architect review like last time.

## Report back
When done (or at the preview stage), report per product: rows inserted, variant grade-price tables,
finishes wired, fabric options copied (count), recommendations linked, images loaded (and the three
Marella selector images routed correctly), and the add-on/min-qty behavior verified on the Marella PDP.
