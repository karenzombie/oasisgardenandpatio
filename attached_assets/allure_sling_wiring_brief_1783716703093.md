# Allure Sling -- Finish & Fabric Wiring Brief

## Context

We are wiring frame finishes and sling fabrics to the Homecrest Allure Sling collection products (manufacturer_id = 16). This is the first fabric wiring for any Homecrest seating product, so execute carefully and confirm the pattern works before we proceed to other collections.

---

## Products in scope

All 16 Allure Sling products. IDs and SKUs confirmed from DB:

| id   | sku      | name                                                        |
|------|----------|-------------------------------------------------------------|
| 3926 | 11300    | Allure Armless Adjustable Chaise (with Wheels)              |
| 3925 | 11310    | Allure Armless Adjustable Chaise (Stackable)                |
| 3915 | 11350    | Allure Armless Dining Chair                                 |
| 3917 | 11370    | Allure Dining Chair                                         |
| 3919 | 11380    | Allure Chat Chair                                           |
| 3924 | 11430    | Allure Sofa                                                 |
| 3922 | 11450    | Allure Armless Bar Stool                                    |
| 3923 | 11480    | Allure Bar Stool                                            |
| 3920 | 11550    | Allure Armless Balcony Stool                                |
| 3921 | 11580    | Allure Balcony Stool                                        |
| 3916 | 12350    | Allure Armless Dining Chair (Stackable)                     |
| 3918 | 12370    | Allure Dining Chair (Stackable)                             |
| 6238 | 11300-2  | Allure Armless Adjustable Chaise with Wheels (2 Pack)       |
| 6239 | 11310-2  | Allure Armless Adjustable Chaise (2 Pack)                   |
| 6240 | 12350-2  | Allure Armless Dining Chair Stackable (2 Pack)              |
| 6241 | 12370-2  | Allure Dining Chair Stackable (2 Pack)                      |

---

## Task 1 -- Frame finish wiring

Wire all 11 Homecrest frame finishes to every product listed above.

The finish records are confirmed in the DB. IDs and names:

| finish_id | name    |
|-----------|---------|
| 290       | Carbon  |
| 291       | Fog     |
| 292       | Glacier |
| 293       | Hickory |
| 294       | Indigo  |
| 295       | Niko    |
| 296       | Onyx    |
| 297       | Sandbar |
| 298       | Sedona  |
| 299       | Storm   |
| 300       | Umber   |

For each product, insert:
- One row in `product_finish_pools` (product_id, manufacturer_id=16)
- Eleven rows in `product_finish_options` (product_id, finish_id, display_order, upcharge_msrp=0, upcharge_sale=0)

Use display_order 1-11 matching the table order above (Carbon=1, Fog=2, Glacier=3, etc.).

No upcharges -- all finishes are standard, set upcharge_msrp=0 and upcharge_sale=0.

**Before inserting**, verify no existing rows already exist in product_finish_pools or product_finish_options for these product IDs. If any exist, skip that product and report it.

---

## Task 2 -- Sling fabric wiring

Wire all 41 sling fabrics to every product listed above.

The fabric records are confirmed in the DB. IDs, names, and collections:

**Homecrest Slings (34 fabrics):**

| fabric_id | name        |
|-----------|-------------|
| 2384      | Agate II    |
| 2385      | Aluminum    |
| 2386      | Bark        |
| 2387      | Battleplan  |
| 2388      | Bisque      |
| 2389      | Cameo II    |
| 2390      | Carbon      |
| 2391      | Coral       |
| 2392      | Gannon      |
| 2393      | Glacier     |
| 2394      | Glassblock  |
| 2395      | Hickory     |
| 2396      | Indigo      |
| 2397      | Kamali      |
| 2398      | Kozo        |
| 2399      | Lagoon      |
| 2400      | Millstone   |
| 2401      | Niko        |
| 2402      | Nova        |
| 2403      | Onyx        |
| 2404      | Rochester   |
| 2405      | Rose        |
| 2406      | Salsa       |
| 2407      | Sandbar     |
| 2408      | Seaglass    |
| 2409      | Sedona      |
| 2410      | Shadows     |
| 2411      | Shelby      |
| 2412      | Storm       |
| 2413      | Stratus     |
| 2414      | Umber       |
| 2415      | Walnut      |
| 2416      | Windsor     |
| 2417      | Zinc II     |

**Sensation Sling (7 fabrics):**

| fabric_id | name     |
|-----------|----------|
| 2418      | Agate II |
| 2419      | Bisque   |
| 2420      | Bark     |
| 2421      | Cameo II |
| 2422      | Lagoon   |
| 2423      | Stratus  |
| 2424      | Zinc II  |

For each product, insert:
- One row in `product_fabric_pools` (product_id, manufacturer_id=16)
- 41 rows in `product_fabric_options` (product_id, fabric_id, display_order)

Use display_order 1-41: Homecrest Slings fabrics first (IDs 2384-2417, order 1-34), then Sensation Sling fabrics (IDs 2418-2424, order 35-41).

**Before inserting**, verify no existing rows already exist in product_fabric_pools or product_fabric_options for these product IDs. If any exist, skip that product and report it.

---

## Picker UI requirement

After wiring, the finish picker and fabric picker must be functional on the Allure Sling product detail pages -- meaning a customer can click to open a visual picker modal showing all wired finishes (with swatch images) and all wired fabrics (with swatch images), select one, and have their selection reflected on the PDP.

This is already the established pattern for other manufacturers on the site (e.g. Frankford Umbrellas). Please ensure the Homecrest Allure Sling products follow the same pattern. If any frontend wiring or configuration is needed beyond the DB rows to make the pickers launch correctly, please handle that as part of this task.

The pickers must work in both the customer-facing storefront AND the staff portal. Staff users need to be able to select frame finish and sling fabric when placing or managing orders for Allure Sling products, the same way they can for other manufacturers already in the system.

---

## Verification

After wiring, confirm:
- Every product has exactly 1 row in product_finish_pools
- Every product has exactly 11 rows in product_finish_options
- Every product has exactly 1 row in product_fabric_pools
- Every product has exactly 41 rows in product_fabric_options

Print a summary table showing counts per product_id. Any product not hitting those exact counts should be flagged.

---

## Pattern documentation

After completing the wiring, please provide a clear explanation of exactly what was done, including:
- The exact SQL insert statements (or equivalent logic) used for product_finish_pools, product_finish_options, product_fabric_pools, and product_fabric_options
- The column names and values used in each table
- Any ordering or sequencing decisions made
- Anything unexpected encountered regarding the picker UI wiring

This explanation will be used by Claude to write Python scripts directly for all future Homecrest collections without needing agent involvement for finish and fabric wiring.

---

## Notes

- Use DATABASE_URL (dev/heliumdb) only -- not PROD_DATABASE_URL
- Run dry-run first, report results, then commit only after confirmation
- Do not modify any other fields on the products table
- Do not touch any other collections or manufacturers
