import psycopg2
import psycopg2.extras
import os
import json

COMMIT = False

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

MANUFACTURER_ID = 16
COLLECTION = 'Eden'
MATERIAL_ID = 1  # Aluminum

DESCRIPTION = (
    "Eden's warmly functional design is sparked by Swedish simplicity, clean lines, and flawless craftsmanship. "
    "Constructed with HDPE materials, Eden is a slatted, teak-inspired top with an aluminum base that is "
    "available in all of Homecrest's textured powder-coated finishes. Available in dining, balcony, and bar heights, "
    "the modern appearance of the Eden collection bears the essence of cool sophistication and the welcoming warmth "
    "of comfort you expect from your Homecrest outdoor furniture. Eden gives discerning homeowners and designers a "
    "lot of creative control with its DuoTone style, meaning they can mix and match seat top colors to complement "
    "or contrast the frame finishes on the legs."
)

FRAME_FINISH_IDS = [290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300]
TOP_FINISH_IDS   = [494, 496, 501, 502]  # Coastal Gray, Weathered Wood, Light Gray, Brazilian Walnut
ALL_FINISH_IDS   = FRAME_FINISH_IDS + TOP_FINISH_IDS  # 15 total

PRODUCTS = [
    # --- Occasional Tables (category 52, Coffee & Side Tables) ---
    {
        'sku': '2621S',
        'name': 'Eden Side Complete Table 23.5" (no hole)',
        'slug': 'eden-side-complete-table-23-5-no-hole-2621s-eden-homecrest',
        'category_id': 52,
        'sub_category': 'Coffee & Side Tables',
        'specs': {'Width': '23.5"', 'Depth': '23.5"', 'Height': '16.75"'},
    },
    {
        'sku': '2624S',
        'name': 'Eden End Complete Table 23.5" (no hole)',
        'slug': 'eden-end-complete-table-23-5-no-hole-2624s-eden-homecrest',
        'category_id': 52,
        'sub_category': 'Coffee & Side Tables',
        'specs': {'Width': '23.5"', 'Depth': '23.5"', 'Height': '22"'},
    },
    {
        'sku': '261660',
        'name': 'Eden Coffee Complete Table 30.5"x60" (no hole)',
        'slug': 'eden-coffee-complete-table-30-5x60-no-hole-261660-eden-homecrest',
        'category_id': 52,
        'sub_category': 'Coffee & Side Tables',
        'specs': {'Width': '30.5"', 'Depth': '60"', 'Height': '16"'},
    },
    # --- Dining Bench (category 44, Dining Tables) ---
    {
        'sku': '261948',
        'name': 'Eden Dining Bench 15.5"x48" (no hole)',
        'slug': 'eden-dining-bench-15-5x48-no-hole-261948-eden-homecrest',
        'category_id': 44,
        'sub_category': 'Dining Tables',
        'specs': {'Width': '15.5"', 'Depth': '48"', 'Height': '19"'},
    },
    # --- Balcony Bench + Bar Bench (category 47, no sub_category) ---
    {
        'sku': '262348',
        'name': 'Eden Balcony Bench 15.5"x48" (no hole)',
        'slug': 'eden-balcony-bench-15-5x48-no-hole-262348-eden-homecrest',
        'category_id': 47,
        'sub_category': None,
        'specs': {'Width': '15.5"', 'Depth': '48"', 'Height': '23"'},
    },
    {
        'sku': '262948',
        'name': 'Eden Bar Bench Sofa Table 15.5"x48" (no hole)',
        'slug': 'eden-bar-bench-sofa-table-15-5x48-no-hole-262948-eden-homecrest',
        'category_id': 47,
        'sub_category': None,
        'specs': {'Width': '15.5"', 'Depth': '48"', 'Height': '29"'},
    },
    # --- Dining Tables (category 44, Dining Tables) ---
    {
        'sku': '263060',
        'name': 'Eden Dining Complete Table 35.5"x60" (no hole)',
        'slug': 'eden-dining-complete-table-35-5x60-no-hole-263060-eden-homecrest',
        'category_id': 44,
        'sub_category': 'Dining Tables',
        'specs': {'Width': '35.5"', 'Depth': '60"', 'Height': '30"'},
    },
    {
        'sku': '2630110',
        'name': 'Eden Dining Complete Table 35.5"x110" (no hole)',
        'slug': 'eden-dining-complete-table-35-5x110-no-hole-2630110-eden-homecrest',
        'category_id': 44,
        'sub_category': 'Dining Tables',
        'specs': {'Width': '35.5"', 'Depth': '110"', 'Height': '30"'},
    },
    # --- Balcony & Bar Tables (category 47, no sub_category) ---
    {
        'sku': '263460',
        'name': 'Eden Balcony Complete Table 35.5"x60" (no hole)',
        'slug': 'eden-balcony-complete-table-35-5x60-no-hole-263460-eden-homecrest',
        'category_id': 47,
        'sub_category': None,
        'specs': {'Width': '35.5"', 'Depth': '60"', 'Height': '34"'},
    },
    {
        'sku': '264060',
        'name': 'Eden Bar Complete Table 35.5"x60" (no hole)',
        'slug': 'eden-bar-complete-table-35-5x60-no-hole-264060-eden-homecrest',
        'category_id': 47,
        'sub_category': None,
        'specs': {'Width': '35.5"', 'Depth': '60"', 'Height': '40"'},
    },
    {
        'sku': '2634110',
        'name': 'Eden Balcony Complete Table 35.5"x110" (no hole)',
        'slug': 'eden-balcony-complete-table-35-5x110-no-hole-2634110-eden-homecrest',
        'category_id': 47,
        'sub_category': None,
        'specs': {'Width': '35.5"', 'Depth': '110"', 'Height': '34"'},
    },
    {
        'sku': '2640110',
        'name': 'Eden Bar Complete Table 35.5"x110" (no hole)',
        'slug': 'eden-bar-complete-table-35-5x110-no-hole-2640110-eden-homecrest',
        'category_id': 47,
        'sub_category': None,
        'specs': {'Width': '35.5"', 'Depth': '110"', 'Height': '40"'},
    },
]

