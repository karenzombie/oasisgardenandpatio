"""
Galtech Replacement Cover Pricing - Variant + Grade Price Load
Source of truth: 2026 Galtech MSRP, page 23
Sale price formula: ceil(msrp * 0.75)

For each COVER product:
  - Replaces the single placeholder variant with SWV and/or DWV variants
  - Each variant carries full grade prices (C, B, A, BB, AA where available)
  - 6' and 6x6' have no C grade (Suncrylic not listed)
  - 3.5x7', 8x8', 10x10' have SWV only (no DWV in MSRP)
  - 13' has DWV only (no SWV in MSRP)
"""

import os
import psycopg2
import psycopg2.extras
import math

DRY_RUN = True

# Cover pricing from MSRP p.23
# Structure: sku -> list of variants, each with grade_prices
COVER_DATA = {
    'COVER-60': [
        {
            'variant_sku': 'COVER-60-SWV',
            'variant_name': 'Single Vent',
            'option_label': 'Wind Vent',
            'display_order': 0,
            'grade_prices': [
                {'grade': 'B',  'msrp': 420},
                {'grade': 'A',  'msrp': 460},
                {'grade': 'BB', 'msrp': 455},
                {'grade': 'AA', 'msrp': 500},
            ],
        },
        {
            'variant_sku': 'COVER-60-DWV',
            'variant_name': 'Double Vent',
            'option_label': 'Wind Vent',
            'display_order': 1,
            'grade_prices': [
                {'grade': 'B',  'msrp': 525},
                {'grade': 'A',  'msrp': 565},
                {'grade': 'BB', 'msrp': 565},
                {'grade': 'AA', 'msrp': 605},
            ],
        },
    ],
    'COVER-66': [
        {
            'variant_sku': 'COVER-66-SWV',
            'variant_name': 'Single Vent',
            'option_label': 'Wind Vent',
            'display_order': 0,
            'grade_prices': [
                {'grade': 'B',  'msrp': 495},
                {'grade': 'A',  'msrp': 535},
                {'grade': 'BB', 'msrp': 530},
                {'grade': 'AA', 'msrp': 575},
            ],
        },
        {
            'variant_sku': 'COVER-66-DWV',
            'variant_name': 'Double Vent',
            'option_label': 'Wind Vent',
            'display_order': 1,
            'grade_prices': [
                {'grade': 'B',  'msrp': 600},
                {'grade': 'A',  'msrp': 640},
                {'grade': 'BB', 'msrp': 640},
                {'grade': 'AA', 'msrp': 680},
            ],
        },
    ],
    'COVER-75': [
        {
            'variant_sku': 'COVER-75-SWV',
            'variant_name': 'Single Vent',
            'option_label': 'Wind Vent',
            'display_order': 0,
            'grade_prices': [
                {'grade': 'C',  'msrp': 380},
                {'grade': 'B',  'msrp': 505},
                {'grade': 'A',  'msrp': 540},
                {'grade': 'BB', 'msrp': 545},
                {'grade': 'AA', 'msrp': 580},
            ],
        },
        {
            'variant_sku': 'COVER-75-DWV',
            'variant_name': 'Double Vent',
            'option_label': 'Wind Vent',
            'display_order': 1,
            'grade_prices': [
                {'grade': 'B',  'msrp': 610},
                {'grade': 'A',  'msrp': 645},
                {'grade': 'BB', 'msrp': 650},
                {'grade': 'AA', 'msrp': 685},
            ],
        },
    ],
    'COVER-77': [
        {
            'variant_sku': 'COVER-77-SWV',
            'variant_name': 'Single Vent',
            'option_label': 'Wind Vent',
            'display_order': 0,
            'grade_prices': [
                {'grade': 'B',  'msrp': 505},
                {'grade': 'A',  'msrp': 540},
                {'grade': 'BB', 'msrp': 545},
                {'grade': 'AA', 'msrp': 580},
            ],
        },
        # No DWV for 3.5x7' in MSRP
    ],
    'COVER-90': [
        {
            'variant_sku': 'COVER-90-SWV',
            'variant_name': 'Single Vent',
            'option_label': 'Wind Vent',
            'display_order': 0,
            'grade_prices': [
                {'grade': 'C',  'msrp': 470},
                {'grade': 'B',  'msrp': 590},
                {'grade': 'A',  'msrp': 630},
                {'grade': 'BB', 'msrp': 630},
                {'grade': 'AA', 'msrp': 670},
            ],
        },
        {
            'variant_sku': 'COVER-90-DWV',
            'variant_name': 'Double Vent',
            'option_label': 'Wind Vent',
            'display_order': 1,
            'grade_prices': [
                {'grade': 'B',  'msrp': 695},
                {'grade': 'A',  'msrp': 735},
                {'grade': 'BB', 'msrp': 735},
                {'grade': 'AA', 'msrp': 775},
            ],
        },
    ],
    'COVER-80': [
        {
            'variant_sku': 'COVER-80-SWV',
            'variant_name': 'Single Vent',
            'option_label': 'Wind Vent',
            'display_order': 0,
            'grade_prices': [
                {'grade': 'B',  'msrp': 900},
                {'grade': 'A',  'msrp': 985},
                {'grade': 'BB', 'msrp': 950},
                {'grade': 'AA', 'msrp': 1035},
            ],
        },
        {
            'variant_sku': 'COVER-80-DWV',
            'variant_name': 'Double Vent',
            'option_label': 'Wind Vent',
            'display_order': 1,
            'grade_prices': [
                {'grade': 'B',  'msrp': 1025},
                {'grade': 'A',  'msrp': 1110},
                {'grade': 'BB', 'msrp': 1075},
                {'grade': 'AA', 'msrp': 1160},
            ],
        },
    ],
    'COVER-88': [
        {
            'variant_sku': 'COVER-88-SWV',
            'variant_name': 'Single Vent',
            'option_label': 'Wind Vent',
            'display_order': 0,
            'grade_prices': [
                {'grade': 'B',  'msrp': 915},
                {'grade': 'A',  'msrp': 1000},
                {'grade': 'BB', 'msrp': 965},
                {'grade': 'AA', 'msrp': 1050},
            ],
        },
        # No DWV for 8x8' in MSRP
    ],
    'COVER-11': [
        {
            'variant_sku': 'COVER-11-SWV',
            'variant_name': 'Single Vent',
            'option_label': 'Wind Vent',
            'display_order': 0,
            'grade_prices': [
                {'grade': 'C',  'msrp': 705},
                {'grade': 'B',  'msrp': 940},
                {'grade': 'A',  'msrp': 1025},
                {'grade': 'BB', 'msrp': 990},
                {'grade': 'AA', 'msrp': 1075},
            ],
        },
        {
            'variant_sku': 'COVER-11-DWV',
            'variant_name': 'Double Vent',
            'option_label': 'Wind Vent',
            'display_order': 1,
            'grade_prices': [
                {'grade': 'B',  'msrp': 1070},
                {'grade': 'A',  'msrp': 1150},
                {'grade': 'BB', 'msrp': 1120},
                {'grade': 'AA', 'msrp': 1200},
            ],
        },
    ],
    'COVER-10': [
        {
            'variant_sku': 'COVER-10-SWV',
            'variant_name': 'Single Vent',
            'option_label': 'Wind Vent',
            'display_order': 0,
            'grade_prices': [
                {'grade': 'B',  'msrp': 1005},
                {'grade': 'A',  'msrp': 1090},
                {'grade': 'BB', 'msrp': 1055},
                {'grade': 'AA', 'msrp': 1140},
            ],
        },
        # No DWV for 10x10' in MSRP
    ],
    'COVER-13': [
        # 13' has DWV only
        {
            'variant_sku': 'COVER-13-DWV',
            'variant_name': 'Double Vent',
            'option_label': 'Wind Vent',
            'display_order': 0,
            'grade_prices': [
                {'grade': 'B',  'msrp': 1320},
                {'grade': 'A',  'msrp': 1405},
                {'grade': 'BB', 'msrp': 1370},
                {'grade': 'AA', 'msrp': 1455},
            ],
        },
    ],
}

