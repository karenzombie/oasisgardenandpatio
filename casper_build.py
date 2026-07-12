import os
import psycopg2
import psycopg2.extras

COMMIT = False

MANUFACTURER_ID = 16
COLLECTION = "Casper"

DESCRIPTION = (
    "Sleek design meets functional elegance in the Casper collection. Constructed with a durable "
    "steel frame and high-quality woven rope and resin, this collection provides a comfortable seat "
    "and excellent weather resistance. Whether it's a patio, outdoor dining area, or poolside setting, "
    "Casper's versatile design will beautifully complement your space with ease.\n\n"
    "- Durable: All components are made from high-quality materials to withstand use in high-traffic areas.\n"
    "- Innovative: The woven mix of rope and resin creates a visually appealing and innovative look.\n"
    "- Lightweight: The lean yet sturdy steel frame allows for easy maneuverability of each unit.\n"
    "- Low Maintenance: Casper is built to resist the elements for years of stress-free enjoyment.\n"
    "- Sustainable: The eco-friendly steel frame is long lasting and recyclable."
)

# Casper woven finishes: Nightfall Graphite (513) and Nightfall Greige (514)
WOVEN_FINISH_IDS = [513, 514]

# All 4 products -- specs from sell sheet, Arm Height N/A on all so omitted
PRODUCTS = [
    {
        "id": 4003,
        "sku": "95350",
        "name": "Casper Armless Dining Chair",
        "category_id": 44,
        "sub_category": "Dining Chair",
        "specs": {"Height": '33.7"', "Width": '21.5"', "Depth": '23"', "Seat Height": '17.7"'},
    },
    {
        "id": 4004,
        "sku": "95380",
        "name": "Casper Armless Chat Chair",
        "category_id": 44,
        "sub_category": "Dining Chair",
        "specs": {"Height": '32.5"', "Width": '23.6"', "Depth": '32.1"', "Seat Height": '16.3"', "Weight": "13 lbs."},
    },
    {
        "id": 4005,
        "sku": "95250",
        "name": "Casper Armless Balcony Stool",
        "category_id": 44,
        "sub_category": "Bar & Counter Stools",
        "specs": {"Height": '38"', "Width": '20.3"', "Depth": '22.3"', "Seat Height": '25.6"'},
    },
    {
        "id": 4006,
        "sku": "95480",
        "name": "Casper Armless Bar Stool",
        "category_id": 44,
        "sub_category": "Bar & Counter Stools",
        "specs": {"Height": '41.9"', "Width": '20.3"', "Depth": '22.3"', "Seat Height": '29.5"'},
    },
]

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

print("=" * 60)
print("CASPER BUILD -- DRY RUN" if not COMMIT else "CASPER BUILD -- LIVE COMMIT")
print("=" * 60)

# ── Step 1: Update category, sub_category, specs, description ─
print("\n[1] PRODUCT UPDATES (4 products)")
for p in PRODUCTS:
    if COMMIT:
        cur.execute("""
            UPDATE products
            SET category_id = %s,
                sub_category = %s,
                specs = %s,
                description = %s,
                short_description = NULL
            WHERE id = %s AND manufacturer_id = %s
        """, (
            p["category_id"], p["sub_category"],
            psycopg2.extras.Json(p["specs"]),
            DESCRIPTION, p["id"], MANUFACTURER_ID
        ))
        print(f"  Updated id={p['id']} sku={p['sku']}")
    else:
        print(f"  DRY RUN: id={p['id']} sku={p['sku']} | cat=44 (Dining) | sub='{p['sub_category']}' | specs={p['specs']}")

# ── Step 2: Wire woven finishes ───────────────────────────────
print(f"\n[2] FINISH WIRING (Nightfall Graphite id=513, Nightfall Greige id=514)")
for p in PRODUCTS:
    pid = p["id"]
    cur.execute("SELECT id FROM product_finish_pools WHERE product_id = %s", (pid,))
    if cur.fetchone():
        print(f"  id={pid}: finish pool already exists, skipping.")
        continue
    if COMMIT:
        cur.execute("INSERT INTO product_finish_pools (product_id, manufacturer_id) VALUES (%s, %s)", (pid, MANUFACTURER_ID))
    else:
        print(f"  DRY RUN: Would insert finish pool for id={pid}")
    for order, fid in enumerate(WOVEN_FINISH_IDS, start=1):
        cur.execute("SELECT id FROM product_finish_options WHERE product_id = %s AND finish_id = %s", (pid, fid))
        if cur.fetchone():
            continue
        if COMMIT:
            cur.execute("""
                INSERT INTO product_finish_options (product_id, finish_id, display_order, upcharge_msrp, upcharge_sale)
                VALUES (%s, %s, %s, 0, 0)
            """, (pid, fid, order))
        else:
            print(f"    DRY RUN: Would wire finish_id={fid} order={order}")

if COMMIT:
    print(f"  Finish wiring committed: 4 products x {len(WOVEN_FINISH_IDS)} woven finishes.")
else:
    print(f"  DRY RUN: Would wire {len(WOVEN_FINISH_IDS)} woven finishes to 4 products.")

# ── Step 3: Verification ──────────────────────────────────────
print("\n[3] VERIFICATION")
cur.execute("""
    SELECT p.id, p.sku, p.name, p.category_id, p.sub_category,
           p.is_active, p.available_online, p.show_price_online, p.quote_only,
           p.specs->>'Height' AS height,
           p.specs->>'Weight' AS weight,
           COUNT(DISTINCT pfo.id) AS finish_ct,
           COUNT(DISTINCT pfa.id) AS fabric_ct
    FROM products p
    LEFT JOIN product_finish_options pfo ON pfo.product_id = p.id
    LEFT JOIN product_fabric_options pfa ON pfa.product_id = p.id
    WHERE p.id IN (4003, 4004, 4005, 4006)
    GROUP BY p.id, p.sku, p.name, p.category_id, p.sub_category,
             p.is_active, p.available_online, p.show_price_online, p.quote_only, p.specs
    ORDER BY p.id
""")
rows = cur.fetchall()
print(f"  Products found: {len(rows)} (expected 4)")
all_ok = True
for r in rows:
    cat_ok = r[3] == 44
    sub_ok = r[4] in ('Dining Chair', 'Bar & Counter Stools')
    finish_ok = r[11] == len(WOVEN_FINISH_IDS)
    fabric_ok = r[12] == 0
    flags_ok = r[5] and r[6] and not r[7] and r[8]
    specs_ok = r[9] is not None
    ok = all([cat_ok, sub_ok, finish_ok, fabric_ok, flags_ok, specs_ok])
    if not ok:
        all_ok = False
    status = "OK" if ok else "MISMATCH"
    print(f"  {status} id={r[0]} {r[1]} | cat={r[3]} {'OK' if cat_ok else 'MISMATCH(need 44)'} | sub={repr(r[4])} {'OK' if sub_ok else 'MISMATCH'} | height={r[9]} | weight={r[10]} | {r[11]} finishes {'OK' if finish_ok else f'MISMATCH(need {len(WOVEN_FINISH_IDS)})'} | {r[12]} fabrics | flags={'OK' if flags_ok else 'MISMATCH'}")
if all_ok:
    print("  All checks OK.")

if COMMIT:
    conn.commit()
    print("\nCOMMIT COMPLETE.")
else:
    conn.rollback()
    print("\nDRY RUN COMPLETE. No changes written.")

cur.close()
conn.close()
