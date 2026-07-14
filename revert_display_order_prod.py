#!/usr/bin/env python3
"""
revert_display_order_prod.py

*** TARGETS PRODUCTION (PROD_DATABASE_URL). ***

Restores products.display_order in PROD from the most recent
display_order_prod_backup_* snapshot table created by zero_display_order_prod.py.

Only needed if something looks wrong on the live site after the fix.
Writes ONLY to products.display_order. Dry run first, same as everything else.
"""

import os
import sys

import psycopg2
import psycopg2.extras

# ----------------------------------------------------------------------
COMMIT = False
# ----------------------------------------------------------------------

DB_URL = os.environ.get("PROD_DATABASE_URL")
if not DB_URL:
    sys.exit("PROD_DATABASE_URL is not set. Aborting.")


def rule(t):
    print("\n" + "=" * 78)
    print(t)
    print("=" * 78)


def main():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    mode = "COMMIT (writes will be made)" if COMMIT else "DRY RUN (nothing is written)"
    print("*** MODE: {} ***".format(mode))
    print("*** TARGET: PROD_DATABASE_URL ***")

    rule("1. FIND THE SNAPSHOT")
    cur.execute("""
        SELECT table_name FROM information_schema.tables
        WHERE table_schema='public'
          AND table_name LIKE 'display_order_prod_backup_%'
        ORDER BY table_name DESC;
    """)
    tables = [r["table_name"] for r in cur.fetchall()]
    if not tables:
        sys.exit("ABORT: no display_order_prod_backup_* table found in prod.")
    for t in tables:
        print("  found: {}".format(t))
    snap = tables[0]
    print("\n  Using MOST RECENT: {}".format(snap))

    rule("2. WHAT WOULD BE RESTORED")
    cur.execute("""
        SELECT COUNT(*) AS n FROM products p JOIN {} b ON b.product_id = p.id
        WHERE p.display_order IS DISTINCT FROM b.display_order;
    """.format(snap))
    diff = cur.fetchone()["n"]
    print("  rows differing from snapshot : {}".format(diff))

    if diff == 0:
        print("\n  Nothing to restore. Prod already matches the snapshot.")
        cur.close(); conn.close(); return

    if not COMMIT:
        rule("DRY RUN COMPLETE. NOTHING WRITTEN TO PROD.")
        print("  Would restore {} rows from {}.".format(diff, snap))
        cur.close(); conn.close(); return

    rule("3. RESTORING PROD")
    cur.execute("""
        UPDATE products p SET display_order = b.display_order
        FROM {} b WHERE b.product_id = p.id
          AND p.display_order IS DISTINCT FROM b.display_order;
    """.format(snap))
    print("  {} rows restored.".format(cur.rowcount))

    rule("4. VERIFY")
    cur.execute("""
        SELECT COUNT(*) AS n FROM products p JOIN {} b ON b.product_id = p.id
        WHERE p.display_order IS DISTINCT FROM b.display_order;
    """.format(snap))
    left = cur.fetchone()["n"]
    print("  rows still differing : {}  (expect 0)".format(left))
    if left != 0:
        conn.rollback()
        sys.exit("ABORT: restore incomplete. Rolled back. Nothing written.")

    conn.commit()
    rule("REVERTED")
    print("  prod products.display_order restored from {}.".format(snap))

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
