---
name: Finish swatch ↔ product variant linkage
description: How to recover a frame-finish swatch image for a product variant, given there is no FK.
---

# Finish swatch ↔ product variant linkage

Product "frame finish" options are stored in `product_variants` (variantName like
"Bronze", optionLabel "Frame Finish"). The swatch IMAGES for finishes live in a
SEPARATE catalog table `finishes` (columns: manufacturerId, name, imageUrl,
description). **There is no foreign key** between `product_variants` and `finishes`.

To attach a finish swatch to a variant (or to an order item's finish snapshot),
match on `finishes.manufacturerId == product.manufacturerId` AND
`lower(finishes.name) == lower(variantName)`.

**Why:** the two were modelled independently (variants = orderable SKUs; finishes =
brand swatch library). The only reliable join key is manufacturer + name.

**How to apply:** never `leftJoin` finishes directly into the variant/order-item
query — duplicate finish names (same name, different `description` category) would
multiply rows. Instead run ONE finishes query for the manufacturer(s), build a
name→imageUrl map (first-write-wins ordered by displayOrder,id), then attach in JS.
Always wrap the resulting URL with `toPublicImageUrl()`. Fabrics, by contrast, DO
have a proper FK (`product_fabric_options` → `fabrics.swatchImageUrl`) and can be
joined directly.
