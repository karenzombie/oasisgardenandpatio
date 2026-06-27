#!/usr/bin/env python3
"""
Oasis Garden & Patio - Frankford Umbrellas (manufacturer_id 28)
Build: "The Aurora Fiberglass" (868ARU-F) + 4 variants + grade prices.

Stage 1 only. Finishes, fabrics, recommendations, and images are NOT wired
here; those are Stage 2.

How this works:
  - Clones the existing aluminum Aurora product row (sku 868ARU) as a live
    template so category_id, manufacturer_id, pricing_mode, and every column
    we can't see copy correctly, then overrides the fields below.
  - Content columns (variants/fabric/finish/images/attributes) are blanked on
    the clone so the new product starts clean.
  - Inserts 4 product_variants and 7 variant_grade_prices per variant (28 rows).
  - Schema is introspected at runtime (PK names, column names) so it adapts to
    the live tables.

Run as-is for a dry run (writes nothing, rolls back, prints + writes a review
file). To commit:
  exec(open('aurora_fiberglass_build.py').read().replace('DRY_RUN = True', 'DRY_RUN = False'))
"""

import os
import math
import psycopg2
from psycopg2.extras import RealDictCursor, Json

DRY_RUN = True

MANUFACTURER_ID = 28
SOURCE_SKU = "868ARU"            # aluminum Aurora, used as the clone template
NEW_SKU = "868ARU-F"
NEW_SLUG = "the-aurora-fiberglass"
REVIEW_FILE = "aurora_fiberglass_build_review.txt"

# ---------------------------------------------------------------------------
# Pricing helper: exact integer ceil of MSRP * 0.90 (Frankford 10% off, ceil).
# Integer math avoids float error, e.g. 4900*0.9 -> 4410, not 4411.
# ---------------------------------------------------------------------------
def sale_of(msrp: int) -> int:
    return (msrp * 9 + 9) // 10

GRADES = ["A", "A+", "B", "C", "D", "E", "F"]

# ---------------------------------------------------------------------------
# Variant data (sourced from catalog P.9 + frankfordumbrellas.com; nothing
# invented). MSRP list is in GRADES order. Sale is computed, not hardcoded.
# dimensions string carries only sourced values (closed clearance + weight).
# ---------------------------------------------------------------------------
VARIANTS = [
    {
        "variant_sku": "868ARU-F",
        "variant_name": "11' Octagon / 3.5M",
        "dimensions": 'Closed Clearance: 39"/100cm | Weight: 99.5 lbs.',
        "msrps": [3680, 4158, 4511, 4637, 4767, 4900, 5086],
    },
    {
        "variant_sku": "880ARU-F",
        "variant_name": "13' Octagon / 4M",
        "dimensions": 'Closed Clearance: 32"/81cm | Weight: 102 lbs.',
        "msrps": [3851, 4341, 4711, 4844, 4977, 5110, 5312],
    },
    {
        "variant_sku": "883ARU-F-SQ",
        "variant_name": "10' x 10' Square / 3M x 3M",
        "dimensions": 'Closed Clearance: 27"/68cm | Weight: 99.5 lbs.',
        "msrps": [3851, 4341, 4711, 4844, 4977, 5110, 5312],
    },
    {
        "variant_sku": "882ARU-F-R",
        "variant_name": "8.5' x 11' Rectangular / 2.5M x 3.5M",
        "dimensions": 'Closed Clearance: 27.4"/70cm | Weight: 96.8 lbs.',
        "msrps": [3851, 4341, 4711, 4844, 4977, 5110, 5312],
    },
]

# Lead variant drives product-level price/msrp/sale/dimensions/weight.
LEAD = VARIANTS[0]
PRODUCT_MSRP = LEAD["msrps"][0]            # 3680
PRODUCT_SALE = sale_of(PRODUCT_MSRP)       # 3312
PRODUCT_DIMENSIONS = LEAD["dimensions"]
PRODUCT_WEIGHT = 99.5

SHORT_DESCRIPTION = "Fiberglass cantilever umbrella"

