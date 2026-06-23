import os
import psycopg2
import csv
csv.field_size_limit(10_000_000)

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

DRY_RUN = True  # flip to False to commit

# Category ID lookup
cur.execute("SELECT id, name FROM categories")
CAT = {name: cid for cid, name in cur.fetchall()}

changes = []
def log(msg):
    changes.append(msg)
    print(msg)

log(f"Categories available: {CAT}")

# Read the CSV file
with open('owlee_export_final.csv', newline='', encoding='utf-8') as f:
    reader = csv.DictReader(f)
    rows = [{k: (v if v is not None else '') for k, v in row.items()} for row in reader]

log(f"\nLoaded {len(rows)} rows from Numbers file")

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1: Update sub_category, sub_material, and category_id on all products
# ─────────────────────────────────────────────────────────────────────────────
log("\n=== SECTION 1: UPDATE sub_category, sub_material, category ===")

# Classico table bases that need category moved from Dining to Tables
dining_to_tables = {'9-ST01', '9-DT03', '9-OT05', '9-DT07'}

for r in rows:
    pid = int(float(str(r['product_id'])))
    sku = str(r['sku']).strip()
    cat_name = str(r['category']).strip()
    sub_cat = str(r['sub-category']).strip()
    sub_mat = str(r['sub-materials']).strip()

    # Fix Classico table bases -- force to Tables category
    if sku in dining_to_tables:
        cat_name = 'Tables'

    cat_id = CAT.get(cat_name)
    if not cat_id:
        log(f"  WARNING: unknown category '{cat_name}' for sku={sku}")
        continue

    # Fetch current values to show what's changing
    cur.execute("SELECT name, category_id FROM products WHERE id = %s", (pid,))
    row = cur.fetchone()
    if not row:
        log(f"  SKIP (not found): id={pid} sku={sku}")
        continue

    curr_name, curr_cat_id = row
    log(f"  UPDATE id={pid} sku={sku}: category_id={cat_id}({cat_name}) sub_category='{sub_cat}' sub_material='{sub_mat}'")

    if not DRY_RUN:
        cur.execute("""
            UPDATE products SET
                category_id = %s,
                sub_category = %s,
                sub_material = %s,
                updated_at = NOW()
            WHERE id = %s
        """, (cat_id, sub_cat or None, sub_mat or None, pid))

# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
log(f"\n=== SUMMARY ===")
log(f"DRY_RUN = {DRY_RUN}")
log(f"Total changes logged: {len(changes)}")

if DRY_RUN:
    conn.rollback()
    log("ROLLED BACK (dry run)")
else:
    conn.commit()
    log("COMMITTED")

cur.close()
conn.close()
