import os
import psycopg2

COMMIT = False

MANUFACTURER_ID = 16

# CH-PAD (id=4011) and CH-PADNT (id=4012)
PRODUCTS = [
    {"id": 4011, "sku": "CH-PAD"},
    {"id": 4012, "sku": "CH-PADNT"},
]

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

print("=" * 60)
print("ECHO SEAT PAD FABRIC WIRING -- DRY RUN" if not COMMIT else "ECHO SEAT PAD FABRIC WIRING -- LIVE COMMIT")
print("=" * 60)

# Fetch C cushion fabrics
cur.execute("""
    SELECT id FROM fabrics
    WHERE manufacturer_id = %s AND availability_codes LIKE '%%C%%'
    ORDER BY id
""", (MANUFACTURER_ID,))
c_fabric_ids = [r[0] for r in cur.fetchall()]
print(f"\n  Found {len(c_fabric_ids)} C fabrics.")

for p in PRODUCTS:
    pid = p["id"]
    print(f"\n  Processing id={pid} sku={p['sku']}")
    cur.execute("SELECT id FROM product_fabric_pools WHERE product_id = %s", (pid,))
    if cur.fetchone():
        print(f"    Fabric pool already exists, skipping.")
        continue
    if COMMIT:
        cur.execute("INSERT INTO product_fabric_pools (product_id, manufacturer_id) VALUES (%s, %s)", (pid, MANUFACTURER_ID))
    else:
        print(f"    DRY RUN: Would insert fabric pool")
    for order, fab_id in enumerate(c_fabric_ids, start=1):
        cur.execute("SELECT id FROM product_fabric_options WHERE product_id = %s AND fabric_id = %s", (pid, fab_id))
        if cur.fetchone():
            continue
        if COMMIT:
            cur.execute("""
                INSERT INTO product_fabric_options (product_id, fabric_id, display_order)
                VALUES (%s, %s, %s)
            """, (pid, fab_id, order))
    if not COMMIT:
        print(f"    DRY RUN: Would wire {len(c_fabric_ids)} C fabrics")

if COMMIT:
    print(f"\n  Fabric wiring committed: 2 products x {len(c_fabric_ids)} C fabrics.")

# Verification
print("\n[VERIFICATION]")
cur.execute("""
    SELECT p.id, p.sku, COUNT(pfa.id) AS fabric_ct
    FROM products p
    LEFT JOIN product_fabric_options pfa ON pfa.product_id = p.id
    WHERE p.id IN (4011, 4012)
    GROUP BY p.id, p.sku
    ORDER BY p.id
""")
for r in cur.fetchall():
    status = "OK" if r[2] == len(c_fabric_ids) else f"MISMATCH (expected {len(c_fabric_ids)})"
    print(f"  id={r[0]} {r[1]}: {r[2]} fabrics -- {status}")

if COMMIT:
    conn.commit()
    print("\nCOMMIT COMPLETE.")
else:
    conn.rollback()
    print("\nDRY RUN COMPLETE. No changes written.")

cur.close()
conn.close()
