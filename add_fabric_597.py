#!/usr/bin/env python3
"""
Add the one Telescope cushion fabric missed in the bulk create:
597 Grasscloth Cloud, Grade A (confirmed against the catalog with Karen).

This brings Telescope fabrics from 209 to 210. Same rules as the bulk create:
manufacturer_id = 23, item_number = the real catalog code, is_active = true,
swatch image left empty (captured separately). The Chateau construction
restriction for 597 is not yet confirmed and is not stored on the fabric anyway;
it stays in the reference file for the later wiring phase.

Idempotent (ON CONFLICT DO NOTHING). Guards against prod. DRY RUN by default.

DRY RUN:
    python3 add_fabric_597.py

COMMIT (only after the dry run looks right):
    python3 -c "exec(open('add_fabric_597.py').read().replace('COMMIT = False', 'COMMIT = True'))"
"""

import os
import sys
import psycopg2

COMMIT = False

MANUFACTURER_ID = 23  # Telescope Casual
FABRIC = ("597", "Grasscloth Cloud", "A", "Cushion")  # item_number, name, grade, collection


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set.")
    conn = psycopg2.connect(url)
    cur = conn.cursor()

    cur.execute("SELECT current_database()")
    db = cur.fetchone()[0]
    print("=" * 66)
    print(f"ADD TELESCOPE FABRIC 597   db: {db}   mode: {'COMMIT' if COMMIT else 'DRY RUN'}")
    print("=" * 66)
    if "neon" in (db or "").lower():
        conn.close()
        sys.exit("ABORT: connected to prod (neondb). This is a dev script; run against dev only.")

    item, name, grade, collection = FABRIC

    cur.execute("SELECT COUNT(*) FROM fabrics WHERE manufacturer_id=%s", [MANUFACTURER_ID])
    before = cur.fetchone()[0]
    cur.execute(
        "SELECT id FROM fabrics WHERE manufacturer_id=%s AND item_number=%s",
        [MANUFACTURER_ID, item],
    )
    exists = cur.fetchone()
    print(f"\nTelescope fabrics before : {before}")
    print(f"597 already present      : {'yes (id ' + str(exists[0]) + ')' if exists else 'no'}")

    cur.execute(
        """
        INSERT INTO fabrics (manufacturer_id, item_number, name, grade, collection, is_active)
        VALUES (%s, %s, %s, %s, %s, TRUE)
        ON CONFLICT (manufacturer_id, item_number) DO NOTHING
        """,
        [MANUFACTURER_ID, item, name, grade, collection],
    )
    print(f"Would insert             : {cur.rowcount}  ->  {FABRIC}")

    cur.execute("SELECT COUNT(*) FROM fabrics WHERE manufacturer_id=%s", [MANUFACTURER_ID])
    print(f"Telescope fabrics after (in transaction): {cur.fetchone()[0]}")

    if not COMMIT:
        conn.rollback()
        print("\nDRY RUN. Rolled back, nothing written.")
        conn.close()
        return

    conn.commit()
    cur.execute("SELECT COUNT(*) FROM fabrics WHERE manufacturer_id=%s", [MANUFACTURER_ID])
    print(f"\nCommitted. Telescope fabrics now: {cur.fetchone()[0]}   (expected 210)")
    conn.close()


if __name__ == "__main__":
    main()
