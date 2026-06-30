import psycopg2
import psycopg2.extras
import csv
import os

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

cur.execute("""
    SELECT
        p.id,
        p.sku,
        p.name,
        p.slug,
        p.collection,
        p.short_description
    FROM products p
    JOIN manufacturers m ON m.id = p.manufacturer_id
    WHERE m.slug = 'homecrest'
    ORDER BY p.id
""")
rows = cur.fetchall()
print(f"Total Homecrest products: {len(rows)}")

with open('homecrest_postcommit_check.csv', 'w', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=['id', 'sku', 'name', 'slug', 'collection', 'short_description'])
    writer.writeheader()
    writer.writerows(rows)

print("Written to homecrest_postcommit_check.csv")
cur.close()
conn.close()
