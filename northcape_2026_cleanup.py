import os, json
import psycopg2
from psycopg2.extras import execute_values

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

DRY_RUN = False  # Set to False to commit

MANUFACTURER_ID = 17  # NorthCape

# Category IDs
CAT_DEEP_SEATING = 43
CAT_DINING       = 44
CAT_FIRE_TABLES  = 45
CAT_COFFEE_SIDE  = 46
CAT_BAR          = 47
CAT_CHAISE       = 42

changes = []
def log(msg):
    changes.append(msg)
    print(msg)

# Look up material IDs dynamically
cur.execute("SELECT slug, id FROM materials")
MAT = {row[0]: row[1] for row in cur.fetchall()}
log(f"Materials available: {MAT}")

def assign_material(product_ids, material_slugs):
    if not product_ids or not material_slugs:
        return
    rows = [(pid, MAT[ms]) for pid in product_ids for ms in material_slugs if ms in MAT]
    if not rows:
        log(f"  WARNING: no matching material slugs in {material_slugs}")
        return
    log(f"  Assigning materials {material_slugs} to {len(product_ids)} products ({len(rows)} rows)")
    if not DRY_RUN:
        execute_values(cur, """
            INSERT INTO product_materials (product_id, material_id)
            VALUES %s
            ON CONFLICT (product_id, material_id) DO NOTHING
        """, rows)

def get_id(sku):
    cur.execute("""
        SELECT products.id FROM products
        JOIN manufacturers m ON products.manufacturer_id = m.id
        WHERE m.id = %s AND products.sku = %s
    """, (MANUFACTURER_ID, sku))
    row = cur.fetchone()
    return row[0] if row else None

def get_ids_by_collection(collection):
    cur.execute("""
        SELECT products.id FROM products
        JOIN manufacturers m ON products.manufacturer_id = m.id
        WHERE m.id = %s AND products.collection = %s
    """, (MANUFACTURER_ID, collection))
    return [r[0] for r in cur.fetchall()]

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 1: DELETE products
# ─────────────────────────────────────────────────────────────────────────────
log("\n=== SECTION 1: DELETE products ===")

# Old Hixon 6300 series -- superseded by 6400
# Old Chalfonte SKUs -- superseded by Duraboard versions
# Chalfonte deep seating -- NOT in 2026 catalog
# Duplicate Tuscino ottoman (old SKU)
to_delete = [
    # Old 6300 Hixon
    'NC63003S-TAN','NC6300C-TAN','NC6300CET-TAN','NC6300CT-REC-TAN',
    'NC6300DC-TAN','NC6300LL-TAN','NC6300LS-TAN','NC6300NET-TAN',
    'NC6300O-TAN','NC6300RL-TAN','NC6300SCC-90','NC6300SCM',
    'NC6300SR-TAN','NC6790CVT-REC-TAN','NC6791CVT-REC-TAN',
    # Old Chalfonte dining SKUs
    'NC2685DT-SQ-33','NC2685DT-SQ-41','NC2685DT-REC-72','NC2685DT-REC-83',
    # Chalfonte deep seating not in 2026 catalog
    'NC2685CAA','NC26853SAA','NC2685LSAA','NC2685LLAA','NC2685L3SAA',
    'NC2685RLAA','NC2685R3SAA','NC2685SCC','NC2685SCM','NC2685SGAA',
    # Duplicate Tuscino ottoman (old SKU -- NC2001OT-SQ is the correct one)
    'NC2001O-SQ',
]

for sku in to_delete:
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
# SECTION 2: UPDATE existing products -- name and collection only
# ─────────────────────────────────────────────────────────────────────────────
log("\n=== SECTION 2: UPDATE name and collection on existing products ===")

