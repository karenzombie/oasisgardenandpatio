#!/usr/bin/env python3
"""
Read-only verification of PROD after the deploy sync.

A green deploy does not prove the catalog sync ran (the postbuild || true
swallows failures). This checks prod directly for the specific changes we
pushed today. Connects to PROD_DATABASE_URL, read-only. Writes nothing.

RUN:
    python3 verify_prod_after_deploy.py
"""

import os
import sys
import psycopg2


def main():
    url = os.environ.get("PROD_DATABASE_URL")
    if not url:
        sys.exit("PROD_DATABASE_URL is not set.")
    conn = psycopg2.connect(url)
    conn.set_session(readonly=True)
    cur = conn.cursor()

    cur.execute("SELECT current_database(), inet_server_addr()::text")
    dbname, host = cur.fetchone()
    print("=" * 70)
    print("READ-ONLY VERIFICATION: PROD after deploy")
    print(f"database: {dbname}   host: {host}")
    print("=" * 70)
    if "neon" not in (dbname or "").lower():
        print("  NOTE: database name does not look like prod (neondb). Check the URL.")

    ok = True

    def check(label, cond, detail=""):
        nonlocal ok
        print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f"  {detail}" if detail else ""))
        ok = ok and cond

    print("\n1. Phantom 3903 removed")
    print("-" * 70)
    cur.execute("SELECT COUNT(*) FROM products WHERE id = 3903")
    n = cur.fetchone()[0]
    check("product 3903 is gone from prod", n == 0, f"(count {n})")

    print("\n2. Umbrella ranking synced")
    print("-" * 70)
    cur.execute("SELECT COUNT(*) FROM products WHERE rank_group = 1")
    r1 = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM products WHERE rank_group = 2")
    r2 = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM products WHERE rank_group IS NOT NULL")
    rtot = cur.fetchone()[0]
    check("rank_group=1 count is 81", r1 == 81, f"(got {r1})")
    check("rank_group=2 count is 62", r2 == 62, f"(got {r2})")
    check("total ranked is 143", rtot == 143, f"(got {rtot})")

    print("\n3. Telescope SKU / name fixes landed")
    print("-" * 70)
    expected = {
        3502: ("67Y26L", "Commercial Market Umbrella 7.5'"),
        3503: ("60Y26L", "Commercial Market Umbrella 9'"),
        3904: ("10W26L", "Value Push Button Tilt Market Umbrella 7.5'"),
        3905: ("19W26L", "Value Autotilt Market Umbrella 9'"),
        3899: ("130W", 'Weighted Base w/ Handle 16" 45 lbs'),
        3900: ("3800W", 'Round Weighted Base w/ Wheels 21" 80 lbs'),
        3901: ("3700W", 'Round Weighted Base w/ Wheels 24" 120 lbs'),
        3902: ("1200Y", 'Square Steel Market Base 24" 55 lbs'),
    }
    for pid, (sku, name) in expected.items():
        cur.execute("SELECT sku, name FROM products WHERE id = %s", [pid])
        r = cur.fetchone()
        cond = r is not None and r[0] == sku and r[1] == name
        check(f"{pid} = {sku}", cond, "" if cond else f"(got {r})")

    print("\n4. Category state (for the cleanup that comes next)")
    print("-" * 70)
    cur.execute("SELECT COUNT(*) FROM categories")
    ncat = cur.fetchone()[0]
    print(f"  prod categories: {ncat} (expect 23 now, 17 after the cleanup)")
    cur.execute("""
        SELECT id, name FROM categories WHERE id IN (46,55,56,57,58,59) ORDER BY id
    """)
    leftover = cur.fetchall()
    print(f"  leftover empty categories still present: {len(leftover)}")
    for cid, name in leftover:
        cur.execute("SELECT COUNT(*) FROM products WHERE category_id=%s", [cid])
        pn = cur.fetchone()[0]
        print(f"    {cid} {name!r}  (products pointing here: {pn})")

    conn.close()
    print("\n" + "=" * 70)
    if ok:
        print("Sync verified. Next: delete the 6 leftover categories in prod.")
    else:
        print("One or more checks FAILED. The sync may not have applied. Stop and review.")
    print("=" * 70)


if __name__ == "__main__":
    main()
