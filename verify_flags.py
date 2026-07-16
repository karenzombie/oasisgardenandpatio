#!/usr/bin/env python3
"""
verify_flags.py

READ-ONLY. No changes, no COMMIT flag.

Two modes:
  python3 verify_flags.py
      Lists a few current INQUIRY products and a few current PURCHASABLE
      products, with their ids, so you have concrete subjects to test with.

  python3 verify_flags.py 5930 1234 5678
      Prints the flag state of each given product id, with a plain-English
      label and a coherence check.

Coherence rule: available_online must equal NOT quote_only.
"""

import os
import sys
import psycopg2

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    print("ERROR: DATABASE_URL is not set in this shell.")
    sys.exit(1)

ids = []
for a in sys.argv[1:]:
    try:
        ids.append(int(a))
    except ValueError:
        print(f"Skipping non-numeric arg: {a!r}")

def label(avail, quote):
    if avail is True and quote is False:
        return "PURCHASABLE"
    if avail is False and quote is True:
        return "INQUIRY"
    return "!!! INCOHERENT !!!"

conn = psycopg2.connect(DB_URL)
try:
    with conn.cursor() as cur:
        if not ids:
            print("No ids given. Here are candidate test subjects:\n")
            print("--- current INQUIRY products (available_online=false) ---")
            cur.execute(
                "SELECT id, sku, name FROM products "
                "WHERE available_online = false AND quote_only = true "
                "ORDER BY id LIMIT 5;"
            )
            for r in cur.fetchall():
                print(f"  id={r[0]}  sku={r[1]!r}  {r[2]!r}")
            print("\n--- current PURCHASABLE products (available_online=true) ---")
            cur.execute(
                "SELECT id, sku, name FROM products "
                "WHERE available_online = true AND quote_only = false "
                "ORDER BY id LIMIT 5;"
            )
            for r in cur.fetchall():
                print(f"  id={r[0]}  sku={r[1]!r}  {r[2]!r}")
            print("\nRe-run with ids to check specific products, e.g.:")
            print("  python3 verify_flags.py 5930")
        else:
            cur.execute(
                "SELECT id, sku, name, available_online, quote_only, show_price_online "
                "FROM products WHERE id = ANY(%s) ORDER BY id;",
                (ids,),
            )
            rows = cur.fetchall()
            found = {r[0] for r in rows}
            for missing in [i for i in ids if i not in found]:
                print(f"  id={missing}: NOT FOUND")
            print("=" * 60)
            for r in rows:
                _id, sku, name, avail, quote, showp = r
                coherent = (avail == (not quote))
                print(f"id={_id}  sku={sku!r}")
                print(f"   available_online  = {avail}")
                print(f"   quote_only        = {quote}")
                print(f"   show_price_online = {showp}")
                print(f"   state: {label(avail, quote)}   coherent: {coherent}")
                print(f"   {name!r}")
                print("-" * 60)
finally:
    conn.close()

print("READ-ONLY: no rows were modified.")