# Format: (sku, new_name, new_collection)
updates = [
    # --- Biscayne 6510 ---
    ('NC65103S',      'Biscayne Sofa',                        'Biscayne 6510'),
    ('NC6510C',       'Biscayne Lounge Chair',                 'Biscayne 6510'),
    ('NC6510LS',      'Biscayne Loveseat',                     'Biscayne 6510'),
    ('NC6510SR',      'Biscayne Swivel Rocker',                'Biscayne 6510'),
    ('NC6510O-REC',   'Biscayne Ottoman',                      'Biscayne 6510'),
    ('NC6510R-CHT',   'Biscayne Rotating Chat Table',          'Biscayne 6510'),
    ('NC6510CT-REC',  'Biscayne Rectangular Coffee Table',     'Biscayne 6510'),
    ('NC6510ET-SQ',   'Biscayne Square End Table',             'Biscayne 6510'),

    # --- Hixon 6400 deep seating ---
    ('NC64003S-TAN',    'Hixon Sofa',                          'Hixon 6400'),
    ('NC6400LS-TAN',    'Hixon Loveseat',                      'Hixon 6400'),
    ('NC6400C-TAN',     'Hixon Lounge Chair',                  'Hixon 6400'),
    ('NC6400SR-TAN',    'Hixon Swivel Rocker',                 'Hixon 6400'),
    ('NC6400O-REC-TAN', 'Hixon Ottoman',                       'Hixon 6400'),
    ('NC6400NET-TAN',   'Hixon Slat Nesting Tables',           'Hixon 6400'),
    ('NC6400CT-TAN',    'Hixon Slat Coffee Table',             'Hixon 6400'),
    ('NC6400CET-TAN',   'Hixon Sectional Corner End Table',    'Hixon 6400'),
    ('NC6400SCM',       'Hixon Sectional Middle Armless',      'Hixon 6400'),
    ('NC6400LL-TAN',    'Hixon Sectional Left Arm Loveseat',   'Hixon 6400'),
    ('NC6400RL-TAN',    'Hixon Sectional Right Arm Loveseat',  'Hixon 6400'),
    ('NC6400SCC-TAN',   'Hixon Sectional 90 Degree Corner',   'Hixon 6400'),
    ('NC6400DC-TAN',    'Hixon Dining Chair',                  'Hixon 6400'),

    # --- Bainbridge ---
    ('NC2753S',      'Bainbridge Sofa',                        'Bainbridge'),
    ('NC275LS',      'Bainbridge Loveseat',                    'Bainbridge'),
    ('NC275C',       'Bainbridge Club Chair',                  'Bainbridge'),
    ('NC275SG',      'Bainbridge Swivel Glider Club Chair',    'Bainbridge'),
    ('NC275LL',      'Bainbridge Sectional Left Arm Loveseat', 'Bainbridge'),
    ('NC275RL',      'Bainbridge Sectional Right Arm Loveseat','Bainbridge'),
    ('NC275SCC',     'Bainbridge Sectional Corner Chair',      'Bainbridge'),
    ('NC275SCC-45',  'Bainbridge Sectional 45 Degree Corner',  'Bainbridge'),
    ('NC275SCM',     'Bainbridge Sectional Middle Chair',      'Bainbridge'),
    ('NC275O-REC',   'Bainbridge Rectangular Ottoman',         'Bainbridge'),
    ('NC275O-SQ',    'Bainbridge Square Ottoman',              'Bainbridge'),
    ('NC275ET-SQ',   'Bainbridge Square End Table',            'Bainbridge'),
    ('NC275CT-SQ',   'Bainbridge Square Coffee Table',         'Bainbridge'),
    ('NC275CT-REC',  'Bainbridge Rectangular Coffee Table',    'Bainbridge'),
    ('NC275CET',     'Bainbridge Corner End Table',            'Bainbridge'),

    # --- Grand Stafford (fix truncated collection name) ---
    ('NC43313S',     'Grand Stafford Sofa',                    'Grand Stafford'),
    ('NC4331LS',     'Grand Stafford Loveseat',                'Grand Stafford'),
    ('NC4331C',      'Grand Stafford Lounge Chair',            'Grand Stafford'),
    ('NC4331O-REC',  'Grand Stafford Rectangular Ottoman',     'Grand Stafford'),
    ('NC4331CT-REC', 'Grand Stafford Rectangular Coffee Table','Grand Stafford'),
    ('NC4331ET-SQ',  'Grand Stafford Square End Table',        'Grand Stafford'),

    # --- Lakeside (fix doubled "Sectional" names) ---
    ('NC43023S',     'Lakeside Sofa',                          'Lakeside'),
    ('NC4302LS',     'Lakeside Loveseat',                      'Lakeside'),
    ('NC4302C',      'Lakeside Club Chair',                    'Lakeside'),
    ('NC4302SG',     'Lakeside Swivel Glider',                 'Lakeside'),
    ('NC4302LL',     'Lakeside Sectional Left Arm Loveseat',   'Lakeside'),
    ('NC4302RL',     'Lakeside Sectional Right Arm Loveseat',  'Lakeside'),
    ('NC4302SCC',    'Lakeside Sectional Corner Chair',        'Lakeside'),
    ('NC4302SCC-45', 'Lakeside Sectional 45 Degree Corner',    'Lakeside'),
    ('NC4302SCM',    'Lakeside Sectional Middle Chair',        'Lakeside'),
    ('NC4302O-REC',  'Lakeside Rectangular Ottoman',           'Lakeside'),
    ('NC4302O-SQ',   'Lakeside Square Ottoman',                'Lakeside'),
    ('NC4302CET',    'Lakeside Corner End Table',              'Lakeside'),
    ('NC4302CT-REC', 'Lakeside Rectangular Coffee Table',      'Lakeside'),
    ('NC4302CT-SQ',  'Lakeside Square Coffee Table',           'Lakeside'),
    ('NC4302ET-SQ',  'Lakeside Square End Table',              'Lakeside'),

    # --- Sydney 5306 ---
    ('NC53063S',     'Sydney Sofa',                            'Sydney 5306'),
    ('NC5306LS',     'Sydney Loveseat',                        'Sydney 5306'),
    ('NC5306C',      'Sydney Lounge Chair',                    'Sydney 5306'),
    ('NC5306SG',     'Sydney Swivel Glider',                   'Sydney 5306'),
    ('NC5306O-SQ',   'Sydney Square Ottoman',                  'Sydney 5306'),
    ('NC5306ET-SQ',  'Sydney Square End Table',                'Sydney 5306'),
    ('NC5306CT-REC', 'Sydney Rectangle Coffee Table',          'Sydney 5306'),
    ('NC5306CT-SQ',  'Sydney Square Cube Coffee Table',        'Sydney 5306'),
    ('NC5306SCM',    'Sydney Sectional Middle Armless',        'Sydney 5306'),
    ('NC5306LL',     'Sydney Sectional Left Arm Loveseat',     'Sydney 5306'),
    ('NC5306RL',     'Sydney Sectional Right Arm Loveseat',    'Sydney 5306'),
    ('NC5306SCC-90', 'Sydney Sectional Corner Chair',          'Sydney 5306'),

    # --- Tuscino ---
    ('NC2001OT-SQ',    'Tuscino Square Ottoman',               'Tuscino'),
    ('NC2001SCC',      'Tuscino Modular Corner',               'Tuscino'),
    ('NC2001SCM',      'Tuscino Modular Armless Middle Chair', 'Tuscino'),
    ('NC2001CUB-MED',  'Tuscino Cube Ottoman Medium',          'Tuscino'),
    ('NC2001CUBE-SM',  'Tuscino Cube Ottoman Small',           'Tuscino'),

    # --- Chalfonte ---
    ('NC2685DC',               'Chalfonte Dining Chair',                      'Chalfonte'),
    ('NC2685SWDC',             'Chalfonte Swivel Rocker Dining Chair',        'Chalfonte'),
    ('NC2685BS-CH',            'Chalfonte Counter Height Stool',              'Chalfonte'),
    ('NC2685DLS',              'Chalfonte Dining Loveseat Bench',             'Chalfonte'),
    ('NC2685SACL',             'Chalfonte Single Adjustable Chaise Lounge',   'Chalfonte'),
    ('NC2685DT33-SQ-DRB-DH',  'Chalfonte Square Dining Table 33"',           'Chalfonte'),
    ('NC2685DT41-SQ-DRB-DH',  'Chalfonte Square Dining Table 41"',           'Chalfonte'),
    ('NC2685DT72-REC-DRB-DH', 'Chalfonte Rectangle Dining Table 72"',        'Chalfonte'),
    ('NC2685DT83-REC-DRB-DH', 'Chalfonte Rectangle Dining Table 83"',        'Chalfonte'),
    ('NC2685CH33-SQ-DRB',     'Chalfonte Square Counter Height Table 33"',   'Chalfonte'),
    ('NC2685CH41-SQ-DRB',     'Chalfonte Square Counter Height Table 41"',   'Chalfonte'),
    ('NC2685CH72-REC-DRB',    'Chalfonte Rectangle Counter Height Table 72"','Chalfonte'),

    # --- Fire Tables (fix names, set collection) ---
    ('NC5319R-42-CAL',   'Cal Sil Fire Table Round 42"',             'Fire Tables'),
    ('NC5319RCT-48-CAL', 'Cal Sil Fire Table Rectangle 48" x 32"',  'Fire Tables'),
    ('NC5314R-42',       'Woven Fire Table Round 42"',               'Fire Tables'),
    ('NC5314RCT',        'Woven Fire Table Rectangle 48"',           'Fire Tables'),
]

