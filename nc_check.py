import os, psycopg2

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

cur.execute("""
    SELECT products.sku, products.name, products.collection
    FROM products
    JOIN manufacturers m ON products.manufacturer_id = m.id
    WHERE m.id = 17
    ORDER BY products.sku
""")
rows = cur.fetchall()
print(f'Total NorthCape products: {len(rows)}')
print()
for sku, name, coll in rows:
    print(f'{sku} | {name} | {coll}')

conn.close()
