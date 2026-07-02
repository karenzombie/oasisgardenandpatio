import psycopg2
from psycopg2.extras import RealDictCursor
import os, csv

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=RealDictCursor)

# Get manufacturer_id
cur.execute("SELECT id FROM manufacturers WHERE slug = 'treasure-garden'")
mfr = cur.fetchone()
print(f"Treasure Garden manufacturer_id: {mfr['id']}")
mfr_id = mfr['id']

# Products
cur.execute("""
    SELECT p.id, p.sku, p.name, p.msrp, p.sale_price, p.price, p.category_id,
           c.name as category
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.manufacturer_id = %s
    ORDER BY p.sku
""", (mfr_id,))
products = cur.fetchall()
print(f"Products: {len(products)}")

# Variants
cur.execute("""
    SELECT pv.id as variant_id, pv.product_id, p.sku as product_sku, p.name as product_name,
           pv.variant_sku, pv.variant_name, pv.msrp, pv.sale_price, pv.price
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE p.manufacturer_id = %s
    ORDER BY p.sku, pv.variant_name
""", (mfr_id,))
variants = cur.fetchall()
print(f"Variants: {len(variants)}")

# Grade prices
cur.execute("""
    SELECT vgp.id, vgp.variant_id, p.sku as product_sku, pv.variant_sku, pv.variant_name,
           vgp.grade, vgp.msrp, vgp.sale_price
    FROM variant_grade_prices vgp
    JOIN product_variants pv ON pv.id = vgp.variant_id
    JOIN products p ON p.id = pv.product_id
    WHERE p.manufacturer_id = %s
    ORDER BY p.sku, pv.variant_name, vgp.grade
""", (mfr_id,))
grades = cur.fetchall()
print(f"Grade price rows: {len(grades)}")

# Write CSVs
with open('tg_products_full.csv', 'w', newline='') as f:
    if products:
        w = csv.DictWriter(f, fieldnames=products[0].keys())
        w.writeheader(); w.writerows(products)

with open('tg_variants_full.csv', 'w', newline='') as f:
    if variants:
        w = csv.DictWriter(f, fieldnames=variants[0].keys())
        w.writeheader(); w.writerows(variants)

with open('tg_grades_full.csv', 'w', newline='') as f:
    if grades:
        w = csv.DictWriter(f, fieldnames=grades[0].keys())
        w.writeheader(); w.writerows(grades)

conn.close()
print("Done. Upload tg_products_full.csv, tg_variants_full.csv, and tg_grades_full.csv")
