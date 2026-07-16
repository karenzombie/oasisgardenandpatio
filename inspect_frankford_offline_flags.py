#!/usr/bin/env python3
"""
Read-only inspection. Prints the visibility flags for the 4 Frankford products
Karen set to "not available online" in dev, so we can tell whether quote_only
actually persisted.

Runs against DATABASE_URL (dev / heliumdb) by default. Pure SELECT, no writes.
"""
import os
import psycopg2

SKUS = ["BH-CHAIR", "FC101", "FC101-NF", "FC-TBL"]

def main():
    dsn = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(dsn)
    cur = conn.cursor()
    cur.execute(
        """
        SELECT sku,
               is_active,
               catalog_visible,
               available_online,
               quote_only,
               in_store_only,
               show_price_online
        FROM products
        WHERE sku = ANY(%s)
        ORDER BY sku
        """,
        (SKUS,),
    )
    rows = cur.fetchall()

    hdr = ["sku", "active", "cat_vis", "avail_online", "quote_only", "in_store", "show_price"]
    widths = [10, 7, 8, 13, 11, 9, 11]
    print(" ".join(h.ljust(w) for h, w in zip(hdr, widths)))
    print("-" * (sum(widths) + len(widths)))
    found = set()
    for r in rows:
        found.add(r[0])
        cells = [str(r[0])] + [str(v) for v in r[1:]]
        print(" ".join(c.ljust(w) for c, w in zip(cells, widths)))

    missing = [s for s in SKUS if s not in found]
    if missing:
        print()
        print("NOT FOUND:", ", ".join(missing))

    print()
    print("Invariant check (available_online should equal NOT quote_only):")
    for r in rows:
        ok = bool(r[3]) == (not bool(r[4]))
        print(f"  {r[0].ljust(10)} available_online={r[3]}  quote_only={r[4]}  ->  {'OK' if ok else 'VIOLATED'}")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
