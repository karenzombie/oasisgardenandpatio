# Homecrest Fabrics Import Brief (Revised)

**For:** Replit Agent
**From:** Karen / Claude
**Date:** July 2026

---

## Context from Step 1 schema check

The following is confirmed from the schema report:

- Table name: `fabrics`
- Homecrest manufacturer_id = 16 (confirmed)
- Currently zero Homecrest rows in `fabrics`
- Existing relevant columns: `id`, `manufacturer_id`, `item_number` (text, NOT NULL, unique per manufacturer), `name`, `swatch_image_url` (nullable), `grade` (nullable), `collection` (nullable), `is_active`, `display_order`, `notes`, `color_family`, `is_stripe`, `created_at`, `updated_at`
- No `availability_codes` column exists yet

---

## Design decision: availability_codes

Add a new nullable `availability_codes` column (text) to the `fabrics` table.

This stores a pipe-delimited string indicating which seating/product types a fabric is compatible with. Example: `PS|C|V` means Padded Sling, Cushion, and Vintage Wire.

**Why on the fabric row, not just in the junction tables:** For Homecrest, compatibility is an intrinsic property of the fabric set by the manufacturer -- a sling fabric is a sling fabric regardless of which product it ends up on. Storing it here allows the fabric picker to pre-filter by seating type when wiring fabrics to products later, with no manual exclusion needed and no risk of wiring the wrong type.

This column will be null for all other manufacturers' fabric rows. No backfill needed.

Full code reference:

| Code | Seating / product type |
|------|----------------------|
| A | Air (Sensation sling only) |
| S | Sling |
| PS | Padded Sling |
| C | Cushion |
| U | Umbrella |
| V | Vintage Wire |
| W | Welt |

---

## Step 1 -- Add availability_codes column

```sql
ALTER TABLE fabrics ADD COLUMN availability_codes text;
```

No other schema changes are needed. All other required columns already exist.

---

## Step 2 -- Upload swatch images

Upload all files from the provided `homecrest_swatches` folder to Replit object storage. The images will be placed in the library workspace root under a folder named `homecrest_fabric_swatches`. Use the same storage path convention already used for other manufacturers' swatch images.

- Files are a mix of `.jpg` and `.png`
- Do not rename any files during upload
- The folder name in storage is: `homecrest_fabric_swatches`
- After uploading, confirm the full base storage path so it can be prepended to each filename to form the `swatch_image_url` value

---

## Step 3 -- Data import

Import all 380 fabric records from the provided `homecrest_fabrics.csv`.

### Column mapping

| CSV column | DB column | Notes |
|-----------|-----------|-------|
| `fabric_name` | `name` | |
| `collection` | `collection` | |
| `grade` | `grade` | May be blank -- store as NULL |
| `availability` | `availability_codes` | May be blank -- store as NULL |
| `item_number` | `item_number` | See placeholder rule below |
| `image_filename` | `swatch_image_url` | Prepend the storage base path from Step 2 |

### item_number placeholder rule

The `item_number` column is NOT NULL with a unique-per-manufacturer constraint. 81 fabrics in the CSV have a blank `item_number` (the Homecrest Slings, Sensation Sling, Welt, and Recacril collections, which have no manufacturer catalog number).

For these, generate a placeholder using this pattern:

| Collection | Placeholder prefix |
|-----------|-------------------|
| Homecrest Slings | `HC-SLING-{fabric-name-hyphenated}` |
| Sensation Sling | `HC-SENSATION-{fabric-name-hyphenated}` |
| Welt | `HC-WELT-{fabric-name-hyphenated}` |
| Recacril | `HC-RECACRIL-{fabric-name-hyphenated}` |

Examples: `HC-SLING-Agate-II`, `HC-RECACRIL-Captain-Navy`, `HC-WELT-Carbon`

These placeholders are unique per manufacturer and clearly identifiable as system-generated. They are never displayed to customers.

### Other field defaults

- `manufacturer_id`: 16 (Homecrest) for all rows
- `is_active`: true for all rows
- `display_order`: 0 for all rows (or follow whatever convention other manufacturers use)
- `is_stripe`: false for all rows unless the fabric name contains "Stripe" -- in that case set true
- `color_family`: leave null for all rows
- `notes`: leave null for all rows

### Duplicate check

Before inserting, confirm there are zero existing rows with `manufacturer_id = 16`. If any exist, stop and report to Karen before proceeding.

### Post-import verification

After inserting, run the following and report results to Karen:

```sql
SELECT COUNT(*) FROM fabrics WHERE manufacturer_id = 16;
SELECT availability_codes, COUNT(*) FROM fabrics WHERE manufacturer_id = 16 GROUP BY availability_codes ORDER BY COUNT(*) DESC;
SELECT collection, COUNT(*) FROM fabrics WHERE manufacturer_id = 16 GROUP BY collection ORDER BY collection;
```

Expected total: 380 rows.

---

## Step 4 -- Storefront and admin display

The fabrics should appear in Materials > Fabrics grouped under "Homecrest", matching the display pattern used for other manufacturers (reference: Treasure Garden shown in screenshot -- swatch image, fabric name, item number, grade label).

For Homecrest, each fabric card should show:
- Swatch image
- Fabric name
- Item number -- only if it does NOT start with `HC-` (i.e. hide generated placeholders from display). This rule applies everywhere an item number is shown: storefront, admin portal fabric cards, and vendor order printouts. A placeholder item number must never appear on any customer-facing or vendor-facing output.
- Grade, displayed as "GRADE X" (omit if null)
- Collection label as a sub-label (e.g. "Sunbrella Upholstery", "Bella-Dura")

The `availability_codes` value should NOT appear on the storefront customer-facing view.

In the **admin portal** fabric detail/edit screen, the item number field should display the value as-is if it is a real catalog number, or show blank/nothing if it starts with `HC-`. Do not expose placeholder values to staff -- they could inadvertently pass a fake number to a vendor. Then add a read-only field labeled "Available For" that renders the `availability_codes` value as human-readable labels. Mapping:

| Code | Display label |
|------|-------------|
| A | Air |
| S | Sling |
| PS | Padded Sling |
| C | Cushion |
| U | Umbrella |
| V | Vintage Wire |
| W | Welt |

Example: `PS|C|V` renders as "Padded Sling, Cushion, Vintage Wire"

If `availability_codes` is null, show nothing in this field.

---

## What NOT to do

This entire brief is scoped to Homecrest (manufacturer_id = 16) only. No other manufacturer's data, display, or behavior should be touched in any way as part of this build.

- Do not modify any existing fabric rows for any other manufacturer.
- Do not alter the display of fabric cards, fabric detail screens, or the Materials > Fabrics page for any other manufacturer. If the Homecrest display requires a code change to the shared fabric card component, that change must be additive and conditional -- only triggered for Homecrest -- and must never change how any other manufacturer's fabrics render.
- Do not wire any fabrics to products or variants. That is a separate future step.
- Do not create any `product_fabric_options` or `product_fabric_pools` records.
- Do not make the `availability_codes` field editable in the UI at this time -- read-only display only.
- If any part of this build would require modifying shared components in a way that could affect other manufacturers, stop and flag it to Karen before proceeding.

---

## Check-in sequence

1. Complete Step 1 (schema change) and confirm to Karen. Stop.
2. After Karen confirms, complete Step 2 (image upload) and report the storage path. Stop.
3. After Karen confirms, complete Step 3 (import). Run verification queries and report counts. Stop.
4. After Karen confirms counts, complete Step 4 (display). Show Karen the result in both the storefront and admin portal.
