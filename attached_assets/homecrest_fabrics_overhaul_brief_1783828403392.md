# Homecrest Fabrics Overhaul

## Background

The Homecrest fabrics section currently displays fabrics grouped by collection name (Homecrest Slings, Sensation Sling, Welt, Brisa Leather-Inspired, etc.). This is wrong for our purposes. Customers don't shop by fabric collection -- they need to see all fabrics as a single flat list and know which product types each fabric is available for.

A corrected CSV is attached: `homecrest_fabrics_final.csv`. This is the source of truth for this work.

---

## Part 1: Delete duplicate fabric records

The following 17 fabric records are duplicates and must be deleted from the `fabrics` table. These are the higher-numbered IDs -- the lower-numbered record for each fabric is the one to keep.

Delete these fabric IDs:
- 2418 (Agate II -- duplicate of 2384)
- 2419 (Bisque -- duplicate of 2388)
- 2420 (Bark -- duplicate of 2386)
- 2421 (Cameo II -- duplicate of 2389)
- 2422 (Lagoon -- duplicate of 2399)
- 2423 (Stratus -- duplicate of 2413)
- 2424 (Zinc II -- duplicate of 2417)
- 2425 (Carbon -- duplicate of 2390)
- 2426 (Glacier -- duplicate of 2393)
- 2427 (Hickory -- duplicate of 2395)
- 2428 (Indigo -- duplicate of 2396)
- 2429 (Niko -- duplicate of 2401)
- 2430 (Onyx -- duplicate of 2403)
- 2431 (Sandbar -- duplicate of 2407)
- 2432 (Sedona -- duplicate of 2409)
- 2433 (Storm -- duplicate of 2412)
- 2434 (Umber -- duplicate of 2414)

Before deleting, check whether any of these IDs are referenced in `product_fabric_options`. If they are, update those references to point to the kept (lower-numbered) ID before deleting.

---

## Part 2: Update availability_codes on kept fabric records

Using the attached CSV as the source of truth, update the `availability_codes` column on each fabric record. The CSV has individual YES/NO columns for S, A, PS, C, U, V, and W. Each YES means that fabric is available for that product type independently. Use the `db_id` column in the CSV to identify each record. Only update fabrics with manufacturer_id = 16.

Use the `db_id` column in the CSV to identify each record. Only update fabrics with manufacturer_id = 16.

---

## Part 3: Change fabric display from collection-grouped to flat list

Currently the Materials > Fabrics > Homecrest section groups fabrics by their `collection` field. Change this so all Homecrest fabrics display as a single flat list, not grouped by collection.

Each fabric in the list should display which product types it is available for, based on its `availability_codes` value. Display the full label followed by the code in parentheses for each code present on that fabric. Use these labels:

- S = Sling (S)
- A = Air (A)
- PS = Padded Sling (PS)
- C = Cushion (C)
- U = Umbrella (U)
- V = Vintage Wire (V)
- W = Welt (W)

For example, a fabric that has both S and A set to YES should display: Sling (S), Air (A)

Also add a filter UI above the fabric list that allows filtering by product type. The filter options should be: Sling (S), Air (A), Padded Sling (PS), Cushion (C), Umbrella (U), Vintage Wire (V), Welt (W). Selecting a filter shows only fabrics that have that code in their availability_codes. Multiple filters can be selected at once -- selecting more than one shows fabrics that match ANY of the selected codes. Selecting no filters shows all fabrics.

The `collection` field on fabric records does not need to change -- it can stay for internal reference. Only the display logic needs updating.

---

## Check in before implementing

Investigate the current fabric display implementation and tell me how it works before making any changes. Check in after your investigation and before writing any code.
