"""
Homecrest Collection Update
Reads homecrest_collection_update.csv and sets the correct collection
value on each product row, matched by product id.

DRY RUN (default):
    python3 homecrest_collection_update.py

COMMIT:
    python3 -c "exec(open('homecrest_collection_update.py').read().replace('DRY_RUN = True', 'DRY_RUN = False'))"
"""

import os
import csv
import psycopg2

DRY_RUN = True

CSV_PATH = "homecrest_collection_update.csv"

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

# Load CSV
with open(CSV_PATH, newline="", encoding="utf-8-sig") as f:
    rows = list(csv.DictReader(f))

print(f"Loaded {len(rows)} rows from CSV.")
print(f"Mode: {'DRY RUN - no changes will be written' if DRY_RUN else 'LIVE COMMIT'}")
print()

updated = 0
skipped = 0
not_found = []

for row in rows:
    product_id = int(row["id"])
    sku = row["sku"].strip()
    new_collection = row["final_collection"].strip()

    # Fetch current collection value
    cur.execute(
        "SELECT collection FROM products WHERE id = %s",
        (product_id,)
    )
    result = cur.fetchone()

    if result is None:
        not_found.append((product_id, sku))
        continue

    current_collection = result[0]

    if current_collection == new_collection:
        skipped += 1
        continue

    print(f"id={product_id} sku={sku}")
    print(f"  collection: {repr(current_collection)} -> {repr(new_collection)}")

    if not DRY_RUN:
        cur.execute(
            "UPDATE products SET collection = %s WHERE id = %s",
            (new_collection, product_id)
        )

    updated += 1

if not DRY_RUN:
    conn.commit()

cur.close()
conn.close()

print()
print(f"--- Summary ---")
print(f"Would update:  {updated}" if DRY_RUN else f"Updated:       {updated}")
print(f"Already correct (skipped): {skipped}")
if not_found:
    print(f"NOT FOUND in DB ({len(not_found)} rows) -- stop and review before committing:")
    for pid, sku in not_found:
        print(f"  id={pid} sku={sku}")
else:
    print(f"Not found:     0")
