# HDPE Frame Finishes -- Agent Brief

## What to do

Add two new finish records to the finishes table for Homecrest (manufacturer_id = 16):

- Coastal Gray, color code 23
- Brazilian Walnut, color code 24

Both already exist in the finishes table as table finish records. Copy the name, color code (item_number), and swatch image from those existing records. Set description to "Frame finish" (must match this exactly -- it drives the frame finish picker). Group both under a new collection called "HDPE Frame Finishes". Do not modify the existing table finish records.

## What must work after

1. The two new records appear in the admin UI under Materials > Finishes > Homecrest, grouped under "HDPE Frame Finishes", separate from the aluminum frame finishes and table finishes.
2. The frame finish picker renders correctly on product pages wired to these finishes -- same behavior as the existing aluminum frame finishes on Allure and Anthem products.
3. Staff portal can see and select these finishes on orders for products that use them.

## Notes

- Use DATABASE_URL (dev/heliumdb) only
- Report back the new finish IDs once created
