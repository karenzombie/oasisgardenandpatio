#!/usr/bin/env python3
"""
audit_availability_invariant.py

READ-ONLY audit. Makes NO changes to the database. There is no COMMIT flag
because this script never writes.

Purpose:
  Find every product that violates the permanent invariant
      available_online = NOT quote_only
  i.e. every row where  available_online = quote_only.

  This catches rows the bulk-update dialog may have broken by writing
  available_online on its own without deriving quote_only / show_price_online.

Two break directions are reported separately:

  TYPE A  available_online = false  AND quote_only = false
          The dangerous one. Storefront "Available online" filter keys on
          quote_only (=false), so the product LEAKS into the online-purchasable
          listing and its price can still show. This is the FC101 case.

  TYPE B  available_online = true   AND quote_only = true
          The contradictory other direction. PDP keys on available_online
          (=true) so Add to Cart shows, but the storefront filter hides it.

Output:
  - A summary count to the console.
  - Every offending row printed to the console.
  - A CSV written to  availability_invariant_violations.csv  for review.
"""

import os
import csv
import sys
import psycopg2

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    print("ERROR: DATABASE_URL is not set in this shell.")
    sys.exit(1)

# Safety label so the console output makes the target obvious.
target = "dev (heliumdb via DATABASE_URL)"

QUERY = """
    SELECT
        id,
        sku,
        name,
        category_id,
        sub_category,
        available_online,
        quote_only,
        show_price_online,
        is_active,
        in_store_only,
        pricing_mode
    FROM products
    WHERE available_online = quote_only
    ORDER BY
        (available_online = false AND quote_only = false) DESC,  -- Type A first
        category_id,
        id;
"""

conn = psycopg2.connect(DB_URL)
try:
    with conn.cursor() as cur:
        cur.execute(QUERY)
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
finally:
    conn.close()

def val(row, key):
    return row[cols.index(key)]

type_a = [r for r in rows if val(r, "available_online") is False and val(r, "quote_only") is False]
type_b = [r for r in rows if val(r, "available_online") is True and val(r, "quote_only") is True]

print("=" * 72)
print("AVAILABILITY INVARIANT AUDIT  (READ-ONLY)")
print("Target:", target)
print("Invariant checked:  available_online = NOT quote_only")
print("=" * 72)
print(f"Total violations:            {len(rows)}")
print(f"  TYPE A (leak: avail=F, quote=F):  {len(type_a)}   <-- price can show in online listing")
print(f"  TYPE B (contradiction: avail=T, quote=T): {len(type_b)}")
print("=" * 72)

def dump(label, subset):
    if not subset:
        return
    print(f"\n--- {label} ({len(subset)}) ---")
    for r in subset:
        print(
            f"  id={val(r,'id')}  sku={val(r,'sku')!r}  "
            f"avail={val(r,'available_online')}  quote={val(r,'quote_only')}  "
            f"showprice={val(r,'show_price_online')}  cat={val(r,'category_id')}  "
            f"active={val(r,'is_active')}  name={val(r,'name')!r}"
        )

dump("TYPE A  (available_online=false, quote_only=false)", type_a)
dump("TYPE B  (available_online=true, quote_only=true)", type_b)

# Write full detail to CSV for review.
out_path = "availability_invariant_violations.csv"
with open(out_path, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["break_type"] + cols)
    for r in type_a:
        w.writerow(["A"] + list(r))
    for r in type_b:
        w.writerow(["B"] + list(r))

print(f"\nWrote full detail to: {out_path}")
print("READ-ONLY: no rows were modified.")
