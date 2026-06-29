# Agent Brief: Galvanized Plate Base -- Stem and Top Cover Pickers

## Overview

The 7 galvanized plate base products listed below currently have no variants. Two new customer-selectable option pickers must be added to each base product detail page (PDP): a Stem selector and a Top Cover selector. These work similarly to the existing finish and fabric pickers on the site.

The two attached CSVs contain all pricing data:
- `galvanized_base_top_cover_variants.csv` -- top cover options per base
- `galvanized_base_stem_options.csv` -- stem options per base

---

## The 7 Base Products

| Product ID | SKU | Name |
|---|---|---|
| 5084 | 24G | Round Galvanized Steel Base 70 lbs |
| 5077 | 30G | Round Galvanized Steel Base 100 lbs |
| 5078 | 36G | Round Galvanized Steel Base 150 lbs |
| 5080 | 40G | Round Galvanized Steel Base 185 lbs |
| 5083 | 20G-SQ | Square Galvanized Steel Base 70 lbs |
| 5076 | 24G-SQ | Square Galvanized Steel Base 100 lbs |
| 5079 | 36G-SQ | Square Galvanized Steel Base 200 lbs |

---

## Picker 1: Stem Selector

The MSRP requires a stem to be purchased with these bases. However, customers may already own a stem, so the stem selection must be optional -- not forced.

**Label:** "Stem"

**Default selection:** "No Stem"

**Available stem options per base** (from `galvanized_base_stem_options.csv`):

| Base SKU | Available Stems |
|---|---|
| 24G | 8ST only |
| 30G | 8ST, 18ST, 18ST2 |
| 36G | 8ST, 18ST, 18ST2 |
| 40G | 8ST, 18ST, 18ST2 |
| 20G-SQ | 8ST only |
| 24G-SQ | 8ST, 18ST |
| 36G-SQ | 8ST, 18ST, 18ST2 |

**Stem SKUs and pricing:**

| SKU | Name | MSRP | Sale Price |
|---|---|---|---|
| 8ST | Stainless Steel Stem 8" x 1.5" | $142 | $128 |
| 18ST | Stainless Steel Stem 18" x 1.5" | $174 | $157 |
| 18ST2 | Stainless Steel Stem 18" x 2" | $216 | $195 |

**Cart behavior:** The stem SKUs already exist as standalone products in the database. When a customer selects a stem, that stem's individual SKU and price are added as a separate line item in the cart alongside the base. The base price does not change. When "No Stem" is selected, nothing is added.

---

## Picker 2: Top Cover Selector

An aluminum top cover is an optional finish-priced accessory. It is not required.

**Label:** "Aluminum Top Cover"

**Default selection:** "No Top Cover"

**Available finish options** (all 7 bases have the same 6 finish options):

| Finish Code | Finish Name |
|---|---|
| WG | Golden Oak |
| HW | Heather Willow |
| BK | Onyx |
| BZ | Desert Bronze |
| WH | Alpine |
| CB | Carbon |

**Pricing per base and finish** (from `galvanized_base_top_cover_variants.csv`):

| Base SKU | Cover SKU | WG/HW MSRP | WG/HW Sale | BK/BZ/WH/CB MSRP | BK/BZ/WH/CB Sale |
|---|---|---|---|---|---|
| 24G | 24G-TC | $374 | $337 | $206 | $186 |
| 30G | 30G-TC | $406 | $366 | $228 | $206 |
| 36G | 36G-TC | $472 | $425 | $258 | $233 |
| 40G | 40G-TC | $520 | $468 | $320 | $288 |
| 20G-SQ | 20G-SQ-TC | $406 | $366 | $228 | $206 |
| 24G-SQ | 24G-SQ-TC | $472 | $425 | $258 | $233 |
| 36G-SQ | 36G-SQ-TC | $520 | $468 | $320 | $288 |

**Cart behavior:** When a customer selects a finish color, the corresponding cover SKU (e.g. 24G-TC) and its upcharge price are added as a separate line item in the cart alongside the base. The base price does not change. When "No Top Cover" is selected, nothing is added.

**Product image:** There is one shared image for all aluminum top cover color selections. It is located in Materials > Finishes > Frankford. Use this single image for all 6 finish options across all 7 bases -- the image does not change when the customer switches finish color.

---

## Vendor PO Line Item Example

For a customer who selects base 24G + 8ST stem + Golden Oak top cover, the cart and vendor PO should contain three separate line items:

1. 24G -- Round Galvanized Steel Base 70 lbs -- base price
2. 8ST -- Stainless Steel Stem 8" x 1.5" -- $128 (sale) / $142 (MSRP)
3. 24G-TC (WG) -- Golden Oak Round Aluminum Top Cover -- $337 (sale) / $374 (MSRP)

---

## Reference

- MSRP source: 2026 Frankford MSRP, P.28 (bases and stems), P.29 (top covers)
- Manufacturer ID: 28 (Frankford Umbrellas)
- Category: 39 (Umbrella Bases)
