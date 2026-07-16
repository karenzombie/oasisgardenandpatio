#!/usr/bin/env python3
"""
Read-only recon for the Telescope fabric creation + finish cleanup.

Answers three things before we write anything:
  1. What does a fabric row need? (columns, which are required, defaults) so we
     know whether a plain INSERT works (script Karen runs) or whether creating
     a fabric needs app-side logic (agent job).
  2. What does a real, populated fabric row look like (a sample), to model the
     Telescope inserts on.
  3. How are the 84 misfiled Telescope fabric-finishes wired to products, and
     what happens to those links if a finish is deleted, so we sequence the
     finish cleanup safely (create fabrics -> re-point products -> then delete).

Connects to DATABASE_URL (dev). READ-ONLY. Writes nothing.

RUN:
    python3 recon_fabrics_structure.py
"""

import os
import sys
import psycopg2

TELESCOPE = 23
DELREL = {"a": "NO ACTION", "r": "RESTRICT", "c": "CASCADE", "n": "SET NULL", "d": "SET DEFAULT"}


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set.")
    conn = psycopg2.connect(url)
    conn.set_session(readonly=True)
    cur = conn.cursor()

    cur.execute("SELECT current_database()")
    print("=" * 76)
    print(f"READ-ONLY RECON: fabrics structure + Telescope finish wiring   db: {cur.fetchone()[0]}")
    print("=" * 76)

    # 1. fabrics table columns: what a fabric row needs
    cur.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name='fabrics'
        ORDER BY ordinal_position
    """)
    print("\n1. fabrics table columns (required = NOT NULL with no default):")
    for name, dtype, nullable, default in cur.fetchall():
        req = "" if nullable == "YES" or default is not None else "   <-- REQUIRED"
        dflt = f"  default={default}" if default is not None else ""
        print(f"   {name:22} {dtype:16} nullable={nullable}{dflt}{req}")

    # 2. A couple of real fabric rows to model inserts on (use Homecrest = 16)
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='fabrics'
        ORDER BY ordinal_position
    """)
    cols = [r[0] for r in cur.fetchall()]
    cur.execute(f'SELECT {", ".join(chr(34)+c+chr(34) for c in cols)} FROM fabrics WHERE manufacturer_id=16 LIMIT 2')
    print("\n2. Sample existing fabric rows (Homecrest), to model Telescope inserts:")
    for i, row in enumerate(cur.fetchall(), 1):
        print(f"   --- sample {i} ---")
        for c, v in zip(cols, row):
            v = (str(v)[:60] + "...") if v is not None and len(str(v)) > 63 else v
            print(f"     {c:22} = {v!r}")

    # 3. FK on-delete behavior for the two option tables
    cur.execute("""
        SELECT conname, conrelid::regclass::text AS tbl, confrelid::regclass::text AS ref, confdeltype
        FROM pg_constraint
        WHERE contype='f'
          AND conrelid IN ('product_finish_options'::regclass, 'product_fabric_options'::regclass)
          AND confrelid IN ('finishes'::regclass, 'fabrics'::regclass)
    """)
    print("\n3. What happens to product links if a finish/fabric is deleted:")
    for conname, tbl, ref, deltype in cur.fetchall():
        print(f"   {tbl} -> {ref}: ON DELETE {DELREL.get(deltype, deltype)}")

    # 4. Wiring scope: how the 84 misfiled fabric-finishes tie to products
    cur.execute("""
        SELECT id FROM finishes
        WHERE manufacturer_id=%s AND description IN ('Sling','Ultraleather')
    """, [TELESCOPE])
    misfiled_ids = [r[0] for r in cur.fetchall()]
    print(f"\n4. Misfiled fabric-finishes (Sling + Ultraleather): {len(misfiled_ids)} finish rows")

    if misfiled_ids:
        cur.execute("""
            SELECT COUNT(*) FROM product_finish_options WHERE finish_id = ANY(%s)
        """, [misfiled_ids])
        pfo = cur.fetchone()[0]
        cur.execute("""
            SELECT COUNT(DISTINCT product_id) FROM product_finish_options WHERE finish_id = ANY(%s)
        """, [misfiled_ids])
        prod = cur.fetchone()[0]
        print(f"   product_finish_options rows pointing at them : {pfo}")
        print(f"   distinct products affected                   : {prod}")
        print("   (these are the links that must move to product_fabric_options")
        print("    before the 84 finish rows can be deleted)")

    # 5. Does a fabric-options fallback pool exist for Telescope? (mirrors the finish pool issue)
    cur.execute("SELECT to_regclass('product_fabric_pools')")
    if cur.fetchone()[0] is not None:
        cur.execute("""
            SELECT COUNT(*) FROM product_fabric_pools pfp
            JOIN products p ON p.id = pfp.product_id
            WHERE p.manufacturer_id=%s
        """, [TELESCOPE])
        print(f"\n5. Telescope product_fabric_pools rows (fabric fallback): {cur.fetchone()[0]}")

    conn.close()
    print("\n" + "=" * 76)
    print("Recon only. No changes made.")
    print("=" * 76)


if __name__ == "__main__":
    main()