DESCRIPTION = (
    "Maximize your space without a traditional center post. The Aurora "
    "Fiberglass is manufactured using the industry's best materials and "
    "fabrics to provide many years of trouble-free use and enjoyment. Its "
    "Infinity Tilt allows you to change positions effortlessly. This modern "
    "cantilever is suitable for use in low to moderate wind conditions and "
    "ensures hours of protection from the sun and light rain.\n\n"
    "Operation: 360 degree mast rotation with 16 locking positions every "
    "22.5 degrees; Canopy Infinity Tilt for countless hours of maximum shade; "
    "automatic tilt locking for safety; smooth, commercially rated crank lift "
    "operation.\n\n"
    "Ribs: solid .75 inch (19mm) fiberglass ribs.\n\n"
    "Pole & Hardware: extruded aluminum mast; stainless steel hardware "
    "throughout; stainless steel screw and grommet canopy attachments.\n\n"
    "Canopy Features: engineered to withstand sustained 30 mph winds; black "
    "polyester protective cover bag included.\n\n"
    "Note: the 8.5' x 11' rectangular size (882ARU-F-R) is rated for "
    "residential use only."
)

# Scalar overrides on the cloned product row (applied only if the column
# exists on the live products table).
PRODUCT_OVERRIDES = {
    "sku": NEW_SKU,
    "name": "The Aurora Fiberglass",
    "slug": NEW_SLUG,
    "short_description": SHORT_DESCRIPTION,
    "description": DESCRIPTION,
    "price": PRODUCT_MSRP,
    "msrp": PRODUCT_MSRP,
    "sale_price": PRODUCT_SALE,
    "material": "Fiberglass",
    "material_slug": "fiberglass",
    "sub_category": "Cantilever",
    "dimensions": PRODUCT_DIMENSIONS,
    "weight": PRODUCT_WEIGHT,
    "available_online": True,
    "show_price_online": True,
    "featured": False,
    "featured_at": None,
}

# Content columns to blank on the clone (so we don't inherit aluminum content).
CONTENT_COLS = [
    "variants", "fabric_options", "fabric_pools",
    "finish_options", "finish_pools", "images", "attributes",
]

# Columns never copied from the source row (DB assigns these).
SKIP_ON_CLONE = ["created_at", "updated_at"]


def get_columns(cur, table):
    cur.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema = 'public' AND table_name = %s",
        (table,),
    )
    return {r["column_name"] for r in cur.fetchall()}


def get_pk(cur, table):
    cur.execute(
        "SELECT a.attname FROM pg_index i "
        "JOIN pg_attribute a ON a.attrelid = i.indrelid "
        "AND a.attnum = ANY(i.indkey) "
        "WHERE i.indrelid = %s::regclass AND i.indisprimary",
        (table,),
    )
    rows = cur.fetchall()
    return rows[0]["attname"] if rows else "id"


def jval(v):
    """Wrap dict/list values for jsonb insertion."""
    if isinstance(v, (dict, list)):
        return Json(v)
    return v


