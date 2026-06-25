# Per-Variant Dimensions and Weight Display - Replit Implementation Brief

## Context

Umbrella products have multiple size variants (configurations), and each size has its
own dimensions, weight, and SKU. Today the product detail page shows a single static
dimensions string taken from the product level, so it does not change when the customer
selects a different size. The variant SKU and name already update on selection; the
dimensions and weight do not.

Goal: when a customer selects a size/configuration, the displayed dimensions and weight
update to match that size. On page load, default to the lead variant.

## Schema change

`product_variants` already has a `weight` column. Add one column:

    dimensions   text   NULL

to `product_variants`. Nullable, no default, so every existing variant row is unaffected.

The product-level `products.dimensions` and `products.weight` stay in place as a fallback.

## Display behavior (product detail page)

- On load, show the lead variant's dimensions and weight (the variant with the lowest
  display_order), along with its SKU and name as it does today.
- When the customer selects a different configuration, update the displayed dimensions,
  weight, and SKU to that variant.
- Fallback: if the selected variant's `dimensions` is null, fall back to the product-level
  `products.dimensions` (and `products.weight`). This keeps the display correct for any
  product whose variants are not yet populated.

## Admin / staff portal

- Add a per-variant `dimensions` field where variants are managed, next to the existing
  variant SKU / name / weight fields. Editable, saved to `product_variants.dimensions`.

## Guardrails (do not break)

- The new column is nullable with no default. Any product without per-variant dimensions
  keeps showing the product-level string exactly as it does today. No behavior changes
  until per-variant data is loaded.
- Do not change variant pricing, grade prices, fabric, or finish logic.
- Do not remove or alter `products.dimensions` or `products.weight`; they remain the
  fallback source.
- Populate both the per-variant dimensions and weight values from the reviewed dataset
  provided alongside this brief. Do not infer, generate, or read these values from any
  other source.