# ----------------------------------------------------------------
print("=" * 70)
print(f"EDEN INSERT SCRIPT  |  COMMIT = {COMMIT}")
print("=" * 70)

all_product_ids = {}

# ----------------------------------------------------------------
# STEP 1: INSERT EDEN PRODUCTS
# ----------------------------------------------------------------
print("\n--- STEP 1: Eden Table Products ---")
for p in PRODUCTS:
    cur.execute("SELECT id FROM products WHERE sku = %s AND manufacturer_id = %s", (p['sku'], MANUFACTURER_ID))
    existing = cur.fetchone()
    if existing:
        all_product_ids[p['sku']] = existing['id']
        print(f"  SKIP (already exists): {p['sku']} -- id={existing['id']}")
        continue

    cur.execute("""
        INSERT INTO products (
            sku, name, slug, manufacturer_id, collection,
            category_id, sub_category,
            description, short_description,
            specs,
            pricing_mode, msrp, price, sale_price,
            available_online, is_active, show_price_online,
            quote_only, in_store_only
        ) VALUES (
            %s, %s, %s, %s, %s,
            %s, %s,
            %s, %s,
            %s,
            %s, %s, %s, %s,
            %s, %s, %s,
            %s, %s
        ) RETURNING id
    """, (
        p['sku'], p['name'], p['slug'], MANUFACTURER_ID, COLLECTION,
        p['category_id'], p['sub_category'],
        DESCRIPTION, None,
        json.dumps(p['specs']),
        'fixed', None, None, None,
        False, True, False,
        True, False
    ))
    new_id = cur.fetchone()['id']
    all_product_ids[p['sku']] = new_id
    print(f"  INSERT: [{new_id}] {p['sku']} -- {p['name']}")

# ----------------------------------------------------------------
# STEP 2: WIRE FINISH OPTIONS
# ----------------------------------------------------------------
print("\n--- STEP 2: Finish Options ---")
for sku, pid in all_product_ids.items():
    cur.execute("SELECT COUNT(*) as cnt FROM product_finish_options WHERE product_id = %s", (pid,))
    cnt = cur.fetchone()['cnt']
    if cnt > 0:
        print(f"  SKIP finishes (already wired): product_id={pid} ({sku})")
        continue
    for display_order, finish_id in enumerate(ALL_FINISH_IDS):
        cur.execute("""
            INSERT INTO product_finish_options (product_id, finish_id, display_order)
            VALUES (%s, %s, %s)
        """, (pid, finish_id, display_order))
    print(f"  Wired {len(ALL_FINISH_IDS)} finishes for product_id={pid} ({sku})")

