# Frankford Finish Upcharge - Replit Implementation Brief

## Context

Frankford umbrellas currently price along these dimensions:
1. Size variant (each umbrella has multiple sizes/configurations)
2. Fabric grade (A, A+, B, C, D, E, F), stored per variant with both an MSRP and a sale price
3. Wind vents on some products

The fabric picker shows the umbrella's total price for the selected fabric grade,
and each fabric swatch shows the price at that fabric's grade.

Frankford is adding a NEW pricing dimension: a per-finish upcharge on the frame finish.
The standard finish, MS (Brushed Silver), is included at no extra cost. The other six
finishes (Golden Oak, Heather Willow, Onyx, Alpine White, Desert Bronze, Carbon) add a
fixed amount that varies by umbrella line.

Frankford is the first and currently only manufacturer using finish upcharges. Every
other manufacturer's finishes must continue to behave exactly as they do today (no upcharge).

## Build on the existing pricing infrastructure (do not duplicate)

The product pricing model already supports a `pricing_mode` per product with three modes:
"Fixed price (manual)", "Cost + markup %", and "MSRP - dealer rate". The "MSRP - dealer rate"
mode already derives a sell/sale price from MSRP and a rate. The per-manufacturer discount
rate described below should reuse or extend that existing dealer-rate mechanism, not a new
parallel system.

Note: the Frankford umbrellas are currently on "Fixed price (manual)", with the 10% already
baked into the entered Sale price. Do not change any existing product's stored prices as part
of this work. If a live, rate-driven derivation for existing products is wanted later, that
is a separate task to scope and approve on its own.

## Data model change

Add two columns to `product_finish_options`:

    upcharge_msrp   numeric  NOT NULL  DEFAULT 0
    upcharge_sale   numeric  NOT NULL  DEFAULT 0

Because both default to 0, every existing finish link (and every other manufacturer)
keeps its current behavior with no change. Only Frankford rows will receive non-zero
values, and those values will be loaded separately as reviewed catalog data (not entered
by the agent).

The upcharge is a flat per-(product, finish) amount. It does NOT vary by fabric grade,
so it must NOT go in `variant_grade_prices`.

## Pricing math

Once the customer has chosen a size variant and a fabric (which determines the grade),
and then selects a frame finish:

    total_regular = variant_grade_regular(selected grade) + upcharge_msrp(selected finish)
    total_sale    = variant_grade_sale(selected grade)    + upcharge_sale(selected finish)

Mapping to the admin fields: "total_regular" is the regular price shown struck-through
(the admin "Sell price", which for Frankford equals the "MSRP" field), and "total_sale" is
the discounted price the customer pays (the admin "Sale price"). The finish upcharge is
purely additive: add upcharge_msrp to the regular price and upcharge_sale to the sale price.
No other pricing path changes.

## Picker UI (mirror the existing fabric picker)

- The Frame Finish selector lists each finish wired to the product (swatch + name),
  using the same visual pattern as the fabric picker.
- Show the upcharge on each finish option as an added amount, not a total: display nothing
  (or "Included") when the upcharge is 0, otherwise show it as a plus-delta, for example
  "+$940". Do not show a combined total on the finish swatch (the total depends on the
  selected fabric grade and is computed per the Pricing math section).
- Selecting a finish updates the running total per the math above.
- Frame Finish stays a required selection (it already is).

## Sale-price convention (per-manufacturer rate)

Sale price is derived from MSRP and a discount rate. Notes:

1. The discount rate is PER MANUFACTURER, not store-wide. Frankford is 10% today; other
   manufacturers use different rates. It must be a client-editable setting and must not be
   hard-coded.

2. SCOPE LIMIT (important): within this brief, the only value that auto-derives from the
   rate is the finish upcharge's own sale value (upcharge_sale, below), and only when a
   staff member sets or edits that upcharge. Whether changing a manufacturer's rate should
   also re-derive that manufacturer's EXISTING product sale prices across the catalog is a
   separate, larger decision and is OUT OF SCOPE here. Do NOT bulk-recompute, and do NOT
   overwrite any existing, manually-entered sale prices as part of this work.

For the finish upcharge specifically:

    upcharge_sale = round(upcharge_msrp * (1 - manufacturer_discount_rate))

Store both upcharge_msrp and upcharge_sale so the picker reads them directly. Recompute
upcharge_sale only for the specific finish/product being edited, at the moment a staff
member changes its MSRP upcharge.

## Admin / staff portal (must be client-updatable)

The finish upcharge must be viewable and editable by staff through the existing admin UI,
in the same place finishes are assigned to a product. This cannot be code-only or
script-only; the client needs to adjust these prices themselves over time. Requirements:

- Add an editable MSRP upcharge field next to each finish assigned to a product, on the
  existing product finish-management screen. Do not build a separate screen.
- Staff enter only the MSRP upcharge. The sale upcharge is computed and stored
  automatically as msrp * (1 - discount_rate), rounded; no separate manual entry.
- A per-manufacturer, client-editable discount rate is needed to compute the sale upcharge.
  If a suitable rate already exists (for example, tied to the "MSRP - dealer rate" mode),
  reuse it; if not, propose where to add it (manufacturer level) and confirm before building.
  Do not create a duplicate rate field or refactor existing pricing without approval.
- A 0 or blank upcharge means the finish is included at no charge. This is the default,
  and the case for MS (Brushed Silver) and for all non-Frankford finishes.
- Saving persists to product_finish_options.upcharge_msrp and upcharge_sale.

## Guardrails (do not break)

- Do not modify fabric, size/variant, fabric-grade, or wind-vent pricing logic.
- New columns default to 0; no product changes behavior until upcharge data is loaded.
- The change applies uniformly to all manufacturers' finish pickers; non-Frankford
  finishes simply carry a 0 upcharge and therefore display and price exactly as before.
- Do NOT populate any Frankford finish upcharge values. That data will be provided
  separately as a reviewed, catalog-verified load.
- The upcharge must be editable by staff in the existing admin product/finish screen.
  Do not hard-code Frankford finish upcharge values anywhere in code.
- Do not hard-code the discount rate (10%) anywhere; it is a per-manufacturer,
  client-editable setting so each manufacturer's rate can change without a code change.
