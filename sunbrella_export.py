import os, csv
import psycopg2

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

# See what manufacturers have fabrics and how many
cur.execute("""
    SELECT m.name, m.slug, COUNT(f.id) as fabric_count
    FROM fabrics f
    JOIN manufacturers m ON f.manufacturer_id = m.id
    GROUP BY m.name, m.slug
    ORDER BY m.name
""")
print("Fabrics by manufacturer:")
for name, slug, count in cur.fetchall():
    print(f"  {name} ({slug}): {count} fabrics")

# Also check if there are any fabrics with no manufacturer (Sunbrella might be shared)
cur.execute("SELECT COUNT(*) FROM fabrics WHERE manufacturer_id IS NULL")
print(f"\nFabrics with no manufacturer: {cur.fetchone()[0]}")

conn.close()
