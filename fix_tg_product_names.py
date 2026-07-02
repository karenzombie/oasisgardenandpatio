import psycopg2
from psycopg2.extras import RealDictCursor
import os

DRY_RUN = True

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=RealDictCursor)

cur.execute("SELECT id FROM manufacturers WHERE slug = 'treasure-garden'")
mfr_id = cur.fetchone()['id']

updates = {
    'AG25TR':   "AG25T 11.5'",
    'AG25TR10': "AG25T 10'",
    'AG25TSQR': "AG25TSQ 10'",
    'AKZP':     "AKZ PLUS 11'",
    'AKZP13':   "AKZ PLUS 13'",
    'AKZP13LX': "STARLUX AKZ PLUS 13'",
    'AKZPRT':   "AKZ PLUS 10'x13'",
    'AKZPRTLX': "STARLUX AKZ PLUS 10'x13'",
    'AKZPSQ11': "AKZ PLUS 11.5'",
    'ET3RT':    "EASY TRACK\u00ae 10'x13'",
    'UM800':    "COLLAR TILT 9'",
    'UM800LX':  "STARLUX COLLAR TILT 9'",
    'UM801':    "COLLAR TILT 11'",
    'UM809-1H': "QUAD PULLEY LIFT 9'",
    'UM810':    "AUTO TILT 9'",
    'UM812':    "AUTO TILT 11'",
    'UM840':    "FLEX 9'",
    'UM841':    "FLEX 11'",
    'UM847SQ':  "FLEX 7.5'",
    'UM850':    "TWIST 9'",
    'UM851':    "TWIST 11'",
    'UM8810RT': "AUTO TILT 8'x10'",
    'UM907':    "PUSH BUTTON TILT 7.5'",
    'UM920':    "PUSH BUTTON TILT 9'",
    'UM970':    "GLIDE TILT 9'",
    'UM977':    "GLIDE TILT 7.5'",
    'USA45-09': "SHANGHAI COLLAR TILT 10'",
    'PFC530':   'Bistro Table & Chairs Cover 30\u2033',
    'PFC536':   'Round/Square Bistro Table & Chairs Cover 36\u2033',
    'PFC551':   'Round/Square Table & Chairs Cover 48\u2033',
    'PFC571':   'Round/Square Table & Chairs Cover 54\u2033',
    'PFC590':   'Round/Square Table & Chairs Cover 60\u2033',
}

print(f"Mode: {'DRY RUN' if DRY_RUN else 'LIVE'}")
print(f"Updates to apply: {len(updates)}\n")

hit = 0
miss = 0
for sku, new_name in updates.items():
    cur.execute("SELECT id, name FROM products WHERE manufacturer_id = %s AND sku = %s", (mfr_id, sku))
    row = cur.fetchone()
    if not row:
        print(f"  MISS: {sku}")
        miss += 1
    else:
        print(f"  {'[DRY RUN] ' if DRY_RUN else ''}UPDATE {sku}: '{row['name']}' -> '{new_name}'")
        if not DRY_RUN:
            cur.execute("UPDATE products SET name = %s WHERE id = %s", (new_name, row['id']))
        hit += 1

if not DRY_RUN:
    conn.commit()
    print("\nCommitted.")
else:
    print("\nDry run complete. No changes made.")

print(f"\nHits: {hit} | Misses: {miss}")

print("\n=== VERIFICATION ===")
cur.execute("""
    SELECT sku, name FROM products
    WHERE manufacturer_id = %s AND sku = ANY(%s)
    ORDER BY sku
""", (mfr_id, list(updates.keys())))
for r in cur.fetchall():
    expected = updates[r['sku']]
    status = 'OK' if r['name'] == expected else 'MISMATCH'
    print(f"  {status} | {r['sku']} | {r['name']}")

conn.close()
