#!/usr/bin/env python3
"""Quick check -- prints Hanamint manufacturer ID and relevant category IDs"""
import os
import psycopg2

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

cur.execute("SELECT id, name, slug FROM manufacturers WHERE slug = 'hanamint'")
print("HANAMINT:", cur.fetchone())

cur.execute("""
    SELECT id, name, slug FROM categories
    WHERE slug IN (
        'cat-dining','cat-deep-seating','cat-chaise-lounges',
        'cat-bar-counter','cat-accent-tables','cat-fire-pits','cat-umbrella-bases'
    )
    ORDER BY slug
""")
print("\nCATEGORIES:")
for row in cur.fetchall():
    print(f"  {row}")

cur.close()
conn.close()
