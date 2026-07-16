#!/usr/bin/env python3
"""
census_available_online.py

READ-ONLY. Makes no changes. No COMMIT flag.

Lists every product currently flagged available_online=true, joined to its
manufacturer and category names, and classifies each against the launch
purchasable expectation:

  Expected manufacturers: Treasure Garden, Frankford, Galtech
  Expected categories:    Umbrellas, Umbrella Bases, Lighting,
                          Replacement Parts, Outdoor Rugs, Protective Covers

A row is IN SCOPE only if its manufacturer AND its category are both in the
expected sets. Everything else flagged available_online=true is OUT OF SCOPE
and is a candidate anomaly to review (something flipped purchasable that the
launch plan does not expect).

Nothing here is hardcoded into the app. These sets exist only to classify the
report. The matching is by name (case-insensitive), resolved live from the
manufacturers and categories tables, so no manufacturer or category IDs are
assumed.

Outputs:
  - Console summary and breakdowns.
  - available_online_out_of_scope.csv : the OUT OF SCOPE rows, for review.
  - available_online_in_scope_unpriced.csv : IN SCOPE but no price set.
"""

import os
import csv
import sys
import psycopg2

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    print("ERROR: DATABASE_URL is not set in this shell.")
    sys.exit(1)

EXPECTED_MFGS = {
    "treasure garden",
    "frankford",
    "galtech",
}
EXPECTED_CATS = {
    "umbrellas",
    "umbrella bases",
    "lighting",
    "replacement parts",
    "outdoor rugs",
    "protective covers",
}

QUERY = """
    SELECT
        p.id,
        p.sku,
        p.name,
        COALESCE(m.name, '(no manufacturer)') AS mfg_name,
        COALESCE(c.name, '(no category)')     AS cat_name,
        p.available_online,
        p.quote_only,
        p.show_price_online,
        p.price,
        p.sale_price,
        p.is_active
    FROM products p
    LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
    LEFT JOIN categories    c ON c.id = p.category_id
    WHERE p.available_online = true
    ORDER BY mfg_name, cat_name, p.id;
"""

conn = psycopg2.connect(DB_URL)
try:
    with conn.cursor() as cur:
        cur.execute(QUERY)
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
finally:
    conn.close()

def col(r, k):
    return r[cols.index(k)]

def is_priced(r):
    p = col(r, "price")
    s = col(r, "sale_price")
    return (p is not None and float(p) > 0) or (s is not None and float(s) > 0)

def in_scope(r):
    return (
        col(r, "mfg_name").strip().lower() in EXPECTED_MFGS
        and col(r, "cat_name").strip().lower() in EXPECTED_CATS
    )

total = len(rows)
in_rows = [r for r in rows if in_scope(r)]
out_rows = [r for r in rows if not in_scope(r)]
in_priced = [r for r in in_rows if is_priced(r)]
in_unpriced = [r for r in in_rows if not is_priced(r)]

print("=" * 74)
print("CENSUS: products flagged available_online = true   (READ-ONLY)")
print("=" * 74)
print(f"Total available_online=true:         {total}")
print(f"  IN SCOPE (expected purchasable):   {len(in_rows)}")
print(f"     of which priced:                {len(in_priced)}")
print(f"     of which UNPRICED:              {len(in_unpriced)}  "
      f"<-- would show Add to Cart, fail at checkout")
print(f"  OUT OF SCOPE (review these):       {len(out_rows)}")
print("=" * 74)

# Breakdown by manufacturer x category over ALL available_online=true rows.
print("\nBreakdown by manufacturer / category (available_online=true only):")
print(f"{'MFG':<20}{'CATEGORY':<22}{'TOTAL':>6}{'PRICED':>8}{'UNPRICED':>10}  SCOPE")
combos = {}
for r in rows:
    key = (col(r, "mfg_name"), col(r, "cat_name"))
    d = combos.setdefault(key, {"total": 0, "priced": 0, "unpriced": 0,
                                "scope": "IN" if in_scope(r) else "OUT"})
    d["total"] += 1
    if is_priced(r):
        d["priced"] += 1
    else:
        d["unpriced"] += 1
for (mfg, cat), d in sorted(combos.items()):
    print(f"{mfg[:19]:<20}{cat[:21]:<22}{d['total']:>6}{d['priced']:>8}"
          f"{d['unpriced']:>10}  {d['scope']}")

# Detail the OUT OF SCOPE rows to console (these are the anomalies).
if out_rows:
    print(f"\n--- OUT OF SCOPE detail ({len(out_rows)}) ---")
    for r in out_rows:
        print(f"  id={col(r,'id')}  sku={col(r,'sku')!r}  "
              f"mfg={col(r,'mfg_name')!r}  cat={col(r,'cat_name')!r}  "
              f"priced={is_priced(r)}  name={col(r,'name')!r}")
else:
    print("\nNo OUT OF SCOPE rows. Every purchasable-flagged product fits the "
          "launch expectation.")

# CSV dumps for review.
def dump_csv(path, subset):
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(cols + ["priced", "scope"])
        for r in subset:
            w.writerow(list(r) + [is_priced(r), "IN" if in_scope(r) else "OUT"])

dump_csv("available_online_out_of_scope.csv", out_rows)
dump_csv("available_online_in_scope_unpriced.csv", in_unpriced)

print("\nWrote: available_online_out_of_scope.csv")
print("Wrote: available_online_in_scope_unpriced.csv")
print("READ-ONLY: no rows were modified.")
