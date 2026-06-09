---
name: TG wind-vent (SWV/DWV) combined variants
description: How Single/Double Wind Vent is modeled on Treasure Garden umbrellas and rendered on the PDP.
---

# Combined Finish × Wind Vent variants (Treasure Garden umbrellas)

TG market umbrellas offer a wind-vent choice (Single = SWV, Double = DWV) on top of
their frame finish. There is no separate variant dimension in the schema, so the two
choices are folded into ONE combined variant row per (finish, vent):

- SKU convention: `${finishSku}-SWV` / `${finishSku}-DWV` (suffix owned by
  `scripts/src/seedTgWindVents.ts`).
- Each combined variant carries absolute `msrp`/`salePrice` (reuses the rugs
  absolute-per-variant pricing path). SWV = the umbrella's flat catalog price; DWV
  varies by finish for some models (SS/WO finishes priced higher on UM841/UM840/UM810).
- `optionLabel = "Finish & Wind Vent"`, `variantName = "{Finish} – Single/Double Wind Vent"`.

**PDP (`Product.tsx`):** detects this mode via any variant SKU matching `/-(SWV|DWV)$/`
and renders TWO independent selectors (Frame Finish + Wind Vent) with NO default,
splitting the combined variant back via `finishKeyOf`/`ventOf`/`finishLabelOf` and
re-deriving the single `variantId`. Galtech umbrellas use a single "Vent Type"
dimension (no `-SWV/-DWV` suffix) and keep their original single picker untouched.

**Spec image:** the SWV/DWV comparison diagram shows in the Specifications tab for ANY
umbrella whose variants have "vent" in `optionLabel` or name (covers Galtech "Vent Type"
AND TG "Finish & Wind Vent").

**Why / gotcha:** A product with absolute-priced variants STILL needs a non-null
product-level `price`/`salePrice`, because the PDP buy-gate (`hasPrice`/`canBuyOnline`)
and the server cart check read the product price, not the variant. UM970 had a NULL
catalog price and was unsellable until the seed set its product price to the SWV value.
When adding absolute-variant products, always set a product-level price too.

**Swatch gotcha:** the by-slug endpoint matches each variant's frame-finish swatch by
EXACT variant name against the finishes catalog. Renaming variants (e.g. appending a
vent suffix) drops the swatch — so the endpoint strips the vent suffix before matching.
Separately, the finish catalog name must equal the variant's finish label, or the swatch
never resolves (TG shipped "Silver Shadow, Anodized" vs variant "Silver Shadow"; the
seed renames the finish to align them). Do NOT fuzzy/prefix-match finishes — "Black"
would falsely match "Black Cherry".