for sku, new_name, collection in updates:
    cur.execute("""
        SELECT products.id FROM products
        JOIN manufacturers m ON products.manufacturer_id = m.id
        WHERE m.id = %s AND products.sku = %s
    """, (MANUFACTURER_ID, sku))
    row = cur.fetchone()
    if row:
        log(f"  UPDATE {sku}: name='{new_name}' collection='{collection}'")
        if not DRY_RUN:
            cur.execute("""
                UPDATE products SET name = %s, collection = %s, updated_at = NOW()
                WHERE id = %s
            """, (new_name, collection, row[0]))
    else:
        log(f"  SKIP (not found): {sku}")

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3: INSERT missing products
# ─────────────────────────────────────────────────────────────────────────────
log("\n=== SECTION 3: INSERT missing products ===")

new_products = []  # collect (sku, name, collection, category_id, dimensions, tags, material_slug)

def ins(sku, name, collection, category_id, dims, tags, mat_slug):
    new_products.append((sku, name, collection, category_id, dims, tags, mat_slug))

# --- Hixon 6400 Dining ---
ins('NC2685DT-TN-33', 'Hixon Square Dining Table 33"',    'Hixon 6400', CAT_DINING, '33" x 33" x 29" H', ['Hixon 6400','Mixed Media Aluminum','Dining Tables'], 'aluminum')
ins('NC2685DT-TN-41', 'Hixon Square Dining Table 41"',    'Hixon 6400', CAT_DINING, '41" x 41" x 29" H', ['Hixon 6400','Mixed Media Aluminum','Dining Tables'], 'aluminum')
ins('NC2685DT-TN-72', 'Hixon Rectangle Dining Table 72"', 'Hixon 6400', CAT_DINING, '72" x 41" x 29" H', ['Hixon 6400','Mixed Media Aluminum','Dining Tables'], 'aluminum')
ins('NC2685DT-TN-83', 'Hixon Rectangle Dining Table 83"', 'Hixon 6400', CAT_DINING, '83" x 41" x 29" H', ['Hixon 6400','Mixed Media Aluminum','Dining Tables'], 'aluminum')

