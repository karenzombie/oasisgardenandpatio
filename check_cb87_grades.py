import psycopg2
import psycopg2.extras
import os

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# Check the products exist and have variants
cur.execute("""
    SELECT p.id, p.sku, p.name, COUNT(pv.id) as variant_count
    FROM products p
    LEFT JOIN product_variants pv ON pv.product_id = p.id
    WHERE p.manufacturer_id = 28
      AND p.sku IN ('CB87', 'FC101', 'FC101-NF')
    GROUP BY p.id, p.sku, p.name
    ORDER BY p.sku;
""")

rows = cur.fetchall()
print("Products and variant counts:")
for row in rows:
    print(dict(row))

cur.close()
conn.close()
