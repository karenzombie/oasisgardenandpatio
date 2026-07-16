# Agent Spec: Galtech Replacement Pole Picker (BP and BH)

## Goal

Add a two-step picker to the two Galtech replacement pole products so a customer
(or a staff agent placing an order) selects which umbrella model the pole is for,
then selects the finish. The two selections compose a real Galtech part number and
a readable line name that flow to the cart, the order, and the vendor PO.

This is a new build. The data (models and per-model finishes) is provided; see the
companion doc `galtech_pole_finish_map.md` and `galtech_pole_finish_map.csv`.

## The two products

| Product | SKU | id | Price |
|---|---|---|---|
| Bottom Pole | BP | 4966 | $60.00 |
| Bar Height Pole | BH | 4967 | $70.00 |

Both get the SAME picker, the SAME 28-model list, and the SAME per-model finishes.
Everything below applies identically to BP and BH.

## Customer flow (on the BP or BH product page)

1. Step 1, Umbrella model. A selector listing the 28 in-scope Galtech umbrella
   models (see the map). Show the model name and its model number so a customer
   can recognize their umbrella, e.g. "Deluxe Auto Tilt Umbrella 9' (737)". 28 is a
   lot for a plain dropdown; a searchable and/or grouped (Aluminum / Wood / Teak)
   selector is preferred, but the grouping is a design choice, not a requirement.
2. Step 2, Finish. Only AFTER a model is chosen, show the finishes available for
   THAT model (from the map). Reuse the existing umbrella finish swatch UI so the
   chips look consistent (the finishes are the same `finishes` rows, by id, and
   carry swatch images). If a model has only one finish, auto-select it.
3. Add to Cart is disabled until both a model and a finish are selected (finish
   auto-selected counts as selected). This mirrors how the umbrella PDP gates Add
   to Cart until required options are chosen.

The pole image does not change with selections (same as the umbrellas; keep the
existing "image does not update with your selections" note).

## Composed SKU (real Galtech part number)

```
{poleSku}-{modelSku}-{finishCode}
```

- `poleSku` = BP or BH
- `modelSku` = the umbrella model SKU (e.g. 986, 772, 532TK)
- `finishCode` = the finish's `item_number` (e.g. AB, BK, SR). ALWAYS take the code
  from `finishes.item_number`. Never abbreviate a finish name by hand. Bronze is
  MB, not BR.

Examples: `BP-986-AB`, `BH-772-AB`, `BP-131-LW`, `BH-532TK-TK`.

This is a real Galtech-orderable part number and is what goes on the vendor PO.

## Composed line name

```
{poleName}-{modelName}-{finishName}
```

Joined by hyphens with no surrounding spaces, e.g. `Bottom Pole-Half Wall-Antique Bronze`.

- `poleName` = "Bottom Pole" or "Bar Height Pole"
- `finishName` = the finish name (e.g. "Antique Bronze")
- `modelName` = the FULL stored umbrella product name, exactly as in the DB (e.g.
  "Half Wall 3.5x7'"). Do not trim, drop the size, or otherwise alter it. So model
  772 in Antique Bronze composes to `Bottom Pole-Half Wall 3.5x7'-Antique Bronze`.

This composed name is the line label shown on the cart, the order, and the PO.

## Pricing

The pole price is the product's single price (BP $60, BH $70) for ALL models and
finishes. No price variation by model or finish. Do not add any per-model or
per-finish price adjustment.

## Cart, order, and vendor PO

- Cart line stores the composed SKU, the composed name, and the pole's price.
- The order line shows the composed name and composed SKU.
- The vendor PO line uses the composed SKU (real Galtech part number) and the
  composed name.
- Quantity behaves normally.

## Staff admin order flow (required, not optional)

The same two-step picker (model then finish, same map, same composed SKU and name)
must be available when a staff agent creates or edits an order for a customer, so a
staff-placed BP/BH line carries the identical composed SKU and name. This is part
of the scope, not a follow-up.

## Data

Use `galtech_pole_finish_map.md` / `galtech_pole_finish_map.csv`:
- 13 finishes with id and code (item_number).
- 28 models, each with material and its available finishes (code and name).
Wood and teak models are IN scope. Finishes per model range from 1 to 8.

The map was derived from the live umbrella variant data. Do not invent any model,
finish, or code not present in the map. If a model or finish seems missing, stop
and ask rather than adding it.

## Implementation notes (agent decides the mechanism)

- The key new behavior is the DEPENDENT two-step selection: the finish options
  depend on the chosen model. The existing umbrella picker is a single combined
  option list, so this is a new pattern, not a reuse of that exact control.
- Whether the model-to-finish map is stored as config, as generated variants under
  BP/BH, or as a small lookup is your call, but it must produce the exact composed
  SKU and name rules above, and it must be the single source both the customer PDP
  and the staff order UI read from (no divergence between the two surfaces).
- Reuse the finish swatch component/styling from the umbrella PDP for the finish
  step so it looks native.

## Do NOT

- Do not include the cantilever models 887, 897, 899.
- Do not fabricate any model, finish, code, price, or SKU outside the provided map.
- Do not change the umbrella products or their variants; this build is only about
  the BP and BH pole products consuming the model/finish data.
- Do not trim or alter model names in the composed line name; use the full stored
  name exactly.

## Checkpoints

- Checkpoint 1: after wiring the data and the customer PDP picker (both poles),
  stop. Report how the map is stored and show the composed SKU and name for a
  couple of examples (a multi-finish model like 727 and a single-finish model like
  772). Do not proceed to the staff UI until confirmed.
- Checkpoint 2: after the staff admin order flow, stop and report.

## Verification (walkthrough, not just typecheck)

1. Customer PDP, both BP and BH:
   - Multi-finish model (e.g. 727): pick it, confirm 8 finishes show; pick Silver,
     confirm SKU shows `BP-727-SR` and the name composes correctly; Add to Cart
     enabled only after both picks.
   - Single-finish model (e.g. 772): confirm the one finish auto-selects and the
     SKU is `BP-772-AB`.
   - Wood/teak model (e.g. 131 or 532TK): confirm wood/teak finish and SKU
     (`BP-131-LW`, `BP-532TK-TK`).
   - Add to cart; confirm the cart line shows the composed SKU, composed name, and
     the correct pole price.
2. Staff order flow: create an order with a BP line via the staff UI; confirm the
   same picker and the same composed SKU and name land on the order.
3. Confirm the composed SKU and name appear correctly on the vendor PO for that
   order.
4. Do not sync to prod (Karen handles that).
