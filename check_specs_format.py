import psycopg2
import psycopg2.extras
import os

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("""
    SELECT id, sku, name, specs
    FROM products
    WHERE specs IS NOT NULL
    LIMIT 5
""")

rows = cur.fetchall()
print(f"Found {len(rows)} products with specs populated\n")
for row in rows:
    print(f"[{row['id']}] {row['sku']} | {row['name']}")
    print(f"  specs: {repr(row['specs'])}")
    print()

cur.close()
conn.close()
