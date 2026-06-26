import os, psycopg2

# Read-only: what sub_categories are already in use on UMBRELLA products,
# across every manufacturer? Helps us reuse existing vocabulary for Frankford
# instead of inventing a parallel set.

conn = psycopg2.connect(os.environ['DATABASE_URL'], connect_timeout=10)
cur = conn.cursor()

# resolve the category_id(s) named like 'Umbrella' (umbrellas, not bases/parts)
cur.execute("SELECT id, name FROM categories WHERE name ILIKE %s", ('%umbrella%',))
cats = cur.fetchall()
print("Umbrella-ish categories:", [(cid, n) for cid, n in cats])
umbrella_cat_ids = [cid for cid, n in cats if n.strip().lower() == 'umbrellas'] or [cid for cid, _ in cats]

# distinct sub_category values on umbrella products, with counts + a manufacturer sample
cur.execute(
    """
    SELECT COALESCE(p.sub_category,'(none)') AS sub_cat,
           count(*) AS n,
           string_agg(DISTINCT m.name, ', ') AS manufacturers
    FROM products p
    JOIN manufacturers m ON m.id = p.manufacturer_id
    WHERE p.category_id = ANY(%s)
    GROUP BY COALESCE(p.sub_category,'(none)')
    ORDER BY n DESC
    """,
    (umbrella_cat_ids,),
)
rows = cur.fetchall()

print("\nExisting sub_categories on umbrella products (all manufacturers):")
print(f"{'sub_category':<22} {'count':>5}   manufacturers")
print("-"*70)
for sub_cat, n, mfrs in rows:
    print(f"{sub_cat:<22} {n:>5}   {mfrs}")

cur.close()
conn.close()
