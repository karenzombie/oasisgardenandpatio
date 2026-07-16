#!/usr/bin/env python3
"""
recon_galtech_pole_picker.py

READ-ONLY. No changes, no COMMIT flag. Runs on dev (DATABASE_URL).

Pulls the data needed to spec the Galtech replacement-pole picker:
  1. The two pole products (BP, BH).
  2. All in-scope Galtech umbrella models (category Umbrellas, manufacturer
     Galtech), EXCLUDING the three cantilevers 897, 887, 899.
  3. For each model, its wired finishes (from product_finish_options), including
     each finish's item_number (candidate code for the composed SKU) and any
     upcharge.
  4. A consolidated distinct-finish list showing whether item_number is
     populated, which decides whether we already have finish codes.

Writes two CSVs:
  galtech_model_finishes.csv   (model_sku, model_name, finish_id, finish_name,
                                finish_item_number, upcharge_msrp, upcharge_sale)
  galtech_distinct_finishes.csv (finish_id, finish_name, item_number, used_by_models)
"""

import os
import csv
import sys
import psycopg2

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    print("ERROR: DATABASE_URL not set.")
    sys.exit(1)

EXCLUDE_SKUS = ("897", "887", "899")  # cantilevers, out of scope
POLE_SKUS = ("BP", "BH")

conn = psycopg2.connect(DB_URL)
try:
    with conn.cursor() as cur:
        # Resolve Galtech manufacturer id by name (no hardcoded id).
        cur.execute("SELECT id, name FROM manufacturers WHERE name ILIKE %s;", ("galtech%",))
        mrows = cur.fetchall()
        if len(mrows) != 1:
            print("Could not uniquely resolve Galtech manufacturer:", mrows)
            sys.exit(1)
        gal_id, gal_name = mrows[0]
        print(f"Manufacturer: {gal_name} (id={gal_id})")
        print("=" * 74)

        # Pole products.
        print("POLE PRODUCTS (the picker attaches to these):")
        cur.execute(
            "SELECT id, sku, name, is_active, available_online, quote_only, price "
            "FROM products WHERE manufacturer_id = %s AND sku = ANY(%s) ORDER BY sku;",
            (gal_id, list(POLE_SKUS)),
        )
        for r in cur.fetchall():
            print(f"   id={r[0]} sku={r[1]!r} active={r[3]} avail={r[4]} quote={r[5]} "
                  f"price={r[6]}  {r[2]!r}")
        print("=" * 74)

        # In-scope umbrella models.
        cur.execute(
            """
            SELECT p.id, p.sku, p.name
            FROM products p
            JOIN categories c ON c.id = p.category_id
            WHERE p.manufacturer_id = %s
              AND c.name = 'Umbrellas'
              AND p.sku <> ALL(%s)
            ORDER BY p.sku;
            """,
            (gal_id, list(EXCLUDE_SKUS)),
        )
        models = cur.fetchall()
        print(f"IN-SCOPE GALTECH UMBRELLA MODELS: {len(models)} "
              f"(cantilevers {EXCLUDE_SKUS} excluded)\n")

        model_finish_rows = []   # for CSV
        distinct = {}            # finish_id -> [name, item_number, set(model_skus)]

        for pid, sku, name in models:
            cur.execute(
                """
                SELECT f.id, f.name, f.item_number, f.is_active,
                       pfo.upcharge_msrp, pfo.upcharge_sale, pfo.display_order
                FROM product_finish_options pfo
                JOIN finishes f ON f.id = pfo.finish_id
                WHERE pfo.product_id = %s
                ORDER BY pfo.display_order, f.name;
                """,
                (pid,),
            )
            fins = cur.fetchall()
            print(f"--- {sku}  {name!r}  ({len(fins)} finishes) ---")
            if not fins:
                print("     (no product_finish_options rows wired)")
            for fid, fname, item_no, fact, up_m, up_s, dord in fins:
                code = item_no if item_no else "(no item_number)"
                print(f"     finish id={fid}  {fname!r}  code={code}  "
                      f"upcharge_msrp={up_m}")
                model_finish_rows.append([sku, name, fid, fname, item_no or "", up_m, up_s])
                d = distinct.setdefault(fid, [fname, item_no, set()])
                d[2].add(sku)
            print()

        # Consolidated distinct finishes + item_number coverage.
        print("=" * 74)
        print(f"DISTINCT FINISHES USED ACROSS IN-SCOPE MODELS: {len(distinct)}")
        with_code = sum(1 for v in distinct.values() if v[1])
        print(f"   with item_number (candidate SKU code): {with_code}")
        print(f"   WITHOUT item_number:                   {len(distinct) - with_code}")
        print()
        for fid, (fname, item_no, model_set) in sorted(distinct.items(), key=lambda x: x[1][0]):
            print(f"   id={fid}  {fname!r}  item_number={item_no!r}  "
                  f"used_by={len(model_set)} models")

        # CSVs.
        with open("galtech_model_finishes.csv", "w", newline="") as fp:
            w = csv.writer(fp)
            w.writerow(["model_sku", "model_name", "finish_id", "finish_name",
                        "finish_item_number", "upcharge_msrp", "upcharge_sale"])
            w.writerows(model_finish_rows)
        with open("galtech_distinct_finishes.csv", "w", newline="") as fp:
            w = csv.writer(fp)
            w.writerow(["finish_id", "finish_name", "item_number", "used_by_models"])
            for fid, (fname, item_no, model_set) in sorted(distinct.items()):
                w.writerow([fid, fname, item_no or "", "|".join(sorted(model_set))])

        print("\nWrote: galtech_model_finishes.csv, galtech_distinct_finishes.csv")
finally:
    conn.close()

print("READ-ONLY: no rows were modified.")
