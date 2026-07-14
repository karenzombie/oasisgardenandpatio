#!/usr/bin/env python3
"""
zero_display_order_prod.py

*** THIS SCRIPT TARGETS PRODUCTION (PROD_DATABASE_URL). ***

This is the same fix already applied to dev, now pointed at the live site.

WHAT IT FIXES
  352 products (248 O.W. Lee, 104 Treasure Garden) carry a leftover number in
  products.display_order. Those numbers were never set on purpose. They are
  counters left behind by old data-loading scripts.

  Because the catalog sorts by that number ascending, and because the other
  ~3,260 products all sit at 0, those 352 products get pushed to the BOTTOM of
  their own category pages on the live site. O.W. Lee customers scroll past
  everything else before they reach O.W. Lee products.

  Setting all of them to 0 removes the number from the equation entirely and
  the catalog falls back to alphabetical, which is what everyone expects.

WHAT IT DOES NOT TOUCH
  There are two OTHER display_order columns on OTHER tables:
    product_images.display_order      (orders the photo gallery - LOAD BEARING)
    product_materials.display_order
  This script writes ONLY to products.display_order. It fingerprints both of
  the other tables before and after, and aborts if either one moves.

  It does not touch rank_group. It does not touch any other column.

SAFETY
  - COMMIT = False by default. The first run is a dry run and writes nothing.
  - Snapshots every products.display_order value to a timestamped table AND to
    a CSV before writing.
  - Re-checks for drift immediately before the write.
  - Verifies every invariant before committing, and rolls back if any fails.
  - Ships with revert_display_order_prod.py.
"""

import os
import csv
import sys
from datetime import datetime

import psycopg2
import psycopg2.extras

# ----------------------------------------------------------------------
COMMIT = False
# ----------------------------------------------------------------------

DB_URL = os.environ.get("PROD_DATABASE_URL")
if not DB_URL:
    sys.exit("PROD_DATABASE_URL is not set. Aborting.")

STAMP = datetime.now().strftime("%Y%m%d_%H%M%S")
SNAPSHOT_TABLE = "display_order_prod_backup_{}".format(STAMP)
SNAPSHOT_CSV = "display_order_prod_backup_{}.csv".format(STAMP)


def rule(t):
    print("\n" + "=" * 78)
    print(t)
    print("=" * 78)


