import psycopg2
import psycopg2.extras
import os

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("""
    SELECT p.id, p.sku, p.name, COUNT(pv.id) as variant_count
    FROM products p
    LEFT JOIN product_variants pv ON pv.product_id = p.id
    WHERE p.manufacturer_id = 28
      AND p.sku IN ('24G','30G','36G','40G','20G-SQ','24G-SQ','36G-SQ')
    GROUP BY p.id, p.sku, p.name
    ORDER BY p.sku;
""")

rows = cur.fetchall()
for row in rows:
    print(dict(row))

cur.close()
conn.close()
