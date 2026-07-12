# Homecrest Fabric Pool Rewire

## Background

The fabric pools on Homecrest seating products are currently wired incorrectly -- some products have the wrong fabrics assigned. We have built a corrected source of truth and need you to rewire every product's fabric pool to contain exactly the correct fabrics for that product's type.

Two reference files are attached:

1. `homecrest_fabric_rewire.csv` -- lists every Homecrest product that needs fabric wiring, with a `correct_fabric_code` column (A, S, PS, or C) sourced directly from the manufacturer sell sheets
2. `homecrest_fabrics_final.csv` -- lists every Homecrest fabric with YES/NO columns for each availability code (S, A, PS, C, U, V, W)

---

## What the codes mean

- **A** = Air -- fabrics where the A column = YES
- **S** = Sling -- fabrics where the S column = YES
- **PS** = Padded Sling -- fabrics where the PS column = YES
- **C** = Cushion -- fabrics where the C column = YES

Each code is independent. A fabric can have YES in multiple columns -- for example a fabric with S=YES and A=YES is available for both Sling and Air products. When wiring an Air product, include that fabric. When wiring a Sling product, also include that fabric. They are not a combined type.

---

## The task

For each product in `homecrest_fabric_rewire.csv`:

1. Look up the product by `product_id`
2. Look up the `correct_fabric_code` for that product
3. From `homecrest_fabrics_final.csv`, find all fabrics where that code's column = YES -- these are the fabrics that belong on this product
4. Rewire that product's fabric pool so it contains exactly those fabrics and no others

The `db_id` column in `homecrest_fabrics_final.csv` is the fabric's ID in the database.

---

## Important rules

- Every product in the rewire CSV must be processed -- all 107 products
- Use `homecrest_fabrics_final.csv` as the sole source of truth for which fabrics belong to each code -- do not use the existing DB fabric data as a reference
- manufacturer_id for all Homecrest fabrics is 16
- Do not touch any products not listed in `homecrest_fabric_rewire.csv`
- Do not touch any other manufacturer's fabric wiring


