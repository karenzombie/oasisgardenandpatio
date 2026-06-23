import os, csv, json
import psycopg2

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

cur.execute("""
    SELECT
        products.id,
        products.sku,
        products.name,
        products.slug,
        products.collection,
        products.category_id,
        c.name AS category,
        products.dimensions,
        products.specs,
        products.description,
        products.short_description,
        products.tags,
        products.pricing_mode,
        products.price,
        products.quote_only,
        products.available_online,
        products.in_store_only,
        products.is_active,
        products.finish_options,
        products.finish_pools,
        products.fabric_options,
        products.fabric_pools,
        products.variants,
        COALESCE(
            string_agg(mat.name, ', ' ORDER BY mat.name),
            ''
        ) AS materials,
        products.created_at,
        products.updated_at
    FROM products
    JOIN manufacturers m ON products.manufacturer_id = m.id
    LEFT JOIN categories c ON products.category_id = c.id
    LEFT JOIN product_materials pm ON products.id = pm.product_id
    LEFT JOIN materials mat ON pm.material_id = mat.id
    WHERE m.id = 17
    GROUP BY
        products.id, c.name
    ORDER BY products.collection, products.name
""")

rows = cur.fetchall()
headers = [
    'product_id','sku','name','slug','collection','category_id','category',
    'dimensions','specs','description','short_description','tags',
    'pricing_mode','price','quote_only','available_online','in_store_only','is_active',
    'finish_options','finish_pools','fabric_options','fabric_pools','variants',
    'materials','created_at','updated_at'
]

output_path = 'northcape_export.csv'
with open(output_path, 'w', newline='', encoding='utf-8') as f:
    writer = csv.writer(f)
    writer.writerow(headers)
    writer.writerows(rows)

print(f"Exported {len(rows)} NorthCape products to {output_path}")
conn.close()