# --- Valencia 6500 ---
ins('NC65003S-TAN',  'Valencia Sofa',                        'Valencia 6500', CAT_DEEP_SEATING, '80.3" x 33" x 38" H', ['Valencia 6500','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6500LS-TAN',  'Valencia Loveseat',                    'Valencia 6500', CAT_DEEP_SEATING, '55.1" x 33" x 38" H', ['Valencia 6500','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6500C-TAN',   'Valencia Lounge Chair',                 'Valencia 6500', CAT_DEEP_SEATING, '30" x 33" x 38" H',   ['Valencia 6500','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6500SR-TAN',  'Valencia Swivel Rocker',                'Valencia 6500', CAT_DEEP_SEATING, '30" x 33" x 38" H',   ['Valencia 6500','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6500SCM',     'Valencia Sectional Middle Armless',    'Valencia 6500', CAT_DEEP_SEATING, '25.2" x 32.8" x 38" H',['Valencia 6500','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6500LL-TAN',  'Valencia Sectional Left Arm Loveseat', 'Valencia 6500', CAT_DEEP_SEATING, '52.6" x 32.8" x 38" H',['Valencia 6500','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6500RL-TAN',  'Valencia Sectional Right Arm Loveseat','Valencia 6500', CAT_DEEP_SEATING, '52.6" x 32.8" x 38" H',['Valencia 6500','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6500SCC-TAN', 'Valencia Sectional 90 Degree Corner',  'Valencia 6500', CAT_DEEP_SEATING, '32.8" x 32.8" x 38" H',['Valencia 6500','Mixed Media Aluminum','Deep Seating'], 'aluminum')

# --- Nassau 2676 ---
ins('NC26763S',  'Nassau Sofa',                        'Nassau 2676', CAT_DEEP_SEATING, '81" x 30.5" x 28.7" H', ['Nassau 2676','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC2676LS',  'Nassau Loveseat',                    'Nassau 2676', CAT_DEEP_SEATING, '56" x 30.5" x 28.7" H', ['Nassau 2676','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC2676C',   'Nassau Lounge Chair',                 'Nassau 2676', CAT_DEEP_SEATING, '31" x 30.5" x 28.7" H', ['Nassau 2676','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC2676SR',  'Nassau Swivel Rocker',                'Nassau 2676', CAT_DEEP_SEATING, '31" x 30.5" x 28.7" H', ['Nassau 2676','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC2676SCM', 'Nassau Sectional Middle Armless',    'Nassau 2676', CAT_DEEP_SEATING, '25.2" x 31.5" x 28.7" H',['Nassau 2676','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC2676LL',  'Nassau Sectional Left Arm Loveseat', 'Nassau 2676', CAT_DEEP_SEATING, '53" x 31.5" x 28.7" H', ['Nassau 2676','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC2676RL',  'Nassau Sectional Right Arm Loveseat','Nassau 2676', CAT_DEEP_SEATING, '53" x 31.5" x 28.7" H', ['Nassau 2676','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC2676SCC', 'Nassau Sectional 90 Degree Corner',  'Nassau 2676', CAT_DEEP_SEATING, '31.5" x 31.5" x 28.7" H',['Nassau 2676','Mixed Media Aluminum','Deep Seating'], 'aluminum')

# --- Sedona 6600 ---
ins('NC66003S',  'Sedona Sofa',                        'Sedona 6600', CAT_DEEP_SEATING, '80.3" x 33" x 28.7" H', ['Sedona 6600','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6600LS',  'Sedona Loveseat',                    'Sedona 6600', CAT_DEEP_SEATING, '55.1" x 33" x 28.7" H', ['Sedona 6600','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6600C',   'Sedona Lounge Chair',                 'Sedona 6600', CAT_DEEP_SEATING, '30" x 33" x 28.7" H',   ['Sedona 6600','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6600SR',  'Sedona Swivel Rocker',                'Sedona 6600', CAT_DEEP_SEATING, '30" x 33" x 28.7" H',   ['Sedona 6600','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6600LL',  'Sedona Sectional Left Arm Loveseat', 'Sedona 6600', CAT_DEEP_SEATING, '52.6" x 32.8" x 28.7" H',['Sedona 6600','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6600RL',  'Sedona Sectional Right Arm Loveseat','Sedona 6600', CAT_DEEP_SEATING, '52.6" x 32.8" x 28.7" H',['Sedona 6600','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('C6600DC',   'Sedona Dining Chair',                 'Sedona 6600', CAT_DINING,       '26" x 22" x 34.6" H',   ['Sedona 6600','Mixed Media Aluminum','Dining Chairs'], 'aluminum')

# --- Chesapeake Bay 6701 ---
ins('NC674013S',  'Chesapeake Bay Sofa',                   'Chesapeake Bay 6701', CAT_DEEP_SEATING, '78" x 31" x 27" H',  ['Chesapeake Bay 6701','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6701-LS',  'Chesapeake Bay Loveseat',               'Chesapeake Bay 6701', CAT_DEEP_SEATING, '53" x 31" x 27" H',  ['Chesapeake Bay 6701','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6701C',    'Chesapeake Bay Lounge Chair',            'Chesapeake Bay 6701', CAT_DEEP_SEATING, '28" x 31" x 27" H',  ['Chesapeake Bay 6701','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6701SR',   'Chesapeake Bay Swivel Rocker',           'Chesapeake Bay 6701', CAT_DEEP_SEATING, '28" x 31" x 27" H',  ['Chesapeake Bay 6701','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6701O-REC','Chesapeake Bay Ottoman',                 'Chesapeake Bay 6701', CAT_DEEP_SEATING, '28" x 20" x 15" H',  ['Chesapeake Bay 6701','Mixed Media Aluminum','Deep Seating'], 'aluminum')
ins('NC6701-RET', 'Chesapeake Bay Round Slat End Table',    'Chesapeake Bay 6701', CAT_COFFEE_SIDE,  '19" x 19" x 22" H',  ['Chesapeake Bay 6701','Mixed Media Aluminum','Coffee & Side Tables'], 'aluminum')
ins('NC6701RCT',  'Chesapeake Bay Round Slat Coffee Table', 'Chesapeake Bay 6701', CAT_COFFEE_SIDE,  '36" x 36" x 18" H',  ['Chesapeake Bay 6701','Mixed Media Aluminum','Coffee & Side Tables'], 'aluminum')

# --- Hixon 6401 Chaises ---
ins('NC6401-ACL',  'Hixon Arm Chaise',     'Hixon 6400', CAT_CHAISE, '80" x 30" x 14" H; Bed Width: 26"', ['Hixon 6400','Mixed Media Aluminum','Chaise Lounges'], 'aluminum')
ins('NC6401-SACL', 'Hixon Armless Chaise', 'Hixon 6400', CAT_CHAISE, '80" x 26" x 14" H',                 ['Hixon 6400','Mixed Media Aluminum','Chaise Lounges'], 'aluminum')

# --- Fire Tables: 2 new Tangent Top variants ---
ins('NC5319R-42-TAN',   'Cal Sil Fire Table Round 42" Tangent Top',            'Fire Tables', CAT_FIRE_TABLES, '42" Dia. x 25" H; 45,000 BTU', ['Fire Tables','Aluminum','Fire Tables'], 'aluminum')
ins('NC5319RCT-48-TAN', 'Cal Sil Fire Table Rectangle 48" x 32" Tangent Top',  'Fire Tables', CAT_FIRE_TABLES, '48" x 32" x 25" H; 25,000 BTU', ['Fire Tables','Aluminum','Fire Tables'], 'aluminum')

# --- Universal companion pieces ---
ins('NC415HBSG-P', 'Universal High Back Swivel Glider Premium', 'Bainbridge', CAT_DEEP_SEATING, '30" x 33" x 39" H', ['Bainbridge','Wicker','Deep Seating'], 'wicker')
ins('NC415RX',     'Universal Recliner',                        'Bainbridge', CAT_DEEP_SEATING, '31" x 33" x 39" H', ['Bainbridge','Wicker','Deep Seating'], 'wicker')
ins('NC415RX-P',   'Universal Recliner Premium Weave',          'Bainbridge', CAT_DEEP_SEATING, '31" x 33" x 39" H', ['Bainbridge','Wicker','Deep Seating'], 'wicker')

# --- Biscayne 6510 glass top variants ---
ins('NC6510R-CHT-GL',  'Biscayne Rotating Chat Table Glass Top',     'Biscayne 6510', CAT_COFFEE_SIDE, '36" Dia.',  ['Biscayne 6510','Wicker','Coffee & Side Tables'], 'wicker')
ins('NC6510ET-SQ-GL',  'Biscayne Square End Table Glass Top',        'Biscayne 6510', CAT_COFFEE_SIDE, '22" x 22"', ['Biscayne 6510','Wicker','Coffee & Side Tables'], 'wicker')
ins('NC6510CT-REC-GL', 'Biscayne Rectangular Coffee Table Glass Top','Biscayne 6510', CAT_COFFEE_SIDE, '34" x 24"', ['Biscayne 6510','Wicker','Coffee & Side Tables'], 'wicker')

# --- Bainbridge glass top variants ---
ins('NC275ET-SQ-GL',  'Bainbridge End Table Glass Top',               'Bainbridge', CAT_COFFEE_SIDE, '20" x 20"', ['Bainbridge','Wicker','Coffee & Side Tables'], 'wicker')
ins('NC275CT-SQ-GL',  'Bainbridge Square Coffee Table Glass Top',     'Bainbridge', CAT_COFFEE_SIDE, '32" x 32"', ['Bainbridge','Wicker','Coffee & Side Tables'], 'wicker')
ins('NC275CT-REC-GL', 'Bainbridge Rectangular Coffee Table Glass Top','Bainbridge', CAT_COFFEE_SIDE, '44" x 28"', ['Bainbridge','Wicker','Coffee & Side Tables'], 'wicker')

# --- Grand Stafford glass top variants ---
ins('NC4331CT-REC-GL', 'Grand Stafford Coffee Table Glass Top', 'Grand Stafford', CAT_COFFEE_SIDE, '44" x 28"', ['Grand Stafford','Wicker','Coffee & Side Tables'], 'wicker')
ins('NC4331ET-SQ-GL',  'Grand Stafford End Table Glass Top',    'Grand Stafford', CAT_COFFEE_SIDE, '22" x 22"', ['Grand Stafford','Wicker','Coffee & Side Tables'], 'wicker')

# --- Lakeside glass top variants ---
ins('NC4302CET-GL',    'Lakeside Corner End Table Glass Top',           'Lakeside', CAT_COFFEE_SIDE, '32.5" x 32.5"', ['Lakeside','Wicker','Coffee & Side Tables'], 'wicker')
ins('NC4302CT-REC-GL', 'Lakeside Rectangular Coffee Table Glass Top',  'Lakeside', CAT_COFFEE_SIDE, '43.3" x 27.6"', ['Lakeside','Wicker','Coffee & Side Tables'], 'wicker')
ins('NC4302CT-SQ-GL',  'Lakeside Square Coffee Table Glass Top',       'Lakeside', CAT_COFFEE_SIDE, '32" x 32"',     ['Lakeside','Wicker','Coffee & Side Tables'], 'wicker')
ins('NC4302ET-SQ-GL',  'Lakeside End Table Glass Top',                 'Lakeside', CAT_COFFEE_SIDE, '20" x 20"',     ['Lakeside','Wicker','Coffee & Side Tables'], 'wicker')

# Now run the inserts
inserted_ids = []
for sku, name, collection, category_id, dims, tags, mat_slug in new_products:
    cur.execute("""
        SELECT products.id FROM products
        JOIN manufacturers m ON products.manufacturer_id = m.id
        WHERE m.id = %s AND products.sku = %s
    """, (MANUFACTURER_ID, sku))
    if cur.fetchone():
        log(f"  SKIP (already exists): {sku}")
        continue
    log(f"  INSERT {sku} | {name} | {collection}")
    if not DRY_RUN:
        cur.execute("""
            INSERT INTO products (
                manufacturer_id, sku, name, collection,
                category_id, dimensions, tags,
                pricing_mode, quote_only, available_online,
                show_price_online, in_store_only, featured,
                is_active, display_order, low_stock_threshold,
                created_at, updated_at
            ) VALUES (
                %s, %s, %s, %s,
                %s, %s, %s,
                'fixed', true, false,
                false, false, false,
                true, 0, 0,
                NOW(), NOW()
            ) RETURNING id
        """, (MANUFACTURER_ID, sku, name, collection, category_id, dims, json.dumps(tags)))
        new_id = cur.fetchone()[0]
        inserted_ids.append((new_id, mat_slug))

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 4: ASSIGN MATERIALS via product_materials junction table
# ─────────────────────────────────────────────────────────────────────────────
log("\n=== SECTION 4: ASSIGN MATERIALS ===")

# Assign materials to newly inserted products
if not DRY_RUN and inserted_ids:
    alum_ids  = [pid for pid, ms in inserted_ids if ms == 'aluminum']
    wicker_ids = [pid for pid, ms in inserted_ids if ms == 'wicker']
    if alum_ids:
        assign_material(alum_ids, ['aluminum'])
    if wicker_ids:
        assign_material(wicker_ids, ['wicker'])

# Assign materials to existing products being updated (by collection)
# Wicker collections
for collection, mat_slugs in [
    ('Biscayne 6510',  ['wicker']),
    ('Bainbridge',     ['wicker']),
    ('Grand Stafford', ['wicker']),
    ('Lakeside',       ['wicker']),
    ('Sydney 5306',    ['wicker']),
    ('Hixon 6400',     ['aluminum']),
    ('Tuscino',        ['aluminum']),
    ('Chalfonte',      ['aluminum']),
    ('Fire Tables',    ['aluminum']),
]:
    ids = get_ids_by_collection(collection)
    if ids:
        log(f"  Assigning {mat_slugs} to {len(ids)} products in collection '{collection}'")
        if not DRY_RUN:
            assign_material(ids, mat_slugs)
    else:
        log(f"  No products found yet for collection '{collection}' (will be assigned after inserts commit)")

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
