#!/usr/bin/env python3
"""
check_dakota_pdp_payload.py — READ ONLY

Confirms what the PDP would receive for Dakota Porcelain Tops (id 5492):
  - variant rows (should be 18, optionLabel 'Size', isActive true)
  - discrete finishes wired (the frame-finish picker source)
  - the product's slug and flags

No writes. Dev DATABASE_URL.
"""
import os, sys, psycopg2, psycopg2.extras

DB=os.environ.get("DATABASE_URL")
if not DB: print("no DATABASE_URL"); sys.exit(1)
c=psycopg2.connect(DB); c.set_session(readonly=True, autocommit=True)
cur=c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print("="*60)
print("DAKOTA TOPS (id 5492) PDP payload check | READ ONLY")
print("="*60)

cur.execute("select id, sku, slug, quote_only, available_online, is_active, manufacturer_id from products where id=5492")
p=cur.fetchone()
print("\nproduct:", dict(p) if p else "NOT FOUND")

cur.execute("""select id, variant_sku, variant_name, option_label, is_active
               from product_variants where product_id=5492
               order by display_order, id""")
vs=cur.fetchall()
print(f"\nvariants: {len(vs)} (active: {sum(1 for v in vs if v['is_active'])})")
labels=set(v['option_label'] for v in vs)
print("distinct option_labels:", labels)
for v in vs[:4]:
    print("  ", v['variant_sku'], "|", v['variant_name'], "|", v['option_label'], "| active", v['is_active'])

# discrete finish options wired to this product
cur.execute("""select count(*) as n from product_finish_options where product_id=5492""")
print("\nproduct_finish_options rows:", cur.fetchone()['n'])
cur.execute("""select count(*) as n from product_finish_pools where product_id=5492""")
print("product_finish_pools rows:", cur.fetchone()['n'])

print("\n(If variants=18/Size/active but the PDP shows no size picker, the bug")
print(" is in the render condition, not the data.)")
cur.close(); c.close()