# ----------------------------------------------------------------
# STEP 3: WIRE FINISH POOLS
# ----------------------------------------------------------------
print("\n--- STEP 3: Finish Pools ---")
for sku, pid in all_product_ids.items():
    cur.execute("SELECT id FROM product_finish_pools WHERE product_id = %s", (pid,))
    if cur.fetchone():
        print(f"  SKIP finish pool (already exists): product_id={pid} ({sku})")
        continue
    cur.execute("""
        INSERT INTO product_finish_pools (product_id, manufacturer_id)
        VALUES (%s, %s)
    """, (pid, MANUFACTURER_ID))
    print(f"  Wired finish pool for product_id={pid} ({sku})")

# ----------------------------------------------------------------
# STEP 4: WIRE MATERIALS
# ----------------------------------------------------------------
print("\n--- STEP 4: Materials ---")
for sku, pid in all_product_ids.items():
    cur.execute("SELECT id FROM product_materials WHERE product_id = %s AND material_id = %s", (pid, MATERIAL_ID))
    if cur.fetchone():
        print(f"  SKIP material (already wired): product_id={pid} ({sku})")
        continue
    cur.execute("""
        INSERT INTO product_materials (product_id, material_id)
        VALUES (%s, %s)
    """, (pid, MATERIAL_ID))
    print(f"  Wired Aluminum for product_id={pid} ({sku})")

# ----------------------------------------------------------------
# STEP 5: VERIFICATION
# ----------------------------------------------------------------
print("\n--- STEP 5: Verification ---")
for p in PRODUCTS:
    cur.execute("""
        SELECT p.id, p.sku, p.name, p.slug, p.collection,
               p.category_id, p.sub_category,
               p.available_online, p.is_active, p.show_price_online,
               p.quote_only, p.in_store_only, p.specs,
               COUNT(DISTINCT pfo.id) as finish_count,
               COUNT(DISTINCT pfp.id) as pool_count,
               COUNT(DISTINCT pm.id) as material_count
        FROM products p
        LEFT JOIN product_finish_options pfo ON pfo.product_id = p.id
        LEFT JOIN product_finish_pools pfp ON pfp.product_id = p.id
        LEFT JOIN product_materials pm ON pm.product_id = p.id
        WHERE p.sku = %s AND p.manufacturer_id = %s
        GROUP BY p.id
    """, (p['sku'], MANUFACTURER_ID))
    row = cur.fetchone()
    if row:
        checks = []
        checks.append(('name', row['name'] == p['name']))
        checks.append(('slug', row['slug'] == p['slug']))
        checks.append(('collection', row['collection'] == COLLECTION))
        checks.append(('category_id', row['category_id'] == p['category_id']))
        checks.append(('sub_category', row['sub_category'] == p['sub_category']))
        checks.append(('available_online=F', row['available_online'] == False))
        checks.append(('is_active=T', row['is_active'] == True))
        checks.append(('show_price_online=F', row['show_price_online'] == False))
        checks.append(('quote_only=T', row['quote_only'] == True))
        checks.append(('in_store_only=F', row['in_store_only'] == False))
        checks.append(('specs', row['specs'] is not None))
        checks.append(('finishes=15', row['finish_count'] == 15))
        checks.append(('pool=1', row['pool_count'] == 1))
        checks.append(('material=1', row['material_count'] == 1))
        results = ' | '.join(f"{k}: {'PASS' if v else 'FAIL'}" for k, v in checks)
        print(f"  [{row['id']}] {p['sku']}: {results}")
    else:
        print(f"  MISSING: {p['sku']} -- NOT FOUND")

# ----------------------------------------------------------------
# COMMIT OR ROLLBACK
# ----------------------------------------------------------------
if COMMIT:
    conn.commit()
    print("\n*** COMMITTED ***")
else:
    conn.rollback()
    print("\n*** DRY RUN -- rolled back. Re-run with COMMIT = True to apply. ***")

cur.close()
conn.close()
