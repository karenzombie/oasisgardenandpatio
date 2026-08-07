#!/usr/bin/env python3
"""
price_fields_audit.py   (READ-ONLY)

Grounds the sell/sale mirror + variant price-field work in real data before any
schema, code, or migration change. Reports, across ALL manufacturers:

PRODUCTS (columns: price[sell], sale_price[sale], msrp, cost, frame_only_price)
  1. Coverage: how many products have each field set vs null (overall + per mfr)
  2. Sell-vs-sale relationship (the mirror scope), overall + per mfr:
       price only (sale null)      -> would need sale mirrored from price
       sale only  (price null)
       real sale  (sale < price)   -> mirroring changes their displayed discount
       mirrored   (price = sale)   -> already aligned
       sale > price                -> anomaly to investigate
       both null                   -> no product-level price (grade/variant priced)
  3. frame_only_price usage (legacy column to retire)

VARIANTS (columns today: msrp, sale_price, price_adjustment -- NO sell, NO cost)
  4. Coverage of the fields that exist
  5. Pricing type of each variant, which decides where cost comes from:
       grade-priced (has variant_grade_prices rows) -> cost is per-grade already
       absolute     (msrp set, no grade rows)        -> the real gap: no cost source
       legacy       (msrp null, no grade rows)        -> base price + adjustment

Focus manufacturers for checkout (Frankford, Treasure Garden, Galtech) are
called out explicitly since their display/checkout behavior is affected.

Safety: read-only connection, DEV (DATABASE_URL), one CSV written for review.
Run:  python3 price_fields_audit.py
"""
import os, sys, csv
import psycopg2, psycopg2.extras

CHECKOUT_MFR = {28: "Frankford", 12: "Treasure Garden", 29: "Galtech"}
OUT_CSV = "price_fields_by_manufacturer.csv"


