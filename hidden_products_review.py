"""
Oasis -- READ ONLY: full hidden-product review list, platform-wide.

Writes NOTHING to the database. Writes ONE file: hidden_products_review.csv

Every product with available_online = FALSE, all manufacturers. For each row, the signals
needed to classify it:

  - manufacturer, collection, category, sku, name, flags
  - price / msrp / sale_price (a real price suggests a sellable product)
  - is it referenced as a cushion_upgrade_sku (known component)
  - does it have images (components often don't need them; sellables do)
  - a SUGGESTED bucket, which is a starting point for Karen's review, NOT a decision:
      COMPONENT   known component (cushion refs, Frankford *-TC top covers)
      REVIEW      everything else -- Karen decides visible vs hidden

The suggestion column deliberately does not try to be clever beyond the two known-for-sure
component groups. Name-pattern guessing is how products got mis-hidden in the first place.

Run:  python3 hidden_products_review.py
"""
import os
import csv
import psycopg2
import psycopg2.extras

conn = psycopg2.connect(os.environ["DATABASE_URL"])
conn.set_session(readonly=True)
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print("READ ONLY. Nothing will be written to the database.\n")

# known components
cur.execute("""
    SELECT DISTINCT cushion_upgrade_sku AS sku FROM products
    WHERE cushion_upgrade_sku IS NOT NULL AND cushion_upgrade_sku <> ''
""")
cushion_refs = {r["sku"] for r in cur.fetchall()}

cur.execute("""
    SELECT COALESCE(m.name,'(none)') AS mfg, COALESCE(c.name,'') AS category,
           p.id, p.sku, p.name, COALESCE(p.collection,'') AS collection,
           p.available_online, p.show_price_online, p.quote_only, p.is_active,
           p.price, p.msrp, p.sale_price,
           (SELECT COUNT(*) FROM product_images i WHERE i.product_id=p.id) AS images
    FROM products p
    LEFT JOIN manufacturers m ON m.id=p.manufacturer_id
    LEFT JOIN categories c ON c.id=p.category_id
    WHERE p.available_online IS FALSE
    ORDER BY m.name, p.collection, p.sku
""")
rows = cur.fetchall()
print(f"hidden products platform-wide: {len(rows)}\n")

def suggest(r):
    if r["sku"] in cushion_refs:
        return "COMPONENT"
    if r["mfg"].startswith("Frankford") and r["sku"].endswith("-TC"):
        return "COMPONENT"
    return "REVIEW"

by_mfg = {}
for r in rows:
    by_mfg.setdefault(r["mfg"], []).append(r)

print(f"{'MANUFACTURER':<26} {'HIDDEN':>7} {'COMPONENT':>10} {'REVIEW':>7}")
for m in sorted(by_mfg):
    rs = by_mfg[m]
    n_comp = sum(1 for r in rs if suggest(r) == "COMPONENT")
    print(f"{m:<26} {len(rs):>7} {n_comp:>10} {len(rs)-n_comp:>7}")

out = "hidden_products_review.csv"
with open(out, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["suggested_bucket", "decision", "manufacturer", "collection", "category",
                "sku", "name", "msrp", "sale_price", "images",
                "quote_only", "show_price_online", "id"])
    for r in rows:
        w.writerow([suggest(r), "", r["mfg"], r["collection"], r["category"],
                    r["sku"], r["name"], r["msrp"], r["sale_price"], r["images"],
                    r["quote_only"], r["show_price_online"], r["id"]])

print(f"\nWROTE: {out}  ({len(rows)} rows)")
print("""
How to review:
  The 'decision' column is empty. For each row put one of:
    VISIBLE   -> becomes visible, call-for-price (or purchasable where vendor sells online)
    HIDDEN    -> stays hidden (components, true internal rows)
  Rows suggested COMPONENT can be left blank; blank + COMPONENT is treated as HIDDEN.
  Rows suggested REVIEW must get a decision.
Send the filled CSV back and the fix script gets built from it.
""")

conn.rollback()
cur.close()
conn.close()
print("DONE. Nothing was written to the database.")