def main():
    url = os.environ["DATABASE_URL"]
    conn = psycopg2.connect(url)
    log = []

    def out(line=""):
        print(line)
        log.append(line)

    try:
        with conn.cursor(cursor_factory=RealDictCursor) as cur:
            prod_cols = get_columns(cur, "products")
            prod_pk = get_pk(cur, "products")
            var_cols = get_columns(cur, "product_variants")
            var_pk = get_pk(cur, "product_variants")
            gp_cols = get_columns(cur, "variant_grade_prices")

            if not var_cols:
                raise RuntimeError("product_variants table not found.")
            if not gp_cols:
                raise RuntimeError("variant_grade_prices table not found.")

            # grade-price column name detection
            gp_msrp_col = "msrp" if "msrp" in gp_cols else "price"
            gp_sale_col = "sale_price" if "sale_price" in gp_cols else "sale"

            # --- pre-flight checks ---
            cur.execute(
                "SELECT * FROM products WHERE sku = %s AND manufacturer_id = %s",
                (SOURCE_SKU, MANUFACTURER_ID),
            )
            source = cur.fetchone()
            if not source:
                raise RuntimeError(
                    f"Source product {SOURCE_SKU} (mfr {MANUFACTURER_ID}) not found. Aborting."
                )

            cur.execute(
                "SELECT 1 FROM products WHERE sku = %s AND manufacturer_id = %s",
                (NEW_SKU, MANUFACTURER_ID),
            )
            if cur.fetchone():
                raise RuntimeError(f"Product {NEW_SKU} already exists. Aborting.")

            cur.execute("SELECT 1 FROM products WHERE slug = %s", (NEW_SLUG,))
            if cur.fetchone():
                raise RuntimeError(f"Slug '{NEW_SLUG}' already in use. Aborting.")

            out("=" * 70)
            out("AURORA FIBERGLASS BUILD  -  " + ("DRY RUN (no writes)" if DRY_RUN else "LIVE COMMIT"))
            out("=" * 70)
            out(f"Source template: {SOURCE_SKU} (product {prod_pk}={source[prod_pk]})")
            out("")
            out("--- LIVE aluminum Aurora copy (for your comparison only) ---")
            out("short_description: " + str(source.get("short_description")))
            out("description:")
            out(str(source.get("description")))
            out("")

            # --- build new product row from clone + overrides ---
            new_row = dict(source)
            new_row.pop(prod_pk, None)
            for c in SKIP_ON_CLONE:
                new_row.pop(c, None)

            for c in CONTENT_COLS:
                if c in new_row:
                    # preserve list/dict shape as empty, else null
                    if isinstance(source.get(c), list):
                        new_row[c] = []
                    elif isinstance(source.get(c), dict):
                        new_row[c] = {}
                    else:
                        new_row[c] = None

            for k, v in PRODUCT_OVERRIDES.items():
                if k in prod_cols:
                    new_row[k] = v

            # keep only real columns
            new_row = {k: v for k, v in new_row.items() if k in prod_cols}

            cols = list(new_row.keys())
            placeholders = ", ".join(["%s"] * len(cols))
            collist = ", ".join(f'"{c}"' for c in cols)
            values = [jval(new_row[c]) for c in cols]

            cur.execute(
                f'INSERT INTO products ({collist}) VALUES ({placeholders}) RETURNING "{prod_pk}"',
                values,
            )
            new_pid = cur.fetchone()[prod_pk]

            out(f"INSERT products -> new {prod_pk} = {new_pid}")
            out(f"  sku={NEW_SKU}  name='The Aurora Fiberglass'  slug={NEW_SLUG}")
            out(f"  material=Fiberglass  sub_category=Cantilever")
            out(f"  price/msrp={PRODUCT_MSRP}  sale={PRODUCT_SALE}  available_online=True")
            out(f"  dimensions={PRODUCT_DIMENSIONS}  weight={PRODUCT_WEIGHT}")
            out("")

            # --- variants + grade prices ---
            for i, v in enumerate(VARIANTS):
                vrow = {
                    "product_id": new_pid,
                    "variant_sku": v["variant_sku"],
                    "variant_name": v["variant_name"],
                    "option_label": "Configuration",
                    "price_adjustment": 0,
                    "shipping_surcharge": 0,
                    "display_order": i,
                    "is_active": True,
                    "dimensions": v["dimensions"],
                    "notes": None,
                    "exclude_stripe_fabrics": False,
                    "min_order_qty": None,
                    "weight": None,   # variant weight null; weight lives in dimensions string
                }
                vrow = {k: val for k, val in vrow.items() if k in var_cols}
                vcols = list(vrow.keys())
                vph = ", ".join(["%s"] * len(vcols))
                vcl = ", ".join(f'"{c}"' for c in vcols)
                cur.execute(
                    f'INSERT INTO product_variants ({vcl}) VALUES ({vph}) RETURNING "{var_pk}"',
                    [vrow[c] for c in vcols],
                )
                vid = cur.fetchone()[var_pk]

                out(f"INSERT variant {v['variant_sku']:14s} ({v['variant_name']})  {var_pk}={vid}")
                out(f"   dimensions: {v['dimensions']}")
                for grade, msrp in zip(GRADES, v["msrps"]):
                    sale = sale_of(msrp)
                    gp = {
                        "variant_id": vid,
                        "grade": grade,
                        gp_msrp_col: msrp,
                        gp_sale_col: sale,
                    }
                    gp = {k: val for k, val in gp.items() if k in gp_cols}
                    gcols = list(gp.keys())
                    gph = ", ".join(["%s"] * len(gcols))
                    gcl = ", ".join(f'"{c}"' for c in gcols)
                    cur.execute(
                        f"INSERT INTO variant_grade_prices ({gcl}) VALUES ({gph})",
                        [gp[c] for c in gcols],
                    )
                    out(f"      grade {grade:2s}  msrp={msrp:5d}  sale={sale:5d}")
                out("")

            out("-" * 70)
            out(f"Totals: 1 product, {len(VARIANTS)} variants, "
                f"{len(VARIANTS) * len(GRADES)} grade-price rows.")

            if DRY_RUN:
                conn.rollback()
                out("DRY RUN complete. Rolled back. Nothing written.")
            else:
                conn.commit()
                out("COMMITTED to database.")

    except Exception as e:
        conn.rollback()
        out(f"ERROR (rolled back): {e}")
        raise
    finally:
        conn.close()
        with open(REVIEW_FILE, "w") as f:
            f.write("\n".join(log))
        print(f"\nReview written to {REVIEW_FILE}")


if __name__ == "__main__":
    main()
