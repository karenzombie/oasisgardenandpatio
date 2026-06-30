import psycopg2
import psycopg2.extras
import csv
import os

DRY_RUN = True

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

with open('homecrest_master_update.csv', newline='') as f:
    updates = list(csv.DictReader(f))

print(f"Loaded {len(updates)} proposed updates from homecrest_master_update.csv")
print(f"DRY_RUN = {DRY_RUN}")
print()

# Pre-flight: confirm every id in the CSV actually exists in the DB and belongs
# to Homecrest, and that the current name in the DB matches what we audited.
cur.execute("""
    SELECT p.id, p.sku, p.name, p.slug
    FROM products p
    JOIN manufacturers m ON m.id = p.manufacturer_id
    WHERE m.slug = 'homecrest'
""")
db_rows = {str(r['id']): r for r in cur.fetchall()}

mismatches = []
missing = []
for u in updates:
    db_row = db_rows.get(u['id'])
    if not db_row:
        missing.append(u['id'])
        continue
    if db_row['name'] != u['current_name']:
        mismatches.append((u['id'], u['sku'], db_row['name'], u['current_name']))

if missing:
    print(f"ABORTING: {len(missing)} ids from the CSV were not found in the live DB:")
    print(missing[:20])
    cur.close()
    conn.close()
    raise SystemExit(1)

if mismatches:
    print(f"ABORTING: {len(mismatches)} rows have a current name in the DB that doesn't match what we audited.")
    print("This means the data has changed since the audit was pulled. Re-export and re-check before proceeding.")
    for m in mismatches[:20]:
        print(f"  id={m[0]} sku={m[1]} db_name={m[2]!r} audited_name={m[3]!r}")
    cur.close()
    conn.close()
    raise SystemExit(1)

print("Pre-flight check passed: all ids found, all current names match the audit.")
print()

# Also confirm none of the new slugs already exist on a DIFFERENT product
# (id not in our update set) to avoid a unique constraint violation.
new_slugs = {u['final_slug'] for u in updates}
cur.execute("SELECT id, slug FROM products WHERE slug = ANY(%s)", (list(new_slugs),))
existing_slug_rows = cur.fetchall()
update_ids = {u['id'] for u in updates}
slug_conflicts = [r for r in existing_slug_rows if str(r['id']) not in update_ids]

if slug_conflicts:
    print(f"ABORTING: {len(slug_conflicts)} proposed slugs collide with a DIFFERENT existing product not in this update set.")
    for c in slug_conflicts[:20]:
        print(f"  conflicting product id={c['id']} slug={c['slug']}")
    cur.close()
    conn.close()
    raise SystemExit(1)

print("Slug collision check passed: no conflicts with products outside this update set.")
print()

if DRY_RUN:
    print("=== DRY RUN: showing all 514 proposed changes, no writes will be made ===")
    for u in updates:
        print(f"id={u['id']} sku={u['sku']}")
        print(f"  name: {u['current_name']!r} -> {u['final_name']!r}")
        print(f"  slug: -> {u['final_slug']!r}")
    print()
    print(f"DRY RUN COMPLETE. {len(updates)} products would be updated. Nothing written.")
else:
    updated = 0
    for u in updates:
        cur.execute(
            "UPDATE products SET name = %s, slug = %s WHERE id = %s",
            (u['final_name'], u['final_slug'], u['id'])
        )
        updated += 1
    conn.commit()
    print(f"COMMITTED. {updated} products updated.")
    print()

    # Post-commit verification: re-read every row and confirm name/slug match exactly.
    cur.execute("""
        SELECT id, sku, name, slug FROM products
        WHERE id = ANY(%s)
    """, ([int(u['id']) for u in updates],))
    post_rows = {str(r['id']): r for r in cur.fetchall()}

    all_pass = True
    fail_count = 0
    for u in updates:
        r = post_rows.get(u['id'])
        ok = r and r['name'] == u['final_name'] and r['slug'] == u['final_slug']
        if not ok:
            all_pass = False
            fail_count += 1
            print(f"  [FAIL] id={u['id']} sku={u['sku']} expected_name={u['final_name']!r} got={r['name'] if r else None!r}")

    print()
    print("OVERALL:", "ALL PASS" if all_pass else f"{fail_count} FAILURES DETECTED -- review above")

cur.close()
conn.close()
