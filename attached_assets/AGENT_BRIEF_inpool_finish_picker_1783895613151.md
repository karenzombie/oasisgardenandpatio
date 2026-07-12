# Agent brief: render the finish picker for Homecrest In-Pool Series

## Problem

The In-Pool Series products are fully wired in the database. 29 products have a
`product_finish_pools` row and a full set of `product_finish_options` rows. None of them
render a finish picker on the PDP.

The picker component currently only renders when `finishes.description` matches
`frame finish` (case insensitive). That is why the Homecrest frame finishes (IDs 290 to
300, description "Frame finish") work today.

The In-Pool finishes use different descriptions, so the gate fails and the picker is
skipped:

- "In-pool polyethylene body finish"
- "Seat pad & head pillow polyethylene finish"
- "Polyethylene body finish"

## What to change

Stop gating the picker on the finish description. Render the picker whenever a product has
rows in `product_finish_options`.

Everything else stays the same. Use the exact same component, layout, swatch rendering,
selection behavior, and PDP placement already used for the Homecrest frame finish picker.
This is a render condition change, not a new component.

## Data shape

Standard Homecrest wiring, identical to every other collection:

- `product_finish_pools`: 1 row per product (`product_id`, `manufacturer_id` = 16)
- `product_finish_options`: 1 row per finish (`product_id`, `finish_id`, `display_order`,
  `upcharge_msrp` = 0, `upcharge_sale` = 0)

Read the options for the product, order by `display_order`, render one swatch per row.

## Do NOT group by description

Important. Do not build the picker by grouping finishes on their `description` value.

The In-Pool body color set contains 8 finishes. 7 of them have the description
"In-pool polyethylene body finish" and 1 of them (528 White Granite) has
"Polyethylene body finish". Grouping on description would split that single picker into two.

Each product gets exactly ONE picker containing ALL of its `product_finish_options` rows.
No product needs two pickers.

## Picker label

Use "Finish".

## Expected result on the PDP

- 25 In-Pool products show 8 color swatches
- 1 product (SPL3300PLW, Lounger Head Pillow) shows 3 swatches
- 3 products (SPLRP1UNIT, SPLRP4PACK, SPLRP10PACK, Portable Seat Pad) show 3 swatches
- 1 product (SPLRPCADDY, Portable Seat Pad Caddy) shows no picker, it has no finish rows

## Scope

Frontend only. Do not touch any data. Do not modify any row in `finishes`,
`product_finish_pools`, or `product_finish_options`. The data is committed and verified.

Do not change the frame finish picker behavior for any other Homecrest collection. Removing
the description gate must not regress collections that already render correctly.
