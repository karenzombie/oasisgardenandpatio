import os
import psycopg2

db_url = os.environ.get('DATABASE_URL') or os.environ.get('PROD_DATABASE_URL')
conn = psycopg2.connect(db_url)
cur = conn.cursor()

DRY_RUN = False  # Set to False to commit

MANUFACTURER_ID = 17  # NorthCape

# Category IDs
CAT_DEEP_SEATING  = 43
CAT_DINING        = 44
CAT_FIRE_TABLES   = 45
CAT_COFFEE_SIDE   = 46
CAT_BAR           = 47
CAT_CHAISE        = 42
CAT_ACCENT        = 49

changes = []

def log(msg):
    changes.append(msg)
    print(msg)

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1: DELETE prior-year products not in 2026 catalog
# ─────────────────────────────────────────────────────────────────────────────

# Old Hixon 6300 series (15 items) -- superseded by 6400 in 2026
delete_6300 = [
    'NC63003S-TAN','NC6300C-TAN','NC6300CET-TAN','NC6300CT-REC-TAN',
    'NC6300DC-TAN','NC6300LL-TAN','NC6300LS-TAN','NC6300NET-TAN',
    'NC6300O-TAN','NC6300RL-TAN','NC6300SCC-90','NC6300SCM',
    'NC6300SR-TAN','NC6790CVT-REC-TAN','NC6791CVT-REC-TAN',
]

# Old Chalfonte SKUs superseded by Duraboard versions
delete_chalfonte_old = [
    'NC2685DT-SQ-33','NC2685DT-SQ-41',
    'NC2685DT-REC-72','NC2685DT-REC-83',
]

all_deletes = delete_6300 + delete_chalfonte_old
log(f"\n=== SECTION 1: DELETE {len(all_deletes)} prior-year products ===")
for sku in all_deletes:
    cur.execute("""
        SELECT products.id, products.name FROM products
        JOIN manufacturers m ON products.manufacturer_id = m.id
        WHERE m.id = %s AND products.sku = %s
    """, (MANUFACTURER_ID, sku))
    row = cur.fetchone()
    if row:
        log(f"  DELETE id={row[0]} sku={sku} name={row[1]}")
        if not DRY_RUN:
            cur.execute("DELETE FROM products WHERE id = %s", (row[0],))
    else:
        log(f"  SKIP (not found): {sku}")

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 2: UPDATE existing products -- name, collection, material
# ─────────────────────────────────────────────────────────────────────────────

log("\n=== SECTION 2: UPDATE existing products ===")