def guard_checksum(cur):
    """Fingerprint the two display_order columns we must NOT touch."""
    out = {}
    for tbl in ("product_images", "product_materials"):
        cur.execute("SELECT COUNT(*) AS n, COALESCE(SUM(display_order), 0) AS s "
                    "FROM {};".format(tbl))
        r = cur.fetchone()
        out[tbl] = (r["n"], int(r["s"]))
    return out


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    mode = "COMMIT (writes will be made)" if COMMIT else "DRY RUN (nothing is written)"
    print("*** MODE: {} ***".format(mode))
    print("*** TARGET: PROD_DATABASE_URL  <-- THIS IS THE LIVE SITE ***")

    # ------------------------------------------------------------------
    rule("1. CONFIRM WE ARE TALKING TO PROD")
    cur.execute("SELECT current_database() AS db;")
    print("  database name : {}".format(cur.fetchone()["db"]))
    cur.execute("SELECT COUNT(*) AS n FROM products;")
    total = cur.fetchone()["n"]
    print("  products rows : {}".format(total))
    print("\n  Expect: neondb / 3612. If that is not what you see, STOP.")

    # ------------------------------------------------------------------
    rule("2. CURRENT STATE OF products.display_order IN PROD")
    cur.execute("""
        SELECT COUNT(*) FILTER (WHERE display_order = 0)     AS at_zero,
               COUNT(*) FILTER (WHERE display_order <> 0)    AS non_zero,
               COUNT(*) FILTER (WHERE display_order IS NULL) AS nulls,
               COALESCE(MAX(display_order), 0)               AS max_v
        FROM products;
    """)
    st = cur.fetchone()
    print("  already at 0        : {}".format(st["at_zero"]))
    print("  NOT at 0            : {}   <-- these get zeroed".format(st["non_zero"]))
    print("  NULL                : {}".format(st["nulls"]))
    print("  highest value       : {}".format(st["max_v"]))

    to_change = st["non_zero"]
    if to_change == 0:
        print("\n  Nothing to do. Prod is already clean.")
        cur.close(); conn.close(); return

    # ------------------------------------------------------------------
    rule("3. WHO IS AFFECTED (expect ONLY O.W. Lee and Treasure Garden)")
    cur.execute("""
        SELECT COALESCE(m.name, '(none)') AS mfg,
               COALESCE(c.name, '(none)') AS cat,
               COUNT(*) AS n, MIN(p.display_order) AS lo, MAX(p.display_order) AS hi
        FROM products p
        LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
        LEFT JOIN categories    c ON c.id = p.category_id
        WHERE p.display_order <> 0
        GROUP BY 1, 2 ORDER BY 1, 3 DESC;
    """)
    for r in cur.fetchall():
        print("  {:<20} {:<26} {:>4} rows   range {}..{}".format(
            r["mfg"][:20], r["cat"][:26], r["n"], r["lo"], r["hi"]))

    cur.execute("""
        SELECT COALESCE(m.name,'(none)') AS mfg, COUNT(*) AS n
        FROM products p LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
        WHERE p.display_order <> 0 GROUP BY 1 ORDER BY 2 DESC;
    """)
    print("\n  Totals by brand:")
    for r in cur.fetchall():
        print("    {:<24} {}".format(r["mfg"][:24], r["n"]))
    print("\n  If a THIRD brand appears here, stop and send me the output.")

    # ------------------------------------------------------------------
    rule("4. FINGERPRINT THE TABLES WE MUST NOT TOUCH")
    before = guard_checksum(cur)
    for t, (n, s) in before.items():
        print("  {:<20} rows={:<6} sum={}".format(t, n, s))
    print("\n  Re-checked after the write. Any movement aborts everything.")

    # ------------------------------------------------------------------
    rule("5. SNAPSHOT")
    cur.execute("""
        SELECT p.id AS product_id, p.sku, p.name,
               p.manufacturer_id, p.category_id, p.display_order
        FROM products p ORDER BY p.id;
    """)
    snap = cur.fetchall()
    with open(SNAPSHOT_CSV, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["product_id", "sku", "name", "manufacturer_id",
                    "category_id", "display_order"])
        for r in snap:
            w.writerow([r["product_id"], r["sku"], r["name"],
                        r["manufacturer_id"], r["category_id"], r["display_order"]])
    print("  Wrote CSV: {}  ({} rows, ALL prod products)".format(
        SNAPSHOT_CSV, len(snap)))

    if not COMMIT:
        rule("DRY RUN COMPLETE. NOTHING WAS WRITTEN TO PROD.")
        print("  Would zero {} rows.".format(to_change))
        print("  Would create snapshot table: {}".format(SNAPSHOT_TABLE))
        print("  product_images and product_materials are NOT touched.")
        print("  rank_group is NOT touched.")
        print("\n  If the numbers above look right, run the commit command.")
        cur.close(); conn.close(); return

    # ------------------------------------------------------------------
    rule("6. CREATING SNAPSHOT TABLE IN PROD")
    cur.execute("CREATE TABLE {} AS SELECT id AS product_id, display_order "
                "FROM products;".format(SNAPSHOT_TABLE))
    cur.execute("SELECT COUNT(*) AS n FROM {};".format(SNAPSHOT_TABLE))
    print("  Created {} with {} rows.".format(SNAPSHOT_TABLE, cur.fetchone()["n"]))

    rule("7. DRIFT CHECK")
    cur.execute("SELECT COUNT(*) AS n FROM products WHERE display_order <> 0;")
    now = cur.fetchone()["n"]
    print("  non-zero at snapshot : {}".format(to_change))
    print("  non-zero right now   : {}".format(now))
    if now != to_change:
        conn.rollback()
        sys.exit("ABORT: data drifted between read and write. Nothing committed.")
    print("  No drift. Proceeding.")

    rule("8. WRITING TO PRODUCTION")
    cur.execute("UPDATE products SET display_order = 0 WHERE display_order <> 0;")
    print("  {} rows affected.".format(cur.rowcount))

    # ------------------------------------------------------------------
    rule("9. VERIFY BEFORE COMMITTING")
    ok = True

    cur.execute("SELECT COUNT(*) AS n FROM products WHERE display_order <> 0;")
    left = cur.fetchone()["n"]
    print("  products with display_order <> 0 : {}  (expect 0)".format(left))
    ok &= (left == 0)

    cur.execute("SELECT COUNT(*) AS n FROM products;")
    after = cur.fetchone()["n"]
    print("  total product rows               : {}  (expect {})".format(after, total))
    ok &= (after == total)

    cur.execute("SELECT COUNT(*) AS n FROM products WHERE rank_group IS NOT NULL;")
    rg = cur.fetchone()["n"]
    print("  products with a rank group       : {}  (expect 0, untouched)".format(rg))
    ok &= (rg == 0)

    after_guard = guard_checksum(cur)
    for t in ("product_images", "product_materials"):
        same = before[t] == after_guard[t]
        print("  {:<20} {} -> {}   {}".format(
            t, before[t], after_guard[t], "UNCHANGED" if same else "*** MOVED ***"))
        ok &= same

    if not ok:
        conn.rollback()
        sys.exit("ABORT: an invariant failed. Rolled back. NOTHING was written to prod.")

    conn.commit()
    rule("COMMITTED TO PRODUCTION")
    print("  {} products zeroed.".format(to_change))
    print("  O.W. Lee and Treasure Garden are now un-stranded on the live site.")
    print("")
    print("  Snapshot table : {}".format(SNAPSHOT_TABLE))
    print("  Snapshot CSV   : {}".format(SNAPSHOT_CSV))
    print("")
    print("  GO LOOK AT THE LIVE SITE:")
    print("    Open the O.W. Lee brand page. It should now be alphabetical")
    print("    from the top instead of burying O.W. Lee at the bottom.")
    print("")
    print("  TO UNDO:  python3 revert_display_order_prod.py")

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
