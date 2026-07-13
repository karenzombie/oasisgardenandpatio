#!/usr/bin/env python3
"""
verify_cp2.py

READ-ONLY. Writes nothing to the database.

Confirms Phase A of the rank group work landed correctly and inertly:
  1. The rank_group column exists, is an integer, and is nullable with no default.
  2. NO product has a rank_group value yet. It must be NULL on all 3,612 rows.
  3. The partial index idx_products_rank_group exists.
  4. display_order is still zeroed on every row (nothing regressed it).
  5. product_images and product_materials display_order are untouched.
"""

import os
import sys

import psycopg2
import psycopg2.extras

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("DATABASE_URL is not set. Aborting.")


def rule(title):
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


def main():
    conn = psycopg2.connect(DB_URL)
    conn.set_session(readonly=True)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    print("*** READ-ONLY SESSION. THIS SCRIPT WRITES NOTHING. ***")
    passed = True

    # ------------------------------------------------------------------
    rule("1. DOES THE rank_group COLUMN EXIST, AND IS IT SHAPED RIGHT?")
    cur.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'products' AND column_name = 'rank_group';
    """)
    col = cur.fetchone()
    if not col:
        print("  FAIL: products.rank_group does not exist.")
        passed = False
    else:
        print("  data_type      : {}   (expect integer)".format(col["data_type"]))
        print("  is_nullable    : {}          (expect YES)".format(col["is_nullable"]))
        print("  column_default : {}        (expect None)".format(col["column_default"]))
        ok = (col["data_type"] == "integer"
              and col["is_nullable"] == "YES"
              and col["column_default"] is None)
        print("  {}".format("PASS" if ok else "FAIL: wrong shape"))
        passed &= ok

    # ------------------------------------------------------------------
    rule("2. IS rank_group STILL EMPTY? (it must be. nobody has set one yet)")
    cur.execute("""
        SELECT COUNT(*) AS total,
               COUNT(*) FILTER (WHERE rank_group IS NOT NULL) AS ranked
        FROM products;
    """)
    r = cur.fetchone()
    print("  total products          : {}".format(r["total"]))
    print("  with a rank_group value : {}   (expect 0)".format(r["ranked"]))
    ok = (r["ranked"] == 0)
    print("  {}".format("PASS" if ok else "FAIL: something set rank groups already"))
    passed &= ok

    # ------------------------------------------------------------------
    rule("3. DOES THE PARTIAL INDEX EXIST?")
    cur.execute("""
        SELECT indexname, indexdef
        FROM pg_indexes
        WHERE tablename = 'products'
          AND indexname = 'idx_products_rank_group';
    """)
    idx = cur.fetchone()
    if not idx:
        print("  FAIL: idx_products_rank_group not found.")
        passed = False
    else:
        print("  {}".format(idx["indexname"]))
        print("  {}".format(idx["indexdef"]))
        partial = "WHERE" in idx["indexdef"].upper()
        print("  partial (has a WHERE clause): {}   (expect True)".format(partial))
        print("  {}".format("PASS" if partial else "FAIL: index is not partial"))
        passed &= partial

    # ------------------------------------------------------------------
    rule("4. IS display_order STILL ZEROED? (nothing should have regressed it)")
    cur.execute("SELECT COUNT(*) AS n FROM products WHERE display_order <> 0;")
    n = cur.fetchone()["n"]
    print("  products with display_order <> 0 : {}   (expect 0)".format(n))
    ok = (n == 0)
    print("  {}".format("PASS" if ok else "FAIL: display_order came back"))
    passed &= ok

    # ------------------------------------------------------------------
    rule("5. ARE THE OTHER display_order COLUMNS UNTOUCHED?")
    expected = {
        "product_images": (4807, 5757),
        "product_materials": (3485, 0),
    }
    for tbl, exp in expected.items():
        cur.execute(
            "SELECT COUNT(*) AS n, COALESCE(SUM(display_order), 0) AS s FROM {};".format(tbl)
        )
        r = cur.fetchone()
        got = (r["n"], int(r["s"]))
        ok = (got == exp)
        print("  {:<20} rows/sum {}   (expect {})   {}".format(
            tbl, got, exp, "PASS" if ok else "FAIL: MOVED"))
        passed &= ok

    # ------------------------------------------------------------------
    rule("RESULT")
    if passed:
        print("  ALL CHECKS PASSED.")
        print("  rank_group exists, is empty, is indexed, and is inert.")
        print("  Now eyeball the site, then give the agent the go for Phase B.")
    else:
        print("  ONE OR MORE CHECKS FAILED. Do not proceed to Phase B.")
        print("  Send this output back before letting the agent continue.")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
