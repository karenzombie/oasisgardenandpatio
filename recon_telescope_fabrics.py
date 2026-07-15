#!/usr/bin/env python3
"""
Read-only recon: Telescope (manufacturer_id=23) fabric/finish misfiling.

Confirms and scopes the known problem BEFORE we write any fix. The diagnosis on
record: Telescope fabrics (Sunbrella cushion, sling, Ultraleather, Rain) were
loaded into the FINISHES table, and Materials > Fabrics > Telescope is empty.
That is why a product like Antero shows ~114 "finishes" and zero fabric options.

This verifies that against live dev data and measures the exact scope:
  - how many Telescope fabrics vs finishes exist,
  - how the Telescope finishes group (so we can see real frame finishes vs
    misfiled fabric colors),
  - the symptom on the Antero products (finish options vs fabric options),
  - how many Telescope products / rows the re-wire will touch.

Connects to DATABASE_URL (dev). READ-ONLY. Writes nothing.

RUN:
    python3 recon_telescope_fabrics.py
"""

import os
import sys
import psycopg2

TELESCOPE = 23


def main():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("DATABASE_URL is not set.")
    conn = psycopg2.connect(url)
    conn.set_session(readonly=True)
    cur = conn.cursor()

    cur.execute("SELECT current_database()")
    db = cur.fetchone()[0]
    print("=" * 74)
    print(f"READ-ONLY RECON: Telescope fabric/finish misfiling   db: {db}")
    print("=" * 74)

    # 1. Core symptom: fabrics empty, finishes bloated
    cur.execute("SELECT COUNT(*) FROM fabrics WHERE manufacturer_id=%s", [TELESCOPE])
    fab = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM finishes WHERE manufacturer_id=%s", [TELESCOPE])
    fin = cur.fetchone()[0]
    print("\n1. Core counts")
    print(f"   Telescope fabrics : {fab}   (expected ~0 if the diagnosis holds)")
    print(f"   Telescope finishes: {fin}   (expected bloated with fabric colors)")

    # 2. finishes columns (so we group by what actually exists, no assumptions)
    cur.execute("""
        SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name='finishes'
        ORDER BY ordinal_position
    """)
    fcols = [r[0] for r in cur.fetchall()]
    print(f"\n2. finishes columns: {', '.join(fcols)}")

    # 3. Telescope finishes grouped by description
    if "description" in fcols:
        cur.execute("""
            SELECT COALESCE(NULLIF(description,''),'(blank)') AS d, COUNT(*)
            FROM finishes WHERE manufacturer_id=%s
            GROUP BY d ORDER BY COUNT(*) DESC
        """, [TELESCOPE])
        print("\n3. Telescope finishes grouped by description:")
        for d, n in cur.fetchall():
            print(f"   {n:4d}  {d}")

    # 3b. If finishes link to a finish collection, group by that too
    coll_col = next((c for c in fcols if c in ("finish_collection_id", "collection_id")), None)
    if coll_col:
        cur.execute(f"""
            SELECT COALESCE(fc.collection_name,'(none)') AS cname, COUNT(*)
            FROM finishes f
            LEFT JOIN finish_collections fc ON fc.id = f.{coll_col}
            WHERE f.manufacturer_id=%s
            GROUP BY cname ORDER BY COUNT(*) DESC
        """, [TELESCOPE])
        print(f"\n3b. Telescope finishes grouped by finish collection (via {coll_col}):")
        for cname, n in cur.fetchall():
            print(f"   {n:4d}  {cname}")

    # 4. Telescope finish_collections defined
    cur.execute("""
        SELECT collection_name FROM finish_collections
        WHERE manufacturer_id=%s ORDER BY collection_name
    """, [TELESCOPE])
    fcs = [r[0] for r in cur.fetchall()]
    print(f"\n4. Telescope finish_collections ({len(fcs)}):")
    print("   " + (", ".join(fcs) if fcs else "(none)"))

    # 5. Antero sample: finish options vs fabric options vs finish pool
    cur.execute("""
        SELECT id, name FROM products
        WHERE manufacturer_id=%s AND name ILIKE %s
        ORDER BY name
    """, [TELESCOPE, "%antero%"])
    antero = cur.fetchall()
    print(f"\n5. Antero products ({len(antero)}): the symptom, per product")
    for pid, name in antero:
        cur.execute("SELECT COUNT(*) FROM product_finish_options WHERE product_id=%s", [pid])
        fo = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM product_fabric_options WHERE product_id=%s", [pid])
        xo = cur.fetchone()[0]
        cur.execute("SELECT COUNT(*) FROM product_finish_pools WHERE product_id=%s", [pid])
        fp = cur.fetchone()[0]
        print(f"   [{pid}] {name}")
        print(f"        finish_options={fo}   fabric_options={xo}   finish_pool_rows={fp}")

    # 6. Re-wire scope across all Telescope products
    cur.execute("""
        SELECT COUNT(DISTINCT pfo.product_id)
        FROM product_finish_options pfo
        JOIN products p ON p.id=pfo.product_id
        WHERE p.manufacturer_id=%s
    """, [TELESCOPE])
    prod_with_fo = cur.fetchone()[0]
    cur.execute("""
        SELECT COUNT(*) FROM product_finish_options pfo
        JOIN products p ON p.id=pfo.product_id
        WHERE p.manufacturer_id=%s
    """, [TELESCOPE])
    total_fo = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM products WHERE manufacturer_id=%s", [TELESCOPE])
    total_prod = cur.fetchone()[0]
    print("\n6. Re-wire scope")
    print(f"   Telescope products total                : {total_prod}")
    print(f"   Telescope products with finish options  : {prod_with_fo}")
    print(f"   Total Telescope product_finish_options  : {total_fo}")

    conn.close()
    print("\n" + "=" * 74)
    print("Recon only. No changes made. Use this to scope the fabric fix before writing.")
    print("=" * 74)


if __name__ == "__main__":
    main()
