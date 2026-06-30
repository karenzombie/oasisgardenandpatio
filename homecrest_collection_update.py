import psycopg2
import psycopg2.extras
import csv
import os

DRY_RUN = True

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

with open('homecrest_collection_update.csv', newline='') as f:
    updates = list(csv.DictReader(f))

print(f"Loaded {len(updates)} proposed collection updates from homecrest_collection_update.csv")
print(f"DRY_RUN = {DRY_RUN}")
print()

# Pre-flight: confirm every id exists in the DB, belongs to Homecrest, and the
# sku still matches what we audited (catches any drift since the last pull).
cur.execute("""
    SELECT p.id, p.sku, p.name, p.collection
    FROM products p
    JOIN manufacturers m ON m.id = p.manufacturer_id
    WHERE m.slug = 'homecrest'
""")
db_rows = {str(r['id']): r for r in cur.fetchall()}

missing = []
sku_mismatches = []
for u in updates:
    db_row = db_rows.get(u['id'])
    if not db_row:
        missing.append(u['id'])
        continue
    if db_row['sku'] != u['sku']:
        sku_mismatches.append((u['id'], u['sku'], db_row['sku']))

if missing:
    print(f"ABORTING: {len(missing)} ids from the CSV were not found in the live DB:")
    print(missing[:20])
    cur.close()
    conn.close()
    raise SystemExit(1)

if sku_mismatches:
    print(f"ABORTING: {len(sku_mismatches)} rows have a SKU in the DB that doesn't match the audit.")
    for m in sku_mismatches[:20]:
        print(f"  id={m[0]} audited_sku={m[1]!r} db_sku={m[2]!r}")
    cur.close()
    conn.close()
    raise SystemExit(1)

print("Pre-flight check passed: all ids found, all SKUs match.")
print()

if DRY_RUN:
    print("=== DRY RUN: showing all proposed collection changes, no writes will be made ===")
    changed = 0
    for u in updates:
        db_row = db_rows[u['id']]
        current = db_row['collection'] or ''
        new = u['final_collection']
        if current != new:
            changed += 1
            print(f"id={u['id']} sku={u['sku']} name={db_row['name']!r}")
            print(f"  collection: {current!r} -> {new!r}")
    print()
    print(f"DRY RUN COMPLETE. {changed} of {len(updates)} rows would actually change. Nothing written.")
else:
    updated = 0
    for u in updates:
        cur.execute(
            "UPDATE products SET collection = %s WHERE id = %s",
            (u['final_collection'], u['id'])
        )
        updated += 1
    conn.commit()
    print(f"COMMITTED. {updated} products updated.")
    print()

    # Post-commit verification
    cur.execute("""
        SELECT id, sku, collection FROM products
        WHERE id = ANY(%s)
    """, ([int(u['id']) for u in updates],))
    post_rows = {str(r['id']): r for r in cur.fetchall()}

    all_pass = True
    fail_count = 0
    for u in updates:
        r = post_rows.get(u['id'])
        ok = r and r['collection'] == u['final_collection']
        if not ok:
            all_pass = False
            fail_count += 1
            print(f"  [FAIL] id={u['id']} sku={u['sku']} expected={u['final_collection']!r} got={r['collection'] if r else None!r}")

    print()
    print("OVERALL:", "ALL PASS" if all_pass else f"{fail_count} FAILURES DETECTED -- review above")

cur.close()
conn.close()
