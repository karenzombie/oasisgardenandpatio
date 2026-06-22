#!/usr/bin/env python3
"""
O.W. Lee -- export content fields for review
"""
import os, csv
import psycopg2

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

cur.execute("SELECT id FROM manufacturers WHERE slug = 'o-w-lee'")
MFR_ID = cur.fetchone()[0]

cur.execute("""
    SELECT
        p.sku,
        p.name,
        p.collection,
        p.description,
        p.short_description,
        p.specs,
        p.tags,
        STRING_AGG(m.name, ', ' ORDER BY m.name) AS materials
    FROM products p
    LEFT JOIN product_materials pm ON pm.product_id = p.id
    LEFT JOIN materials m ON m.id = pm.material_id
    WHERE p.manufacturer_id = %s
    GROUP BY p.id, p.sku, p.name, p.collection,
             p.description, p.short_description, p.specs, p.tags
    ORDER BY p.collection, p.name
""", (MFR_ID,))

rows = cur.fetchall()
headers = ['sku','name','collection','description',
           'short_description','specs','tags','materials']

with open('owlee_content.csv', 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(headers)
    for row in rows:
        writer.writerow(row)

print(f"Exported {len(rows)} products to owlee_content.csv")
has_desc    = sum(1 for r in rows if r[3])
has_short   = sum(1 for r in rows if r[4])
has_both    = sum(1 for r in rows if r[3] and r[4])
has_material= sum(1 for r in rows if r[7])
print(f"Has description:       {has_desc}")
print(f"Has short_description: {has_short}")
print(f"Has both:              {has_both}")
print(f"Has materials:         {has_material}")

print("\nKensington products:")
cur.execute("""
    SELECT p.sku, p.name, p.collection FROM products p
    WHERE p.manufacturer_id = %s AND p.collection = 'Kensington'
    ORDER BY p.sku
""", (MFR_ID,))
for row in cur.fetchall():
    print(f"  {row[0]:20s}  {row[2]:20s}  {row[1]}")

cur.close()
conn.close()
