# Oasis Garden & Patio -- Backfill Scripts

## Overview

These four Python scripts populate the new product columns added in the schema
standardization build. Run them in order after the Replit schema deployment is
confirmed working.

## Prerequisites

- Schema changes deployed and smoke-tested in Replit
- `psycopg2` installed: `pip install psycopg2-binary`
- `DATABASE_URL` environment variable set to the Replit Postgres connection string

To find DATABASE_URL in Replit: open the Secrets tab (lock icon), it should be
listed there. Or run `echo $DATABASE_URL` in the Replit shell.

## Run Order

Run in this exact order. Each script is safe to re-run (idempotent).

```bash
export DATABASE_URL="your-database-url-here"

# Step 1: Collections (must run before materials -- Telescope MGP detection uses collection_slug)
python3 backfill_collections.py

# Step 2: Umbrella fields (umbrella type, shape, size, lift, tilt, pole material)
python3 backfill_umbrella_fields.py

# Step 3: Materials junction (uses pole_material set in step 2 for Galtech/TG/Frankford)
python3 backfill_materials.py

# Step 4: Seat types
python3 backfill_seat_types.py
```

## Verification Queries

Run these in the Replit shell (`psql $DATABASE_URL`) after all scripts complete:

```sql
-- Collections coverage
SELECT m.name, COUNT(*) as with_collection
FROM products p JOIN manufacturers m ON p.manufacturer_id = m.id
WHERE p.collection IS NOT NULL
GROUP BY m.name ORDER BY m.name;

-- Umbrella fields coverage
SELECT m.name, umbrella_type, COUNT(*)
FROM products p JOIN manufacturers m ON p.manufacturer_id = m.id
WHERE umbrella_type IS NOT NULL
GROUP BY m.name, umbrella_type ORDER BY m.name, umbrella_type;

-- Materials coverage
SELECT m.name, mat.name, COUNT(*)
FROM product_materials pm
JOIN products p ON pm.product_id = p.id
JOIN manufacturers m ON p.manufacturer_id = m.id
JOIN materials mat ON pm.material_id = mat.id
GROUP BY m.name, mat.name ORDER BY m.name, mat.name;

-- Seat type coverage (seating products only)
SELECT m.name, seat_type, COUNT(*)
FROM products p
JOIN manufacturers m ON p.manufacturer_id = m.id
WHERE p.category_id IN (
  SELECT id FROM categories
  WHERE slug IN ('cat-deep-seating','cat-dining','cat-bar','cat-chaise-lounges')
)
GROUP BY m.name, seat_type ORDER BY m.name, seat_type NULLS LAST;
```

## What These Scripts Do NOT Cover

The following require manual entry via the admin portal after launch:

- Summerset collections (no slug pattern to extract from)
- Hanamint collections
- Couture Jardin collections
- Shoreline collections
- NorthCape Valencia collection (missing products -- separate task)
- Frankford beach umbrellas (missing products -- separate task)
- Any seat_type values that could not be reliably detected from name/slug

## Notes

- All scripts use ON CONFLICT DO NOTHING (materials) or skip NULL results
  (collections, seat_type) -- safe to re-run without duplication
- The Telescope slug examples were verified against actual CSV data
- The Frankford umbrella mapping (backfill_umbrella_fields.py) uses a
  hardcoded dict per SKU -- if new Frankford SKUs are added, update that dict
