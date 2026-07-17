# Treasure Garden Replacement Parts - Picker Build Brief

## What this is

Build a single combined product, "Treasure Garden Replacement Parts," with a
guided picker: the customer chooses Part Type (Frame or Bottom Pole), then their
umbrella Model, then a Finish. That selection resolves to one specific variant
carrying the correct composed SKU and price, which is what goes to cart and,
ultimately, the vendor PO.

This is close to the existing Galtech replacement-pole picker but combined into
one product with a part-type step in front, and with prices living on the
variants (Galtech's pole variants are unpriced; these are not).

Manufacturer: Treasure Garden (manufacturer_id = 12). Category: Replacement
Parts (category_id = 41).

## Read the existing precedents FIRST

Do not design anything until you have read these. They already solve most of
this and set the conventions to match:

1. `artifacts/web/src/lib/galtech-pole-map.ts` - the Galtech pole model/finish
   map and `composedPoleSku`.
2. `artifacts/web/src/pages/Product.tsx` - the `isPoleProduct` 2-step picker
   (Model then Finish), and separately the `finishVariantMode` block (finish
   lives in the variant, finish choice picks the variant, price comes from the
   variant). Both are directly relevant.
3. `lib/db/src/schema/cart.ts` and `lib/db/src/schema/orders.ts` - how a line
   stores selections (`variantId`, `finishId`, etc.) and how `order_items`
   snapshots the printed description (`variantNameSnapshot`, `description`,
   `poSku`, `poDescription`, `poSubDescription`).

## Source data

The complete variant list is provided in `tg_replacement_parts_master.csv`
(130 rows), in the workspace. Each row is one part-and-finish and carries: Part
Type, Item Stub, Pole Height, Finish Code, Finish Name, Composed SKU, Display
Name, Fits Model (Code), Fits Model (Name), short_description, MSRP, Sale Price.

This CSV is the source of truth for what exists. Karen creates the combined
product and loads its variants into the database from this file via a shell
script she runs herself. You do NOT create the product row and you do NOT load
this data. Your job is schema (if needed) and the frontend/code. See "Ownership
and sequencing" below for exactly who does what and when.

Key facts from the data you need to honor:

- Finish codes are two-digit: 00 Bronze, 02 Anthracite, 03 White, 09 Black, plus
  1H Hardwood, SS Silver Shadow, WO Weathered Oak. These already exist as
  `finishes` rows for manufacturer_id 12.
- Composed SKU = item stub with the "_" placeholder replaced in place by the
  two-digit finish code, no added characters. Example: BP32-810_ + 00 =
  BP32-81000. AKZP13-_ + 09 = AKZP13-09. One stub, BP36-8091, has no placeholder
  and a single finish (1H); its SKU stays BP36-8091.
- Frame price varies by finish tier (e.g. AKZP13 is 1960 in SS/WO but 1805 in
  00/02/09). This is handled by having separate priced variants per finish, NOT
  an upcharge table. The price is already on each row in the CSV. Do not build an
  upcharge mechanism.
- A single bottom pole fits several umbrella models (see the Fits Model columns).
  A frame maps to exactly one model.
- Category: Replacement Parts, category_id = 41 (confirmed). The product belongs
  here. This is set by Karen's load script; noted so the picker code can rely on
  it.
- Umbrella model names render EXACTLY as they appear in the data, which is the
  manufacturer's all-caps form (AKZ PLUS 13', AUTO TILT 9'). Do not title-case,
  reformat, or otherwise transform them anywhere: not in the dropdown, not in the
  assembled name, not on the order or PO.

## Naming (prints on cart, order, and vendor PO)

- Frame: `Replacement Frame for {Model} in {Finish}`
  e.g. `Replacement Frame for AKZ PLUS 13' in Bronze`
- Pole: `Bottom Pole {Height} for {Model} in {Finish}`
  e.g. `Bottom Pole 32" for AUTO TILT 9' in Bronze`

For a pole, `{Model}` is the umbrella the customer selected in the picker, filled
in at selection time. It is not fixed on the pole (one pole fits several models).

## Ownership and sequencing (read carefully, order matters)

There are two hands on this: Karen runs shell scripts for all data; you do schema
and frontend/code. The steps interleave, so the order is:

1. You complete Gate 0 (design proposal) and, if needed, Gate 1 (schema). No
   product or variant data exists yet at this point.
2. AFTER the design is approved and any schema is in place, Karen runs her load
   script, which creates the combined "Treasure Garden Replacement Parts" product
   (manufacturer_id 12, category_id 41) and its 130 variants from the CSV.
3. ONLY THEN do you build and test the picker (Gate 2 onward). The product and
   its variants will exist in dev for you to wire to and walk through.

Do not attempt Gate 2 before Karen confirms the data is loaded; there will be
nothing to test against. If you reach that point and the product is not present,
stop and tell Karen rather than creating anything yourself.

## Identifying the product in code

The existing Galtech picker keys off hardcoded product ids (4966, 4967). This
product's id is not known until Karen's load script runs. At Gate 0, propose how
the picker reliably detects this product (for example, by its id captured after
load, or by a stable attribute), and confirm the method with Karen before wiring
it. Do not assume an id.

## The one design question to resolve before building

A pole's variant SKU (BP32-81000) identifies the pole and finish but NOT which
umbrella the customer picked. The customer's model choice has to travel with the
line so the name above renders correctly on the order and PO. The cart/order line
today has no field for a selected model.

Before writing any build code, inspect the schema and the Galtech/finishVariant
flows, then propose to Karen:

1. How the picker is structured (part type, model, finish) and where the model
   and fits-model relationship come from so it stays consistent with the existing
   Galtech approach.
2. How the selected umbrella model is stored on the cart line and snapshotted
   onto the order line so it prints on the customer order and the vendor PO.

Stop at this proposal and wait for Karen's approval. Do not build past it.

## Phasing and check-in gates

Work one phase at a time. After each phase, stop, show the actual diff and real
command output, and do a hands-on walkthrough in dev before moving on. A green
typecheck or build is not evidence the picker works. Karen will verify each gate.

Gate 0 - Design proposal (above). Approval required before any code.

Gate 1 - Schema only, if the design needs a new field for the selected model.
Show the migration and confirm it applies cleanly. No UI yet.

Gate 2 - Picker UI on the product page (only after Karen confirms the product and
variants are loaded): Part Type, then Model, then Finish, with the name assembling
correctly and the price updating on selection. Walkthrough in dev: pick a frame
and a pole, confirm the on-screen name, SKU, and price match the CSV for the exact
selection.

Gate 3 - Add to cart: confirm the resolved variant (SKU + finish + price) lands in
the cart, and for a pole the selected umbrella model is captured on the line.
Walkthrough: add one frame and one pole, inspect the cart line in the DB, confirm
every field including the model.

Gate 4 - Order and PO rendering: confirm the assembled name and SKU snapshot onto
the order line and print correctly on both the customer order and the vendor PO.
Walkthrough end to end with a test order.

## Hard rules

- Never fabricate any value (SKU, price, model name, finish). If the CSV or
  source does not give it, stop and ask Karen.
- Match SKUs exactly as composed in the CSV. Do not add dashes, suffixes, or
  reformat.
- Render model names verbatim from the data (all-caps, as-is). Do not re-case.
- Do not load the product/variant data yourself. That is a shell script Karen
  runs. You do schema and frontend/code only.
- Do not decide storage formats unilaterally; propose at Gate 0 and wait.
- Everything is dev only. Prod sync is Karen's to run, never yours.
- No em-dashes in code comments, UI copy, or this workstream's output.