# Format: (sku, new_name, collection, material, material_slug)
# new_name = None means keep existing name
updates = [
    # --- Biscayne 6510: rename collection + product names + material ---
    ('NC65103S',       'Biscayne Sofa',                        'Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510C',        'Biscayne Lounge Chair',                 'Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510LS',       'Biscayne Loveseat',                     'Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510SR',       'Biscayne Swivel Rocker',                'Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510O-REC',    'Biscayne Ottoman',                      'Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510R-CHT',    'Biscayne Rotating Chat Table',          'Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510CT-REC',   'Biscayne Rectangular Coffee Table',     'Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510ET-SQ',    'Biscayne Square End Table',             'Biscayne 6510', 'Wicker', 'wicker'),

    # --- Hixon 6400 deep seating: update collection name + material ---
    ('NC64003S-TAN',   'Hixon Sofa',                            'Hixon 6400', 'Aluminum', 'aluminum'),
    ('NC6400LS-TAN',   'Hixon Loveseat',                        'Hixon 6400', 'Aluminum', 'aluminum'),
    ('NC6400C-TAN',    'Hixon Lounge Chair',                    'Hixon 6400', 'Aluminum', 'aluminum'),
    ('NC6400SR-TAN',   'Hixon Swivel Rocker',                   'Hixon 6400', 'Aluminum', 'aluminum'),
    ('NC6400O-REC-TAN','Hixon Ottoman',                         'Hixon 6400', 'Aluminum', 'aluminum'),
    ('NC6400NET-TAN',  'Hixon Slat Nesting Tables',             'Hixon 6400', 'Aluminum', 'aluminum'),
    ('NC6400CT-TAN',   'Hixon Slat Coffee Table',               'Hixon 6400', 'Aluminum', 'aluminum'),
    ('NC6400CET-TAN',  'Hixon Sectional Corner End Table',      'Hixon 6400', 'Aluminum', 'aluminum'),
    ('NC6400SCM',      'Hixon Sectional Middle Armless',        'Hixon 6400', 'Aluminum', 'aluminum'),
    ('NC6400LL-TAN',   'Hixon Sectional Left Arm Loveseat',     'Hixon 6400', 'Aluminum', 'aluminum'),
    ('NC6400RL-TAN',   'Hixon Sectional Right Arm Loveseat',    'Hixon 6400', 'Aluminum', 'aluminum'),
    ('NC6400SCC-TAN',  'Hixon Sectional 90 Degree Corner',      'Hixon 6400', 'Aluminum', 'aluminum'),

    # --- Bainbridge: collection + material + fix doubled "Sectional" in names ---
    ('NC2753S',        'Bainbridge Sofa',                       'Bainbridge', 'Wicker', 'wicker'),
    ('NC275LS',        'Bainbridge Loveseat',                   'Bainbridge', 'Wicker', 'wicker'),
    ('NC275C',         'Bainbridge Club Chair',                  'Bainbridge', 'Wicker', 'wicker'),
    ('NC275SG',        'Bainbridge Swivel Glider Club Chair',   'Bainbridge', 'Wicker', 'wicker'),
    ('NC275LL',        'Bainbridge Sectional Left Arm Loveseat','Bainbridge', 'Wicker', 'wicker'),
    ('NC275RL',        'Bainbridge Sectional Right Arm Loveseat','Bainbridge', 'Wicker', 'wicker'),
    ('NC275SCC',       'Bainbridge Sectional Corner Chair',     'Bainbridge', 'Wicker', 'wicker'),
    ('NC275SCC-45',    'Bainbridge Sectional 45 Degree Corner', 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275SCM',       'Bainbridge Sectional Middle Chair',     'Bainbridge', 'Wicker', 'wicker'),
    ('NC275O-REC',     'Bainbridge Rectangular Ottoman',        'Bainbridge', 'Wicker', 'wicker'),
    ('NC275O-SQ',      'Bainbridge Square Ottoman',             'Bainbridge', 'Wicker', 'wicker'),
    ('NC275ET-SQ',     'Bainbridge Square End Table',           'Bainbridge', 'Wicker', 'wicker'),
    ('NC275CT-SQ',     'Bainbridge Square Coffee Table',        'Bainbridge', 'Wicker', 'wicker'),
    ('NC275CT-REC',    'Bainbridge Rectangular Coffee Table',   'Bainbridge', 'Wicker', 'wicker'),
    ('NC275CET',       'Bainbridge Corner End Table',           'Bainbridge', 'Wicker', 'wicker'),

    # --- Grand Stafford: collection + material ---
    ('NC43313S',       'Grand Stafford Sofa',                   'Grand Stafford', 'Wicker', 'wicker'),
    ('NC4331LS',       'Grand Stafford Loveseat',               'Grand Stafford', 'Wicker', 'wicker'),
    ('NC4331C',        'Grand Stafford Lounge Chair',            'Grand Stafford', 'Wicker', 'wicker'),
    ('NC4331O-REC',    'Grand Stafford Rectangular Ottoman',    'Grand Stafford', 'Wicker', 'wicker'),
    ('NC4331CT-REC',   'Grand Stafford Rectangular Coffee Table','Grand Stafford', 'Wicker', 'wicker'),
    ('NC4331ET-SQ',    'Grand Stafford Square End Table',       'Grand Stafford', 'Wicker', 'wicker'),

    # --- Lakeside: collection + material + fix doubled "Sectional" in names ---
    ('NC43023S',       'Lakeside Sofa',                         'Lakeside', 'Wicker', 'wicker'),
    ('NC4302LS',       'Lakeside Loveseat',                     'Lakeside', 'Wicker', 'wicker'),
    ('NC4302C',        'Lakeside Club Chair',                    'Lakeside', 'Wicker', 'wicker'),
    ('NC4302SG',       'Lakeside Swivel Glider',                 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302LL',       'Lakeside Sectional Left Arm Loveseat',  'Lakeside', 'Wicker', 'wicker'),
    ('NC4302RL',       'Lakeside Sectional Right Arm Loveseat', 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302SCC',      'Lakeside Sectional Corner Chair',       'Lakeside', 'Wicker', 'wicker'),
    ('NC4302SCC-45',   'Lakeside Sectional 45 Degree Corner',   'Lakeside', 'Wicker', 'wicker'),
    ('NC4302SCM',      'Lakeside Sectional Middle Chair',       'Lakeside', 'Wicker', 'wicker'),
    ('NC4302O-REC',    'Lakeside Rectangular Ottoman',          'Lakeside', 'Wicker', 'wicker'),
    ('NC4302O-SQ',     'Lakeside Square Ottoman',               'Lakeside', 'Wicker', 'wicker'),
    ('NC4302CET',      'Lakeside Corner End Table',             'Lakeside', 'Wicker', 'wicker'),
    ('NC4302CT-REC',   'Lakeside Rectangular Coffee Table',     'Lakeside', 'Wicker', 'wicker'),
    ('NC4302CT-SQ',    'Lakeside Square Coffee Table',          'Lakeside', 'Wicker', 'wicker'),
    ('NC4302ET-SQ',    'Lakeside Square End Table',             'Lakeside', 'Wicker', 'wicker'),

    # --- Sydney 5306: collection + material ---
    ('NC53063S',       'Sydney Sofa',                           'Sydney 5306', 'Wicker', 'wicker'),
    ('NC5306LS',       'Sydney Loveseat',                       'Sydney 5306', 'Wicker', 'wicker'),
    ('NC5306C',        'Sydney Lounge Chair',                    'Sydney 5306', 'Wicker', 'wicker'),
    ('NC5306SG',       'Sydney Swivel Glider',                   'Sydney 5306', 'Wicker', 'wicker'),
    ('NC5306O-SQ',     'Sydney Square Ottoman',                 'Sydney 5306', 'Wicker', 'wicker'),
    ('NC5306ET-SQ',    'Sydney Square End Table',               'Sydney 5306', 'Wicker', 'wicker'),
    ('NC5306CT-REC',   'Sydney Rectangle Coffee Table',         'Sydney 5306', 'Wicker', 'wicker'),
    ('NC5306CT-SQ',    'Sydney Square Cube Coffee Table',       'Sydney 5306', 'Wicker', 'wicker'),
    ('NC5306SCM',      'Sydney Sectional Middle Armless',       'Sydney 5306', 'Wicker', 'wicker'),
    ('NC5306LL',       'Sydney Sectional Left Arm Loveseat',    'Sydney 5306', 'Wicker', 'wicker'),
    ('NC5306RL',       'Sydney Sectional Right Arm Loveseat',   'Sydney 5306', 'Wicker', 'wicker'),
    ('NC5306SCC-90',   'Sydney Sectional Corner Chair',         'Sydney 5306', 'Wicker', 'wicker'),

    # --- Tuscino: collection + material ---
    ('NC2001O-SQ',     'Tuscino Square Ottoman',                'Tuscino', 'Aluminum', 'aluminum'),
    ('NC2001SCC',      'Tuscino Modular Corner',                'Tuscino', 'Aluminum', 'aluminum'),
    ('NC2001SCM',      'Tuscino Modular Armless Middle Chair',  'Tuscino', 'Aluminum', 'aluminum'),
    ('NC2001OT-SQ',    'Tuscino Square Ottoman',                'Tuscino', 'Aluminum', 'aluminum'),
    ('NC2001CUB-MED',  'Tuscino Cube Ottoman Medium',           'Tuscino', 'Aluminum', 'aluminum'),
    ('NC2001CUBE-SM',  'Tuscino Cube Ottoman Small',            'Tuscino', 'Aluminum', 'aluminum'),

    # --- Chalfonte: collection + material ---
    ('NC2685DC',       'Chalfonte Dining Chair',                'Chalfonte', 'Aluminum', 'aluminum'),
    ('NC2685SWDC',     'Chalfonte Swivel Rocker Dining Chair',  'Chalfonte', 'Aluminum', 'aluminum'),
    ('NC2685BS-CH',    'Chalfonte Counter Height Stool',        'Chalfonte', 'Aluminum', 'aluminum'),
    ('NC2685DLS',      'Chalfonte Dining Loveseat Bench',       'Chalfonte', 'Aluminum', 'aluminum'),
    ('NC2685SACL',     'Chalfonte Single Adjustable Chaise Lounge','Chalfonte', 'Aluminum', 'aluminum'),
    ('NC2685DT33-SQ-DRB-DH',  'Chalfonte Square Dining Table 33"',            'Chalfonte', 'Aluminum', 'aluminum'),
    ('NC2685DT41-SQ-DRB-DH',  'Chalfonte Square Dining Table 41"',            'Chalfonte', 'Aluminum', 'aluminum'),
    ('NC2685DT72-REC-DRB-DH', 'Chalfonte Rectangle Dining Table 72"',         'Chalfonte', 'Aluminum', 'aluminum'),
    ('NC2685DT83-REC-DRB-DH', 'Chalfonte Rectangle Dining Table 83"',         'Chalfonte', 'Aluminum', 'aluminum'),
    ('NC2685CH33-SQ-DRB',     'Chalfonte Square Counter Height Table 33"',    'Chalfonte', 'Aluminum', 'aluminum'),
    ('NC2685CH41-SQ-DRB',     'Chalfonte Square Counter Height Table 41"',    'Chalfonte', 'Aluminum', 'aluminum'),
    ('NC2685CH72-REC-DRB',    'Chalfonte Rectangle Counter Height Table 72"', 'Chalfonte', 'Aluminum', 'aluminum'),

    # --- Fire Tables: fix names (size to end) + collection + material ---
    ('NC5319R-42-CAL',    'Cal Sil Fire Table Round 42"',              'Fire Tables', 'Aluminum', 'aluminum'),
    ('NC5319RCT-48-CAL',  'Cal Sil Fire Table Rectangle 48" x 32"',   'Fire Tables', 'Aluminum', 'aluminum'),
    ('NC5314R-42',        'Woven Fire Table Round 42"',                'Fire Tables', 'Aluminum', 'aluminum'),
    ('NC5314RCT',         'Woven Fire Table Rectangle 48"',            'Fire Tables', 'Aluminum', 'aluminum'),
]

for sku, new_name, collection, material, material_slug in updates:
    cur.execute("""
        SELECT products.id, products.name, products.collection FROM products
        JOIN manufacturers m ON products.manufacturer_id = m.id
        WHERE m.id = %s AND products.sku = %s
    """, (MANUFACTURER_ID, sku))
    row = cur.fetchone()
    if row:
        pid, curr_name, curr_coll = row
        name_to_set = new_name if new_name else curr_name
        log(f"  UPDATE {sku}: name='{name_to_set}' collection='{collection}' material='{material}'")
        if not DRY_RUN:
            cur.execute("""
                UPDATE products SET
                    name = %s,
                    collection = %s,
                    material = %s,
                    material_slug = %s,
                    updated_at = NOW()
                WHERE id = %s
            """, (name_to_set, collection, material, material_slug, pid))
    else:
        log(f"  SKIP (not found): {sku}")

# Tuscino SKU fix: NC2001O-SQ -> NC2001OT-SQ
log("\n--- Tuscino Square Ottoman SKU fix ---")
cur.execute("""
    SELECT products.id FROM products
    JOIN manufacturers m ON products.manufacturer_id = m.id
    WHERE m.id = %s AND products.sku = 'NC2001O-SQ'
""", (MANUFACTURER_ID,))
row = cur.fetchone()
if row:
    log(f"  UPDATE NC2001O-SQ -> NC2001OT-SQ (id={row[0]})")
    if not DRY_RUN:
        cur.execute("""
            UPDATE products SET sku = 'NC2001OT-SQ', updated_at = NOW()
            WHERE id = %s
        """, (row[0],))
else:
    log("  SKIP: NC2001O-SQ not found (may already be corrected)")

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3: INSERT missing products
# ─────────────────────────────────────────────────────────────────────────────

log("\n=== SECTION 3: INSERT missing products ===")

def insert_product(sku, name, collection, category_id, material, material_slug, dimensions=None, tags=None):
    import json as _json
    cur.execute("""
        SELECT products.id FROM products
        JOIN manufacturers m ON products.manufacturer_id = m.id
        WHERE m.id = %s AND products.sku = %s
    """, (MANUFACTURER_ID, sku))
    if cur.fetchone():
        log(f"  SKIP (already exists): {sku}")
        return
    tags_json = _json.dumps(tags or [])
    log(f"  INSERT {sku} | {name} | {collection}")
    if not DRY_RUN:
        cur.execute("""
            INSERT INTO products (
                manufacturer_id, sku, name, collection,
                category_id, material, material_slug,
                dimensions, tags,
                pricing_mode, quote_only, available_online,
                show_price_online, in_store_only, featured,
                is_active, display_order, low_stock_threshold,
                created_at, updated_at
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s, %s,
                %s, %s,
                'fixed', true, false,
                false, false, false,
                true, 0, 0,
                NOW(), NOW()
            )
        """, (
            MANUFACTURER_ID, sku, name, collection,
            category_id, material, material_slug,
            dimensions, tags_json
        ))

# --- Hixon 6400 Dining (deep seating already on site, updated above) ---
insert_product('NC2685DT-TN-33', 'Hixon Square Dining Table 33"',    'Hixon 6400', CAT_DINING, 'Aluminum', 'aluminum', '33" x 33" x 29" H', ['Hixon 6400','Mixed Media Aluminum','Dining'])
insert_product('NC2685DT-TN-41', 'Hixon Square Dining Table 41"',    'Hixon 6400', CAT_DINING, 'Aluminum', 'aluminum', '41" x 41" x 29" H', ['Hixon 6400','Mixed Media Aluminum','Dining'])
insert_product('NC2685DT-TN-72', 'Hixon Rectangle Dining Table 72"', 'Hixon 6400', CAT_DINING, 'Aluminum', 'aluminum', '72" x 41" x 29" H', ['Hixon 6400','Mixed Media Aluminum','Dining'])
insert_product('NC2685DT-TN-83', 'Hixon Rectangle Dining Table 83"', 'Hixon 6400', CAT_DINING, 'Aluminum', 'aluminum', '83" x 41" x 29" H', ['Hixon 6400','Mixed Media Aluminum','Dining'])
insert_product('C6400DC-TAN',    'Hixon Dining Chair',                'Hixon 6400', CAT_DINING, 'Aluminum', 'aluminum', '26" x 22" x 34.6" H', ['Hixon 6400','Mixed Media Aluminum','Dining'])

# --- Valencia 6500 (brand new in 2026) ---
insert_product('NC65003S-TAN',  'Valencia Sofa',                        'Valencia 6500', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '80.3" x 33" x 38" H', ['Valencia 6500','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6500LS-TAN',  'Valencia Loveseat',                    'Valencia 6500', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '55.1" x 33" x 38" H', ['Valencia 6500','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6500C-TAN',   'Valencia Lounge Chair',                 'Valencia 6500', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '30" x 33" x 38" H',   ['Valencia 6500','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6500SR-TAN',  'Valencia Swivel Rocker',                'Valencia 6500', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '30" x 33" x 38" H',   ['Valencia 6500','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6500SCM',     'Valencia Sectional Middle Armless',    'Valencia 6500', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '25.2" x 32.8" x 38" H',['Valencia 6500','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6500LL-TAN',  'Valencia Sectional Left Arm Loveseat', 'Valencia 6500', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '52.6" x 32.8" x 38" H',['Valencia 6500','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6500RL-TAN',  'Valencia Sectional Right Arm Loveseat','Valencia 6500', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '52.6" x 32.8" x 38" H',['Valencia 6500','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6500SCC-TAN', 'Valencia Sectional 90 Degree Corner',  'Valencia 6500', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '32.8" x 32.8" x 38" H',['Valencia 6500','Mixed Media Aluminum','Deep Seating'])

# --- Nassau 2676 ---
insert_product('NC26763S',  'Nassau Sofa',                        'Nassau 2676', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '81" x 30.5" x 28.7" H', ['Nassau 2676','Mixed Media Aluminum','Deep Seating'])
insert_product('NC2676LS',  'Nassau Loveseat',                    'Nassau 2676', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '56" x 30.5" x 28.7" H', ['Nassau 2676','Mixed Media Aluminum','Deep Seating'])
insert_product('NC2676C',   'Nassau Lounge Chair',                 'Nassau 2676', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '31" x 30.5" x 28.7" H', ['Nassau 2676','Mixed Media Aluminum','Deep Seating'])
insert_product('NC2676SR',  'Nassau Swivel Rocker',                'Nassau 2676', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '31" x 30.5" x 28.7" H', ['Nassau 2676','Mixed Media Aluminum','Deep Seating'])
insert_product('NC2676SCM', 'Nassau Sectional Middle Armless',    'Nassau 2676', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '25.2" x 31.5" x 28.7" H',['Nassau 2676','Mixed Media Aluminum','Deep Seating'])
insert_product('NC2676LL',  'Nassau Sectional Left Arm Loveseat', 'Nassau 2676', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '53" x 31.5" x 28.7" H', ['Nassau 2676','Mixed Media Aluminum','Deep Seating'])
insert_product('NC2676RL',  'Nassau Sectional Right Arm Loveseat','Nassau 2676', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '53" x 31.5" x 28.7" H', ['Nassau 2676','Mixed Media Aluminum','Deep Seating'])
insert_product('NC2676SCC', 'Nassau Sectional 90 Degree Corner',  'Nassau 2676', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '31.5" x 31.5" x 28.7" H',['Nassau 2676','Mixed Media Aluminum','Deep Seating'])

# --- Sedona 6600 (brand new in 2026) ---
insert_product('NC66003S',  'Sedona Sofa',                        'Sedona 6600', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '80.3" x 33" x 28.7" H', ['Sedona 6600','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6600LS',  'Sedona Loveseat',                    'Sedona 6600', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '55.1" x 33" x 28.7" H', ['Sedona 6600','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6600C',   'Sedona Lounge Chair',                 'Sedona 6600', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '30" x 33" x 28.7" H',   ['Sedona 6600','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6600SR',  'Sedona Swivel Rocker',                'Sedona 6600', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '30" x 33" x 28.7" H',   ['Sedona 6600','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6600LL',  'Sedona Sectional Left Arm Loveseat', 'Sedona 6600', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '52.6" x 32.8" x 28.7" H',['Sedona 6600','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6600RL',  'Sedona Sectional Right Arm Loveseat','Sedona 6600', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '52.6" x 32.8" x 28.7" H',['Sedona 6600','Mixed Media Aluminum','Deep Seating'])
insert_product('C6600DC',   'Sedona Dining Chair',                 'Sedona 6600', CAT_DINING,       'Aluminum', 'aluminum', '26" x 22" x 34.6" H',   ['Sedona 6600','Mixed Media Aluminum','Dining'])

# --- Chesapeake Bay 6701 (brand new in 2026) ---
insert_product('NC674013S',  'Chesapeake Bay Sofa',                    'Chesapeake Bay 6701', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '78" x 31" x 27" H',    ['Chesapeake Bay 6701','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6701-LS',  'Chesapeake Bay Loveseat',                'Chesapeake Bay 6701', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '53" x 31" x 27" H',    ['Chesapeake Bay 6701','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6701C',    'Chesapeake Bay Lounge Chair',             'Chesapeake Bay 6701', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '28" x 31" x 27" H',    ['Chesapeake Bay 6701','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6701SR',   'Chesapeake Bay Swivel Rocker',            'Chesapeake Bay 6701', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '28" x 31" x 27" H',    ['Chesapeake Bay 6701','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6701O-REC','Chesapeake Bay Ottoman',                  'Chesapeake Bay 6701', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '28" x 20" x 15" H',    ['Chesapeake Bay 6701','Mixed Media Aluminum','Deep Seating'])
insert_product('NC6701-RET', 'Chesapeake Bay Round Slat End Table',     'Chesapeake Bay 6701', CAT_COFFEE_SIDE,  'Aluminum', 'aluminum', '19" x 19" x 22" H',    ['Chesapeake Bay 6701','Mixed Media Aluminum','Coffee & Side Tables'])
insert_product('NC6701RCT',  'Chesapeake Bay Round Slat Coffee Table',  'Chesapeake Bay 6701', CAT_COFFEE_SIDE,  'Aluminum', 'aluminum', '36" x 36" x 18" H',    ['Chesapeake Bay 6701','Mixed Media Aluminum','Coffee & Side Tables'])

# --- Hixon 6401 Chaises ---
insert_product('NC6401-ACL',  'Hixon Arm Chaise',     'Hixon 6400', CAT_CHAISE, 'Aluminum', 'aluminum', '80" x 30" x 14" H; Bed Width: 26"', ['Hixon 6400','Mixed Media Aluminum','Chaise Lounges'])
insert_product('NC6401-SACL', 'Hixon Armless Chaise', 'Hixon 6400', CAT_CHAISE, 'Aluminum', 'aluminum', '80" x 26" x 14" H',                 ['Hixon 6400','Mixed Media Aluminum','Chaise Lounges'])

# --- Fire Tables: 2 new Tangent Top variants ---
insert_product('NC5319R-42-TAN',   'Cal Sil Fire Table Round 42" Tangent Top',           'Fire Tables', CAT_FIRE_TABLES, 'Aluminum', 'aluminum', '42" Dia. x 25" H; 45,000 BTU', ['Fire Tables','Aluminum','Fire Tables'])
insert_product('NC5319RCT-48-TAN', 'Cal Sil Fire Table Rectangle 48" x 32" Tangent Top', 'Fire Tables', CAT_FIRE_TABLES, 'Aluminum', 'aluminum', '48" x 32" x 25" H; 25,000 BTU', ['Fire Tables','Aluminum','Fire Tables'])

# --- Universal companion pieces ---
insert_product('NC415HBSG-P', 'Universal High Back Swivel Glider Premium', 'Bainbridge', CAT_DEEP_SEATING, 'Wicker', 'wicker', '30" x 33" x 39" H', ['Bainbridge','Wicker','Deep Seating'])
insert_product('NC415RX',     'Universal Recliner',                        'Bainbridge', CAT_DEEP_SEATING, 'Wicker', 'wicker', '31" x 33" x 39" H', ['Bainbridge','Wicker','Deep Seating'])
insert_product('NC415RX-P',   'Universal Recliner Premium Weave',          'Bainbridge', CAT_DEEP_SEATING, 'Wicker', 'wicker', '31" x 33" x 39" H', ['Bainbridge','Wicker','Deep Seating'])

# --- Biscayne 6510 glass top variants ---
insert_product('NC6510R-CHT-GL',  'Biscayne Rotating Chat Table Glass Top',     'Biscayne 6510', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '36" Dia.',  ['Biscayne 6510','Wicker','Coffee & Side Tables'])
insert_product('NC6510ET-SQ-GL',  'Biscayne Square End Table Glass Top',        'Biscayne 6510', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '22" x 22"', ['Biscayne 6510','Wicker','Coffee & Side Tables'])
insert_product('NC6510CT-REC-GL', 'Biscayne Rectangular Coffee Table Glass Top','Biscayne 6510', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '34" x 24"', ['Biscayne 6510','Wicker','Coffee & Side Tables'])

# --- Bainbridge glass top variants ---
insert_product('NC275ET-SQ-GL',  'Bainbridge End Table Glass Top',               'Bainbridge', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '20" x 20"', ['Bainbridge','Wicker','Coffee & Side Tables'])
insert_product('NC275CT-SQ-GL',  'Bainbridge Square Coffee Table Glass Top',     'Bainbridge', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '32" x 32"', ['Bainbridge','Wicker','Coffee & Side Tables'])
insert_product('NC275CT-REC-GL', 'Bainbridge Rectangular Coffee Table Glass Top','Bainbridge', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '44" x 28"', ['Bainbridge','Wicker','Coffee & Side Tables'])

# --- Grand Stafford glass top variants ---
insert_product('NC4331CT-REC-GL', 'Grand Stafford Coffee Table Glass Top', 'Grand Stafford', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '44" x 28"', ['Grand Stafford','Wicker','Coffee & Side Tables'])
insert_product('NC4331ET-SQ-GL',  'Grand Stafford End Table Glass Top',    'Grand Stafford', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '22" x 22"', ['Grand Stafford','Wicker','Coffee & Side Tables'])

# --- Lakeside glass top variants ---
insert_product('NC4302CET-GL',    'Lakeside Corner End Table Glass Top',           'Lakeside', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '32.5" x 32.5"', ['Lakeside','Wicker','Coffee & Side Tables'])
insert_product('NC4302CT-REC-GL', 'Lakeside Rectangular Coffee Table Glass Top',  'Lakeside', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '43.3" x 27.6"', ['Lakeside','Wicker','Coffee & Side Tables'])
insert_product('NC4302CT-SQ-GL',  'Lakeside Square Coffee Table Glass Top',       'Lakeside', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '32" x 32"',     ['Lakeside','Wicker','Coffee & Side Tables'])
insert_product('NC4302ET-SQ-GL',  'Lakeside End Table Glass Top',                 'Lakeside', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '20" x 20"',     ['Lakeside','Wicker','Coffee & Side Tables'])

# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
log(f"\n=== SUMMARY ===")
log(f"DRY_RUN = {DRY_RUN}")
log(f"Total changes logged: {len(changes)}")

if DRY_RUN:
    conn.rollback()
    log("ROLLED BACK (dry run)")
else:
    conn.commit()
    log("COMMITTED")

cur.close()
conn.close()