def sale_price(msrp):
    return math.ceil(msrp * 0.75)

def run():
    conn = psycopg2.connect(os.environ['DATABASE_URL'])
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # Get product IDs for cover skus
    cur.execute("SELECT id, sku FROM products WHERE sku = ANY(%s)", (list(COVER_DATA.keys()),))
    products = {row['sku']: row['id'] for row in cur.fetchall()}
    print(f"Found {len(products)} cover products in DB")
    for sku, pid in products.items():
        print(f"  {sku} -> product_id={pid}")

    missing = [s for s in COVER_DATA if s not in products]
    if missing:
        print(f"\nERROR: These SKUs not found in DB: {missing}")
        conn.close()
        return

    total_variants_deleted = 0
    total_variants_inserted = 0
    total_grade_prices_inserted = 0

    for sku, variants in COVER_DATA.items():
        product_id = products[sku]

        # Find the minimum MSRP across all variants/grades for product-level msrp
        all_msrps = [gp['msrp'] for v in variants for gp in v['grade_prices']]
        product_msrp = min(all_msrps)
        product_sale = sale_price(product_msrp)

        print(f"\n--- {sku} (product_id={product_id}) ---")
        print(f"  Product MSRP will be set to: {product_msrp} | sale: {product_sale}")

        # Show what we're deleting
        cur.execute("SELECT id, variant_sku, variant_name FROM product_variants WHERE product_id = %s", (product_id,))
        existing = cur.fetchall()
        print(f"  Deleting {len(existing)} existing variant(s):")
        for ev in existing:
            print(f"    variant_id={ev['id']} sku={ev['variant_sku']} name={ev['variant_name']}")

        # Show what we're inserting
        print(f"  Inserting {len(variants)} new variant(s):")
        for v in variants:
            print(f"    {v['variant_sku']} | {v['variant_name']} | {len(v['grade_prices'])} grade prices")
            for gp in v['grade_prices']:
                sp = sale_price(gp['msrp'])
                print(f"      grade={gp['grade']} msrp={gp['msrp']} sale={sp}")

        if not DRY_RUN:
            # Update product-level msrp and sale_price
            cur.execute(
                "UPDATE products SET msrp = %s, sale_price = %s, updated_at = NOW() WHERE id = %s",
                (product_msrp, product_sale, product_id)
            )

            # Delete existing variants (grade prices cascade via FK)
            cur.execute("DELETE FROM variant_grade_prices WHERE variant_id IN (SELECT id FROM product_variants WHERE product_id = %s)", (product_id,))
            cur.execute("DELETE FROM product_variants WHERE product_id = %s", (product_id,))
            total_variants_deleted += len(existing)

            # Insert new variants
            for v in variants:
                cur.execute(
                    """
                    INSERT INTO product_variants
                        (product_id, variant_sku, variant_name, option_label,
                         price_adjustment, msrp, sale_price, shipping_surcharge,
                         weight, exclude_stripe_fabrics, display_order, is_active)
                    VALUES (%s, %s, %s, %s, 0, NULL, NULL, 0, NULL, false, %s, true)
                    RETURNING id
                    """,
                    (product_id, v['variant_sku'], v['variant_name'], v['option_label'], v['display_order'])
                )
                variant_id = cur.fetchone()['id']
                total_variants_inserted += 1

                for gp in v['grade_prices']:
                    sp = sale_price(gp['msrp'])
                    cur.execute(
                        """
                        INSERT INTO variant_grade_prices (variant_id, grade, msrp, sale_price)
                        VALUES (%s, %s, %s, %s)
                        """,
                        (variant_id, gp['grade'], gp['msrp'], sp)
                    )
                    total_grade_prices_inserted += 1

            conn.commit()

    print(f"\n=== SUMMARY ===")
    if DRY_RUN:
        print("DRY RUN - no changes made")
    else:
        print(f"Variants deleted:      {total_variants_deleted}")
        print(f"Variants inserted:     {total_variants_inserted}")
        print(f"Grade prices inserted: {total_grade_prices_inserted}")
    print(f"Products processed:    {len(COVER_DATA)}")

    conn.close()

run()