def main():
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        print("ERROR: DATABASE_URL not set (expected dev)."); sys.exit(1)
    conn = psycopg2.connect(dsn)
    conn.set_session(readonly=True, autocommit=True)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # manufacturer name column (verify, don't guess)
    cur.execute("SELECT column_name FROM information_schema.columns "
                "WHERE table_name='manufacturers'")
    mcols = {r["column_name"] for r in cur.fetchall()}
    name_col = "name" if "name" in mcols else ("slug" if "slug" in mcols else None)
    mnames = {}
    if name_col:
        cur.execute(f"SELECT id, {name_col} AS nm FROM manufacturers")
        mnames = {r["id"]: r["nm"] for r in cur.fetchall()}

    def mlabel(mid):
        return mnames.get(mid) or CHECKOUT_MFR.get(mid) or f"mfr {mid}"

    # ---- PRODUCTS: coverage + sell/sale relationship, per manufacturer ----
    cur.execute(
        """
        SELECT manufacturer_id AS mid,
          COUNT(*)                                       AS total,
          COUNT(price)                                   AS price_set,
          COUNT(sale_price)                              AS sale_set,
          COUNT(msrp)                                    AS msrp_set,
          COUNT(cost)                                    AS cost_set,
          COUNT(frame_only_price)                        AS frame_only_set,
          COUNT(*) FILTER (WHERE price IS NOT NULL AND sale_price IS NULL)          AS price_only,
          COUNT(*) FILTER (WHERE price IS NULL AND sale_price IS NOT NULL)          AS sale_only,
          COUNT(*) FILTER (WHERE price IS NOT NULL AND sale_price IS NOT NULL
                                 AND sale_price < price)                            AS real_sale,
          COUNT(*) FILTER (WHERE price IS NOT NULL AND sale_price IS NOT NULL
                                 AND price = sale_price)                            AS mirrored,
          COUNT(*) FILTER (WHERE price IS NOT NULL AND sale_price IS NOT NULL
                                 AND sale_price > price)                            AS sale_gt_price,
          COUNT(*) FILTER (WHERE price IS NULL AND sale_price IS NULL)              AS both_null
        FROM products
        GROUP BY manufacturer_id
        ORDER BY manufacturer_id
        """)
    prod_rows = cur.fetchall()

    def tot(key):
        return sum(r[key] for r in prod_rows)

    print("== PRICE FIELDS AUDIT (READ-ONLY, dev) ==\n")
    print("PRODUCTS -- overall coverage:")
    print(f"  total products:        {tot('total')}")
    print(f"  price (sell) set:      {tot('price_set')}")
    print(f"  sale_price set:        {tot('sale_set')}")
    print(f"  msrp set:              {tot('msrp_set')}")
    print(f"  cost set:              {tot('cost_set')}")
    print(f"  frame_only_price set:  {tot('frame_only_set')}  (legacy, to retire)")

    print("\nPRODUCTS -- sell vs sale relationship (overall):")
    print(f"  price only (sale null):     {tot('price_only')}   <- sale would be mirrored from price")
    print(f"  sale only  (price null):    {tot('sale_only')}")
    print(f"  real sale  (sale < price):  {tot('real_sale')}   <- mirroring changes their discount display")
    print(f"  mirrored   (price = sale):  {tot('mirrored')}")
    print(f"  sale > price (anomaly):     {tot('sale_gt_price')}")
    print(f"  both null:                  {tot('both_null')}   <- grade/variant priced or unpriced")

    print("\nPRODUCTS -- the three checkout manufacturers:")
    print(f"  {'mfr':<18}{'total':>6}{'price':>7}{'sale':>6}{'msrp':>6}{'cost':>6}"
          f"{'p_only':>7}{'realSale':>9}{'mirror':>7}")
    for r in prod_rows:
        if r["mid"] in CHECKOUT_MFR:
            print(f"  {mlabel(r['mid']):<18}{r['total']:>6}{r['price_set']:>7}{r['sale_set']:>6}"
                  f"{r['msrp_set']:>6}{r['cost_set']:>6}{r['price_only']:>7}"
                  f"{r['real_sale']:>9}{r['mirrored']:>7}")

    # ---- VARIANTS: existing coverage ----
    cur.execute(
        """
        SELECT COUNT(*) AS total,
          COUNT(msrp)        AS msrp_set,
          COUNT(sale_price)  AS sale_set,
          COUNT(*) FILTER (WHERE price_adjustment IS NOT NULL
                                 AND price_adjustment <> 0) AS adj_nonzero
        FROM product_variants
        """)
    v = cur.fetchone()
    print("\nVARIANTS -- existing field coverage (no sell/cost columns exist yet):")
    print(f"  total variants:            {v['total']}")
    print(f"  msrp set:                  {v['msrp_set']}")
    print(f"  sale_price set:            {v['sale_set']}")
    print(f"  price_adjustment nonzero:  {v['adj_nonzero']}")

    # ---- VARIANTS: pricing type (decides where cost comes from) ----
    cur.execute(
        """
        SELECT
          COUNT(*) FILTER (WHERE gp.n > 0)                          AS grade_priced,
          COUNT(*) FILTER (WHERE gp.n = 0 AND pv.msrp IS NOT NULL)  AS absolute,
          COUNT(*) FILTER (WHERE gp.n = 0 AND pv.msrp IS NULL)      AS legacy
        FROM product_variants pv
        LEFT JOIN (
          SELECT variant_id, COUNT(*) AS n
          FROM variant_grade_prices GROUP BY variant_id
        ) gp ON gp.variant_id = pv.id
        """)
    vt = cur.fetchone()
    print("\nVARIANTS -- pricing type (where each variant's cost would come from):")
    print(f"  grade-priced (has grade rows):   {vt['grade_priced']}   cost already per-grade")
    print(f"  absolute (own msrp, no grades):  {vt['absolute']}   <- real gap: no cost source today")
    print(f"  legacy (base price + adjustment):{vt['legacy']}   inherits from product")

    # ---- CSV: full per-manufacturer product breakdown ----
    fields = ["manufacturer_id", "manufacturer", "total", "price_set", "sale_set",
              "msrp_set", "cost_set", "frame_only_set", "price_only", "sale_only",
              "real_sale", "mirrored", "sale_gt_price", "both_null"]
    with open(OUT_CSV, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        for r in prod_rows:
            row = {k: r.get(k) for k in fields if k in r}
            row["manufacturer_id"] = r["mid"]
            row["manufacturer"] = mlabel(r["mid"])
            row["frame_only_set"] = r["frame_only_set"]
            w.writerow({k: row.get(k, r.get(k)) for k in fields})
    print(f"\nWrote per-manufacturer breakdown: {OUT_CSV}")

    cur.close(); conn.close()


if __name__ == "__main__":
    main()
