#!/usr/bin/env python3
"""
owlee_tile_recon.py

READ ONLY. Recon for the O.W. Lee tile price expansion load.

It does NOT write, insert, update, or delete anything. It:

  1. Inspects the live schema of product_variants and variant_grade_prices
     and prints the real columns + types (so structure is confirmed from the
     DB itself, not from memory).
  2. Reads the approved REVIEW csv from the current directory and derives the
     distinct porcelain-top SKUs it references.
  3. Confirms every one of those SKUs exists as a row in product_variants,
     and lists any that do NOT.
  4. Confirms those variants have ZERO existing variant_grade_prices rows,
     and lists any that already have rows (a collision risk for the load).

Defaults to the DEV database (DATABASE_URL). It never touches prod.
"""

import os
import sys
import csv

try:
    import psycopg2
except ImportError:
    sys.exit("psycopg2 not installed. Run: pip install psycopg2-binary")

# ---------------------------------------------------------------------------
# The approved review file, expected to sit in the current directory on Replit.
REVIEW_CSV = "owlee_tile_price_expansion_REVIEW.csv"
# ---------------------------------------------------------------------------

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("DATABASE_URL not set. This script targets the DEV database.")


def rule(title):
    print("\n" + "=" * 70)
    print(title)
    print("=" * 70)


def get_columns(cur, table_name):
    """Return list of (column_name, data_type) for a table, in ordinal order."""
    cur.execute(
        """
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = %s
        ORDER BY ordinal_position
        """,
        (table_name,),
    )
    return cur.fetchall()


def main():
    # --- Load the approved review file first, so we fail early if it's missing.
    if not os.path.exists(REVIEW_CSV):
        here = [f for f in os.listdir(".") if f.lower().endswith(".csv")]
        print("Could not find the review file:", REVIEW_CSV)
        print("CSV files in this directory:")
        for f in here:
            print("   -", f)
        sys.exit("Place the approved review csv in this directory, or rename it.")

    with open(REVIEW_CSV, newline="", encoding="utf-8-sig") as fh:
        reader = csv.DictReader(fh)
        headers = reader.fieldnames or []
        rows = list(reader)

    rule("REVIEW FILE")
    print("File:", REVIEW_CSV)
    print("Total rows:", len(rows))
    print("Columns:", headers)
    print("\nFirst 3 rows:")
    for r in rows[:3]:
        print("   ", dict(r))

    # Detect the SKU column by header name containing 'sku' (case-insensitive).
    sku_cols = [h for h in headers if "sku" in h.lower()]
    if len(sku_cols) != 1:
        print("\nCould not unambiguously identify the SKU column.")
        print("Candidates:", sku_cols if sku_cols else "(none)")
        sys.exit("Halting so the SKU column can be confirmed before proceeding.")
    sku_col = sku_cols[0]
    print("\nUsing SKU column:", sku_col)

    distinct_skus = sorted({(r.get(sku_col) or "").strip() for r in rows if (r.get(sku_col) or "").strip()})
    print("Distinct SKUs referenced in review file:", len(distinct_skus))

    # --- Connect (read only usage; no writes issued anywhere below).
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    # --- 1. Schema inspection.
    rule("SCHEMA: product_variants")
    pv_cols = get_columns(cur, "product_variants")
    if not pv_cols:
        sys.exit("product_variants not found in this database. Halting.")
    for name, dtype in pv_cols:
        print(f"   {name:<28} {dtype}")
    pv_colnames = {c for c, _ in pv_cols}

    rule("SCHEMA: variant_grade_prices")
    vgp_cols = get_columns(cur, "variant_grade_prices")
    if not vgp_cols:
        sys.exit("variant_grade_prices not found in this database. Halting.")
    for name, dtype in vgp_cols:
        print(f"   {name:<28} {dtype}")
    vgp_colnames = {c for c, _ in vgp_cols}

    # --- Guard: confirm the columns the checks depend on actually exist.
    missing = []
    if "variant_sku" not in pv_colnames:
        missing.append("product_variants.variant_sku")
    if "id" not in pv_colnames:
        missing.append("product_variants.id")
    if "variant_id" not in vgp_colnames:
        missing.append("variant_grade_prices.variant_id")
    if missing:
        print("\nExpected columns not found:", missing)
        sys.exit("Halting so the schema can be confirmed before the checks run.")

    # --- 2. Existence check against product_variants.
    rule("CHECK 1: do all review SKUs exist as variants?")
    cur.execute(
        "SELECT variant_sku FROM product_variants WHERE variant_sku = ANY(%s)",
        (distinct_skus,),
    )
    found = {row[0] for row in cur.fetchall()}
    missing_skus = [s for s in distinct_skus if s not in found]

    print("Referenced :", len(distinct_skus))
    print("Found      :", len(found))
    print("Missing    :", len(missing_skus))
    if missing_skus:
        print("\nMISSING SKUs (do not exist as variants):")
        for s in missing_skus:
            print("   -", s)

    # --- 3. Existing grade-price rows on the target variants.
    rule("CHECK 2: do target variants already have variant_grade_prices rows?")
    cur.execute(
        """
        SELECT pv.variant_sku, COUNT(*) AS n
        FROM variant_grade_prices vgp
        JOIN product_variants pv ON pv.id = vgp.variant_id
        WHERE pv.variant_sku = ANY(%s)
        GROUP BY pv.variant_sku
        ORDER BY pv.variant_sku
        """,
        (distinct_skus,),
    )
    existing = cur.fetchall()
    total_existing_rows = sum(n for _, n in existing)

    print("Target variants that ALREADY have grade-price rows:", len(existing))
    print("Total existing grade-price rows on those variants :", total_existing_rows)
    if existing:
        print("\nVariants with pre-existing rows (collision risk):")
        for sku, n in existing:
            print(f"   - {sku}: {n} row(s)")

    # --- Summary verdict.
    rule("SUMMARY")
    clean = (not missing_skus) and (not existing)
    print("Review rows                 :", len(rows))
    print("Distinct SKUs               :", len(distinct_skus))
    print("All SKUs exist as variants  :", "YES" if not missing_skus else f"NO ({len(missing_skus)} missing)")
    print("Zero pre-existing GP rows   :", "YES" if not existing else f"NO ({len(existing)} variants have rows)")
    print("\nLOAD IS A CLEAN INSERT      :", "YES" if clean else "NO — see checks above")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
