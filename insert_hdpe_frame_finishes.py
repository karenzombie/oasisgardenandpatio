import psycopg2
import os

COMMIT = False

# Source finish IDs (table finish versions -- DO NOT modify these)
# id=502 Brazilian Walnut (24), id=494 Coastal Gray (23)
SOURCE_IDS = [502, 494]

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

print("=" * 60)
print(f"HDPE FRAME FINISHES INSERT -- {'COMMIT' if COMMIT else 'DRY RUN'}")
print("=" * 60)

print("\n--- SOURCE ROWS (table finish versions, will NOT be modified) ---")
cur.execute("""
    SELECT id, name, item_number, description, collection, display_order, is_active, image_url
    FROM finishes
    WHERE id = ANY(%s)
    ORDER BY id;
""", (SOURCE_IDS,))
source_rows = cur.fetchall()
for r in source_rows:
    print(f"  id={r[0]}  name={r[1]!r}  item_number={r[2]!r}  desc={r[3]!r}  collection={r[4]!r}")

print("\n--- SAFETY CHECK: do HDPE frame finish rows already exist? ---")
cur.execute("""
    SELECT id, name, description, collection
    FROM finishes
    WHERE manufacturer_id = 16
      AND description ILIKE '%frame%finish%'
      AND name IN ('Brazilian Walnut', 'Coastal Gray');
""")
existing = cur.fetchall()
if existing:
    for r in existing:
        print(f"  ALREADY EXISTS: id={r[0]} name={r[1]!r} desc={r[2]!r} collection={r[3]!r}")
else:
    print("  None found -- safe to insert.")

print("\n--- INSERTING NEW HDPE FRAME FINISH ROWS ---")
new_ids = {}
for r in source_rows:
    source_id, name, item_number, desc, collection, display_order, is_active, image_url = r

    # Skip if already exists (safety)
    cur.execute("""
        SELECT id FROM finishes
        WHERE manufacturer_id = 16
          AND name = %s
          AND description ILIKE '%%frame%%finish%%'
          AND collection = 'HDPE Frame Finishes';
    """, (name,))
    if cur.fetchone():
        print(f"  SKIP {name!r} -- already exists as HDPE frame finish")
        continue

    print(f"\n  INSERT: name={name!r}  item_number={item_number!r}")
    print(f"    description: 'Frame finish'  collection: 'HDPE Frame Finishes'")
    print(f"    image_url: {image_url!r}")

    cur.execute("""
        INSERT INTO finishes (
            manufacturer_id, name, item_number, description,
            collection, display_order, is_active, image_url,
            created_at, updated_at
        ) VALUES (
            16, %s, %s, 'Frame finish',
            'HDPE Frame Finishes', %s, true, %s,
            NOW(), NOW()
        ) RETURNING id;
    """, (name, item_number, display_order, image_url))
    new_id = cur.fetchone()[0]
    new_ids[name] = new_id
    print(f"    -> new id={new_id}")

print("\n--- VERIFICATION ---")
cur.execute("""
    SELECT id, name, item_number, description, collection, is_active
    FROM finishes
    WHERE manufacturer_id = 16
      AND collection = 'HDPE Frame Finishes'
    ORDER BY id;
""")
rows = cur.fetchall()
print(f"  HDPE Frame Finish rows: {len(rows)} (expect 2)")
for r in rows:
    print(f"  id={r[0]}  name={r[1]!r}  item_number={r[2]!r}  desc={r[3]!r}  collection={r[4]!r}  active={r[5]}")

print("\n--- ORIGINAL TABLE FINISH ROWS UNCHANGED ---")
cur.execute("""
    SELECT id, name, description, collection
    FROM finishes WHERE id = ANY(%s);
""", (SOURCE_IDS,))
for r in cur.fetchall():
    print(f"  id={r[0]}  name={r[1]!r}  desc={r[2]!r}  collection={r[3]!r}  (unchanged)")

if COMMIT:
    conn.commit()
    print("\nCOMMITTED.")
else:
    conn.rollback()
    print("\nDRY RUN COMPLETE -- nothing written.")
    print("\nTo commit, run:")
    print('  python3 -c "exec(open(\'insert_hdpe_frame_finishes.py\').read().replace(\'COMMIT = False\', \'COMMIT = True\'))"')

cur.close()
conn.close()
