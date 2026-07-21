#!/usr/bin/env python3
"""
Read-only verification that today's catalog changes reached PROD after deploy.

Checks the key outcomes so we don't trust a green deploy alone (the postbuild
`|| true` can mask a silent sync failure). NO WRITES. Read-only session against
PROD_DATABASE_URL. Requires ALLOW_PROD=1 so it can't run by accident.

Run AFTER deploying:  ALLOW_PROD=1 python3 verify_prod_after_deploy.py
"""
import os
import sys
from urllib.parse import urlparse

import psycopg2
from psycopg2.extras import RealDictCursor

if os.environ.get("ALLOW_PROD") != "1":
    sys.exit("Refusing to run: set ALLOW_PROD=1 to read prod.")

DB_URL = os.environ.get("PROD_DATABASE_URL")
if not DB_URL:
    sys.exit("PROD_DATABASE_URL not set.")

host = urlparse(DB_URL).hostname or "unknown"
print(f"PROD_DATABASE_URL host: {host}   (expected: neon/prod)")
print("=" * 72)

conn = psycopg2.connect(DB_URL)
conn.set_session(readonly=True, autocommit=True)
cur = conn.cursor(cursor_factory=RealDictCursor)


def q1(sql, args=()):
    cur.execute(sql, args)
    return cur.fetchone()


ok = True


def check(label, got, expected, good=None):
    global ok
    passed = good(got) if good else (got == expected)
    ok = ok and passed
    mark = "PASS" if passed else "**FAIL**"
    print(f"  [{mark}] {label}: {got}  (expected {expected})")


# 1. Escapade product deleted from prod.
r = q1("SELECT COUNT(*) AS n FROM products WHERE sku = 'ES60-GREYSTOCK0-0000'")
check("Escapade product removed", r["n"], 0)

# 2. O.W. Lee: no product carries BOTH Aluminum and Wrought Iron anymore.
cur.execute("SELECT id FROM manufacturers WHERE slug = 'o-w-lee'")
owl = cur.fetchone()["id"]
r = q1(
    """
    SELECT COUNT(*) AS n FROM products p
    WHERE p.manufacturer_id = %s
      AND EXISTS (SELECT 1 FROM product_materials pm JOIN materials m ON m.id=pm.material_id
                  WHERE pm.product_id=p.id AND m.name='Aluminum')
      AND EXISTS (SELECT 1 FROM product_materials pm JOIN materials m ON m.id=pm.material_id
                  WHERE pm.product_id=p.id AND m.name='Wrought Iron')
    """,
    (owl,),
)
check("O.W. Lee aluminum+iron contamination cleared", r["n"], 0)

# 3. Hanamint: no product with zero material rows.
cur.execute("SELECT id FROM manufacturers WHERE slug = 'hanamint'")
hana = cur.fetchone()["id"]
r = q1(
    """
    SELECT COUNT(*) AS n FROM products p
    WHERE p.manufacturer_id = %s
      AND NOT EXISTS (SELECT 1 FROM product_materials pm WHERE pm.product_id=p.id)
    """,
    (hana,),
)
check("Hanamint products with no material", r["n"], 0)

# 4. Tags present: products carrying at least one tag (manufacturer + material).
r = q1(
    """
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE jsonb_typeof(tags)='array' AND jsonb_array_length(tags)>0) AS tagged
    FROM products
    """
)
print(f"  [INFO] prod products: {r['total']}, tagged: {r['tagged']}")
check("all prod products carry >=1 tag", r["tagged"], r["total"],
      good=lambda g: g == r["total"])

# 5. Collection fields populated for the three cleaned vendors.
for slug, expect_blank, label in [
    ("tropitone", 0, "Tropitone blank collections"),
    ("couture-jardin", 4, "Couture Jardin blank collections (4 pillows)"),
]:
    cur.execute("SELECT id FROM manufacturers WHERE slug = %s", (slug,))
    mid = cur.fetchone()["id"]
    r = q1(
        "SELECT COUNT(*) AS n FROM products WHERE manufacturer_id=%s "
        "AND (collection IS NULL OR collection='')",
        (mid,),
    )
    check(label, r["n"], expect_blank)

# Sunset West: only the Fire Tables should be blank (report the number).
cur.execute("SELECT id FROM manufacturers WHERE slug='sunset-west'")
sw = cur.fetchone()["id"]
r = q1(
    "SELECT COUNT(*) AS n FROM products WHERE manufacturer_id=%s "
    "AND (collection IS NULL OR collection='')",
    (sw,),
)
print(f"  [INFO] Sunset West blank collections (Fire Tables, expect ~10): {r['n']}")

print("=" * 72)
print("RESULT:", "ALL CHECKS PASSED" if ok else "*** SOME CHECKS FAILED, investigate ***")
cur.close()
conn.close()
