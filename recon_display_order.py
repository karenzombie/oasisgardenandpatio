#!/usr/bin/env python3
"""
recon_display_order.py

READ-ONLY. Writes nothing to the database.

Purpose:
  1. Dump the real column list for `products` so we can see every ordering-related field
     that already exists.
  2. Dump `categories` and `manufacturers` in full.
  3. Pull every product in Umbrellas / Umbrella Bases / Replacement Parts with its
     category, sub_category, manufacturer and display_order.
  4. Show how `display_order` is actually populated across the WHOLE catalog.

Outputs:
  - Console summary
  - display_order_recon_umbrellas.csv   (the umbrella / base / parts pull)
  - display_order_recon_catalog.csv     (display_order distribution, whole catalog)

Nothing here modifies data. Session is opened read-only.
"""

import os
import csv
import sys
from collections import Counter, defaultdict

import psycopg2
import psycopg2.extras

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    sys.exit("DATABASE_URL is not set. Aborting.")

TARGET_CATEGORY_IDS = [38, 39, 41]  # Umbrellas, Umbrella Bases, Replacement Parts

OUT_UMBRELLAS = "display_order_recon_umbrellas.csv"
OUT_CATALOG = "display_order_recon_catalog.csv"


def rule(title):
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)


def main():
    conn = psycopg2.connect(DB_URL)
    conn.set_session(readonly=True)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    print("*** READ-ONLY SESSION. THIS SCRIPT WRITES NOTHING. ***")

    # ------------------------------------------------------------------
    # 1. products columns
    # ------------------------------------------------------------------
    rule("1. FULL COLUMN LIST: products")
    cur.execute("""
        SELECT column_name, data_type, is_nullable, column_default
        FROM information_schema.columns
        WHERE table_name = 'products'
        ORDER BY ordinal_position;
    """)
    product_cols = cur.fetchall()
    for c in product_cols:
        print("  {:<28} {:<20} null={:<4} default={}".format(
            c["column_name"], c["data_type"], c["is_nullable"],
            c["column_default"] if c["column_default"] is not None else "-"
        ))
    colnames = [c["column_name"] for c in product_cols]
    print("\n  Total columns: {}".format(len(colnames)))

    # Anything that smells like ordering / ranking
    rule("1b. ORDERING-RELATED COLUMNS FOUND ON products")
    hits = [c for c in colnames
            if any(k in c.lower() for k in
                   ("order", "rank", "sort", "position", "priority", "weight", "featured"))]
    if hits:
        for h in hits:
            print("  -> {}".format(h))
    else:
        print("  (none found)")

    # Detect the manufacturer FK column rather than assuming it
    mfg_fk = next((c for c in colnames if "manufacturer" in c.lower()), None)
    print("\n  Detected manufacturer FK column on products: {}".format(mfg_fk or "NOT FOUND"))

    has_display_order = "display_order" in colnames
    print("  products.display_order exists: {}".format(has_display_order))

    # ------------------------------------------------------------------
    # 2. categories + manufacturers, in full
    # ------------------------------------------------------------------
    rule("2. categories (full table)")
    cur.execute("SELECT * FROM categories ORDER BY id;")
    categories = cur.fetchall()
    cat_name = {}
    for row in categories:
        label = row.get("name") or row.get("title") or "?"
        cat_name[row["id"]] = label
        extras = {k: v for k, v in row.items() if k not in ("id", "name")}
        print("  id={:<4} {:<28} {}".format(row["id"], str(label), extras))

    rule("2b. manufacturers (full table)")
    cur.execute("SELECT * FROM manufacturers ORDER BY id;")
    manufacturers = cur.fetchall()
    mfg_name = {}
    for row in manufacturers:
        label = row.get("name") or "?"
        mfg_name[row["id"]] = label
        print("  id={:<4} {}".format(row["id"], label))

    # ------------------------------------------------------------------
    # 3. Umbrellas / Umbrella Bases / Replacement Parts pull
    #    SELECT * so we cannot crash on a column name.
    # ------------------------------------------------------------------
    rule("3. PRODUCTS IN CATEGORIES {} ".format(TARGET_CATEGORY_IDS))
    cur.execute(
        "SELECT * FROM products WHERE category_id = ANY(%s) ORDER BY category_id, id;",
        (TARGET_CATEGORY_IDS,)
    )
    rows = cur.fetchall()
    print("  Rows returned: {}".format(len(rows)))

    # category_id / sub_category / manufacturer breakdown
    combo = Counter()
    for r in rows:
        m = mfg_name.get(r.get(mfg_fk)) if mfg_fk else "?"
        combo[(r.get("category_id"), r.get("sub_category"), m)] += 1

    print("\n  category / sub_category / manufacturer  ->  count")
    print("  " + "-" * 72)
    for (cid, sub, m), n in sorted(
        combo.items(), key=lambda kv: (kv[0][0], str(kv[0][1]), str(kv[0][2]))
    ):
        print("  {:<4} {:<20} {:<24} {:<22} {:>4}".format(
            cid, str(cat_name.get(cid, "?"))[:20], str(sub)[:24], str(m)[:22], n
        ))

    # sub_category rollup per category, ignoring manufacturer
    rule("3b. SUB_CATEGORY ROLLUP (per category)")
    per_cat = defaultdict(Counter)
    for r in rows:
        per_cat[r.get("category_id")][r.get("sub_category")] += 1
    for cid in sorted(per_cat, key=lambda x: (x is None, x)):
        print("\n  Category {} ({}):".format(cid, cat_name.get(cid, "?")))
        for sub, n in sorted(per_cat[cid].items(), key=lambda kv: (kv[0] is None, str(kv[0]))):
            print("     {:<32} {:>4}".format(str(sub), n))

    # display_order inside these categories
    if has_display_order:
        rule("3c. display_order VALUES INSIDE THESE CATEGORIES")
        for cid in sorted(per_cat, key=lambda x: (x is None, x)):
            vals = Counter(
                r.get("display_order") for r in rows if r.get("category_id") == cid
            )
            print("\n  Category {} ({}):".format(cid, cat_name.get(cid, "?")))
            for v, n in sorted(vals.items(), key=lambda kv: (kv[0] is None, kv[0])):
                print("     display_order={:<8} {:>4} products".format(str(v), n))

    # write the umbrella CSV
    csv_fields = [c for c in [
        "id", "sku", "name", "collection", "category_id", "sub_category",
        mfg_fk, "display_order", "featured", "is_active", "catalog_visible",
        "available_online", "quote_only", "price", "msrp",
    ] if c and c in colnames]

    with open(OUT_UMBRELLAS, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(csv_fields + ["category_name", "manufacturer_name"])
        for r in rows:
            w.writerow(
                [r.get(c) for c in csv_fields]
                + [cat_name.get(r.get("category_id")),
                   mfg_name.get(r.get(mfg_fk)) if mfg_fk else None]
            )
    print("\n  Wrote {} ({} rows)".format(OUT_UMBRELLAS, len(rows)))

    # ------------------------------------------------------------------
    # 4. display_order across the WHOLE catalog
    # ------------------------------------------------------------------
    if has_display_order:
        rule("4. display_order ACROSS THE ENTIRE CATALOG")

        cur.execute("""
            SELECT
                COUNT(*)                                              AS total,
                COUNT(*) FILTER (WHERE display_order IS NULL)         AS is_null,
                COUNT(*) FILTER (WHERE display_order = 0)             AS is_zero,
                COUNT(*) FILTER (WHERE display_order IS NOT NULL
                                   AND display_order <> 0)            AS is_set,
                MIN(display_order)                                    AS min_val,
                MAX(display_order)                                    AS max_val,
                COUNT(DISTINCT display_order)                         AS distinct_vals
            FROM products;
        """)
        s = cur.fetchone()
        print("  total products      : {}".format(s["total"]))
        print("  display_order NULL  : {}".format(s["is_null"]))
        print("  display_order = 0   : {}".format(s["is_zero"]))
        print("  display_order set   : {}   <-- the interesting number".format(s["is_set"]))
        print("  min / max           : {} / {}".format(s["min_val"], s["max_val"]))
        print("  distinct values     : {}".format(s["distinct_vals"]))

        rule("4b. WHERE ARE THE NON-ZERO display_order VALUES?  (by category)")
        cur.execute("""
            SELECT category_id,
                   COUNT(*) AS n,
                   MIN(display_order) AS lo,
                   MAX(display_order) AS hi
            FROM products
            WHERE display_order IS NOT NULL AND display_order <> 0
            GROUP BY category_id
            ORDER BY n DESC;
        """)
        for r in cur.fetchall():
            print("  cat {:<5} {:<26} {:>5} products   range {} .. {}".format(
                str(r["category_id"]), str(cat_name.get(r["category_id"], "?"))[:26],
                r["n"], r["lo"], r["hi"]
            ))

        if mfg_fk:
            rule("4c. WHERE ARE THE NON-ZERO display_order VALUES?  (by manufacturer)")
            cur.execute("""
                SELECT {fk} AS mfg,
                       COUNT(*) AS n,
                       MIN(display_order) AS lo,
                       MAX(display_order) AS hi
                FROM products
                WHERE display_order IS NOT NULL AND display_order <> 0
                GROUP BY {fk}
                ORDER BY n DESC;
            """.format(fk=mfg_fk))
            for r in cur.fetchall():
                print("  mfg {:<5} {:<26} {:>5} products   range {} .. {}".format(
                    str(r["mfg"]), str(mfg_name.get(r["mfg"], "?"))[:26],
                    r["n"], r["lo"], r["hi"]
                ))

        rule("4d. THE 40 MOST COMMON display_order VALUES")
        cur.execute("""
            SELECT display_order, COUNT(*) AS n
            FROM products
            GROUP BY display_order
            ORDER BY n DESC
            LIMIT 40;
        """)
        for r in cur.fetchall():
            print("  display_order={:<10} {:>5} products".format(
                str(r["display_order"]), r["n"]))

        # full-catalog CSV of anything with a non-default display_order
        cur.execute("""
            SELECT id, sku, name, category_id, sub_category, display_order
            FROM products
            WHERE display_order IS NOT NULL AND display_order <> 0
            ORDER BY category_id, display_order, id;
        """)
        set_rows = cur.fetchall()
        with open(OUT_CATALOG, "w", newline="", encoding="utf-8") as f:
            w = csv.writer(f)
            w.writerow(["id", "sku", "name", "category_id", "category_name",
                        "sub_category", "display_order"])
            for r in set_rows:
                w.writerow([r["id"], r["sku"], r["name"], r["category_id"],
                            cat_name.get(r["category_id"]), r["sub_category"],
                            r["display_order"]])
        print("\n  Wrote {} ({} rows with a non-zero display_order)".format(
            OUT_CATALOG, len(set_rows)))
    else:
        rule("4. products.display_order DOES NOT EXIST")
        print("  Skipping all display_order analysis.")

    cur.close()
    conn.close()

    rule("DONE. Read-only. Nothing was written.")
    print("  Download these two files and send them over:")
    print("    {}".format(OUT_UMBRELLAS))
    print("    {}".format(OUT_CATALOG))


if __name__ == "__main__":
    main()
