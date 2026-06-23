import os
import psycopg2

db_url = os.environ.get('DATABASE_URL') or os.environ.get('PROD_DATABASE_URL')
conn = psycopg2.connect(db_url)
cur = conn.cursor()

DRY_RUN = True  # Set to False to commit

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
# SECTION 2: UPDATE existing products -- collection, name, material
# ─────────────────────────────────────────────────────────────────────────────

log("\n=== SECTION 2: UPDATE existing products ===")

updates = [
    # --- Biscayne 6510: rename collection + product names + set material ---
    # Collection was "6510", now "Biscayne 6510"; names drop the "6510 " prefix; material = Wicker
    ('NC65103S',       'Biscayne Sofa',              'Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510C',        'Biscayne Lounge Chair',       'Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510LS',       'Biscayne Loveseat',           'Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510SR',       'Biscayne Swivel Rocker',      'Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510O-REC',    'Biscayne Ottoman',            'Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510R-CHT',    'Biscayne Rotating Chat Table','Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510CT-REC',   'Biscayne Rectangular Coffee Table', 'Biscayne 6510', 'Wicker', 'wicker'),
    ('NC6510ET-SQ',    'Biscayne Square End Table',   'Biscayne 6510', 'Wicker', 'wicker'),

    # --- Bainbridge: collection name + material (already correct name format) ---
    ('NC2753S',       None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275LS',       None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275C',        None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275SG',       None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275LL',       None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275RL',       None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275SCC',      None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275SCC-45',   None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275SCM',      None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275O-REC',    None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275O-SQ',     None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275ET-SQ',    None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275CT-SQ',    None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275CT-REC',   None, 'Bainbridge', 'Wicker', 'wicker'),
    ('NC275CET',      None, 'Bainbridge', 'Wicker', 'wicker'),

    # --- Grand Stafford: collection + material ---
    ('NC43313S',      None, 'Grand Stafford', 'Wicker', 'wicker'),
    ('NC4331LS',      None, 'Grand Stafford', 'Wicker', 'wicker'),
    ('NC4331C',       None, 'Grand Stafford', 'Wicker', 'wicker'),
    ('NC4331O-REC',   None, 'Grand Stafford', 'Wicker', 'wicker'),
    ('NC4331CT-REC',  None, 'Grand Stafford', 'Wicker', 'wicker'),
    ('NC4331ET-SQ',   None, 'Grand Stafford', 'Wicker', 'wicker'),

    # --- Lakeside: collection + material ---
    ('NC43023S',      None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302LS',      None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302C',       None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302SG',      None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302LL',      None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302RL',      None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302SCC',     None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302SCC-45',  None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302SCM',     None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302O-REC',   None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302O-SQ',    None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302CET',     None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302CT-REC',  None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302CT-SQ',   None, 'Lakeside', 'Wicker', 'wicker'),
    ('NC4302ET-SQ',   None, 'Lakeside', 'Wicker', 'wicker'),

    # --- Tuscino: collection + material (poly lumber/upholstered frame) ---
    ('NC2001O-SQ',    None, 'Tuscino', 'Aluminum', 'aluminum'),
    ('NC2001SCC',     None, 'Tuscino', 'Aluminum', 'aluminum'),
    ('NC2001SCM',     None, 'Tuscino', 'Aluminum', 'aluminum'),

    # --- Chalfonte: collection + material (Mixed Media Aluminum) ---
    # Keeping the 1 remaining correct SKU on site: NC2685DC
    ('NC2685DC',      None, 'Chalfonte', 'Aluminum', 'aluminum'),

    # --- Fire Tables: collection + material + fix names (size to end) ---
    ('NC5319R-42-CAL',    'Cal Sil Fire Table Round 42"',         'Fire Tables', 'Aluminum', 'aluminum'),
    ('NC5319RCT-48-CAL',  'Cal Sil Fire Table Rectangle 48" x 32"', 'Fire Tables', 'Aluminum', 'aluminum'),

    # NC5314 woven fire tables -- not in 2026 catalog but fix names while we're here
    ('NC5314R-42',    'Woven Fire Table Round 42"',            'Fire Tables', 'Aluminum', 'aluminum'),
    ('NC5314RCT',     'Woven Fire Table Rectangle 48"',        'Fire Tables', 'Aluminum', 'aluminum'),

    # --- Tuscino SKU fix: NC2001O-SQ -> NC2001OT-SQ ---
    # Handled separately below as a SKU update
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

# Tuscino SKU fix
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
    log("  SKIP: NC2001O-SQ not found")

# ─────────────────────────────────────────────────────────────────────────────
# SECTION 3: INSERT missing products
# ─────────────────────────────────────────────────────────────────────────────

log("\n=== SECTION 3: INSERT missing products ===")

# Helper
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

# --- Hixon 6400 Deep Seating (Mixed Media Aluminum) ---
hixon_tags = ['Hixon 6400', 'Mixed Media Aluminum', 'Deep Seating']
hixon_dining_tags = ['Hixon 6400', 'Mixed Media Aluminum', 'Dining']
hixon_mat = 'Aluminum'
hixon_slug = 'aluminum'

insert_product('NC64003S-TAN', 'Hixon Sofa',                      'Hixon 6400', CAT_DEEP_SEATING, hixon_mat, hixon_slug, '80.3" x 33" x 28.7" H', hixon_tags)
insert_product('NC6400LS-TAN', 'Hixon Loveseat',                  'Hixon 6400', CAT_DEEP_SEATING, hixon_mat, hixon_slug, '55.1" x 33" x 28.7" H', hixon_tags)
insert_product('NC6400C-TAN',  'Hixon Lounge Chair',               'Hixon 6400', CAT_DEEP_SEATING, hixon_mat, hixon_slug, '30" x 33" x 28.7" H', hixon_tags)
insert_product('NC6400SR-TAN', 'Hixon Swivel Rocker',              'Hixon 6400', CAT_DEEP_SEATING, hixon_mat, hixon_slug, '30" x 33" x 28.7" H', hixon_tags)
insert_product('NC6400O-REC-TAN','Hixon Ottoman',                  'Hixon 6400', CAT_DEEP_SEATING, hixon_mat, hixon_slug, '29" x 20" x 15" H', hixon_tags)
insert_product('NC6400NET-TAN','Hixon Slat Nesting Tables',        'Hixon 6400', CAT_COFFEE_SIDE,  hixon_mat, hixon_slug, 'Large: 18.9" x 18.9" x 21.6" H; Small: 16.5" x 16.5" x 19.6" H', ['Hixon 6400','Mixed Media Aluminum','Coffee & Side Tables'])
insert_product('NC6400CT-TAN', 'Hixon Slat Coffee Table',         'Hixon 6400', CAT_COFFEE_SIDE,  hixon_mat, hixon_slug, '35.4" x 23.6" x 17.7" H', ['Hixon 6400','Mixed Media Aluminum','Coffee & Side Tables'])
insert_product('NC6400CET-TAN','Hixon Sectional Corner End Table','Hixon 6400', CAT_COFFEE_SIDE,  hixon_mat, hixon_slug, '32.9" x 32.9" x 20" H', ['Hixon 6400','Mixed Media Aluminum','Coffee & Side Tables'])
insert_product('NC6400SCM',    'Hixon Sectional Middle Armless',  'Hixon 6400', CAT_DEEP_SEATING, hixon_mat, hixon_slug, '25.2" x 32.8" x 28.7" H', hixon_tags)
insert_product('NC6400LL-TAN', 'Hixon Sectional Left Arm Loveseat','Hixon 6400',CAT_DEEP_SEATING, hixon_mat, hixon_slug, '52.6" x 32.8" x 28.7" H', hixon_tags)
insert_product('NC6400RL-TAN', 'Hixon Sectional Right Arm Loveseat','Hixon 6400',CAT_DEEP_SEATING,hixon_mat, hixon_slug, '52.6" x 32.8" x 28.7" H', hixon_tags)
insert_product('NC6400SCC-TAN','Hixon Sectional 90 Degree Corner','Hixon 6400', CAT_DEEP_SEATING, hixon_mat, hixon_slug, '32.8" x 32.8" x 28.7" H', hixon_tags)

# Hixon 6400 Dining -- tables shared with 6400 frame; dining chair unique
insert_product('NC2685DT-TN-33', 'Hixon Square Dining Table 33"',    'Hixon 6400', CAT_DINING, hixon_mat, hixon_slug, '33" x 33" x 29" H', hixon_dining_tags)
insert_product('NC2685DT-TN-41', 'Hixon Square Dining Table 41"',    'Hixon 6400', CAT_DINING, hixon_mat, hixon_slug, '41" x 41" x 29" H', hixon_dining_tags)
insert_product('NC2685DT-TN-72', 'Hixon Rectangle Dining Table 72"', 'Hixon 6400', CAT_DINING, hixon_mat, hixon_slug, '72" x 41" x 29" H', hixon_dining_tags)
insert_product('NC2685DT-TN-83', 'Hixon Rectangle Dining Table 83"', 'Hixon 6400', CAT_DINING, hixon_mat, hixon_slug, '83" x 41" x 29" H', hixon_dining_tags)
insert_product('C6400DC-TAN',    'Hixon Dining Chair',                'Hixon 6400', CAT_DINING, hixon_mat, hixon_slug, '26" x 22" x 34.6" H', hixon_dining_tags)

# --- Valencia 6500 Deep Seating (Mixed Media Aluminum, high back) ---
val_tags = ['Valencia 6500', 'Mixed Media Aluminum', 'Deep Seating']
val_mat = 'Aluminum'
val_slug = 'aluminum'
insert_product('NC65003S-TAN',  'Valencia Sofa',                       'Valencia 6500', CAT_DEEP_SEATING, val_mat, val_slug, '80.3" x 33" x 38" H', val_tags)
insert_product('NC6500LS-TAN',  'Valencia Loveseat',                   'Valencia 6500', CAT_DEEP_SEATING, val_mat, val_slug, '55.1" x 33" x 38" H', val_tags)
insert_product('NC6500C-TAN',   'Valencia Lounge Chair',                'Valencia 6500', CAT_DEEP_SEATING, val_mat, val_slug, '30" x 33" x 38" H', val_tags)
insert_product('NC6500SR-TAN',  'Valencia Swivel Rocker',               'Valencia 6500', CAT_DEEP_SEATING, val_mat, val_slug, '30" x 33" x 38" H', val_tags)
insert_product('NC6500SCM',     'Valencia Sectional Middle Armless',    'Valencia 6500', CAT_DEEP_SEATING, val_mat, val_slug, '25.2" x 32.8" x 38" H', val_tags)
insert_product('NC6500LL-TAN',  'Valencia Sectional Left Arm Loveseat', 'Valencia 6500', CAT_DEEP_SEATING, val_mat, val_slug, '52.6" x 32.8" x 38" H', val_tags)
insert_product('NC6500RL-TAN',  'Valencia Sectional Right Arm Loveseat','Valencia 6500', CAT_DEEP_SEATING, val_mat, val_slug, '52.6" x 32.8" x 38" H', val_tags)
insert_product('NC6500SCC-TAN', 'Valencia Sectional 90 Degree Corner',  'Valencia 6500', CAT_DEEP_SEATING, val_mat, val_slug, '32.8" x 32.8" x 38" H', val_tags)

# --- Nassau 2676 (Mixed Media Aluminum) ---
nas_tags = ['Nassau 2676', 'Mixed Media Aluminum', 'Deep Seating']
nas_mat = 'Aluminum'
nas_slug = 'aluminum'
insert_product('NC26763S',   'Nassau Sofa',                        'Nassau 2676', CAT_DEEP_SEATING, nas_mat, nas_slug, '81" x 30.5" x 28.7" H', nas_tags)
insert_product('NC2676LS',   'Nassau Loveseat',                    'Nassau 2676', CAT_DEEP_SEATING, nas_mat, nas_slug, '56" x 30.5" x 28.7" H', nas_tags)
insert_product('NC2676C',    'Nassau Lounge Chair',                 'Nassau 2676', CAT_DEEP_SEATING, nas_mat, nas_slug, '31" x 30.5" x 28.7" H', nas_tags)
insert_product('NC2676SR',   'Nassau Swivel Rocker',                'Nassau 2676', CAT_DEEP_SEATING, nas_mat, nas_slug, '31" x 30.5" x 28.7" H', nas_tags)
insert_product('NC2676SCM',  'Nassau Sectional Middle Armless',     'Nassau 2676', CAT_DEEP_SEATING, nas_mat, nas_slug, '25.2" x 31.5" x 28.7" H', nas_tags)
insert_product('NC2676LL',   'Nassau Sectional Left Arm Loveseat',  'Nassau 2676', CAT_DEEP_SEATING, nas_mat, nas_slug, '53" x 31.5" x 28.7" H', nas_tags)
insert_product('NC2676RL',   'Nassau Sectional Right Arm Loveseat', 'Nassau 2676', CAT_DEEP_SEATING, nas_mat, nas_slug, '53" x 31.5" x 28.7" H', nas_tags)
insert_product('NC2676SCC',  'Nassau Sectional 90 Degree Corner',   'Nassau 2676', CAT_DEEP_SEATING, nas_mat, nas_slug, '31.5" x 31.5" x 28.7" H', nas_tags)

# --- Sedona 6600 (Mixed Media Aluminum) ---
sed_tags = ['Sedona 6600', 'Mixed Media Aluminum', 'Deep Seating']
sed_dining_tags = ['Sedona 6600', 'Mixed Media Aluminum', 'Dining']
sed_mat = 'Aluminum'
sed_slug = 'aluminum'
insert_product('NC66003S',   'Sedona Sofa',                        'Sedona 6600', CAT_DEEP_SEATING, sed_mat, sed_slug, '80.3" x 33" x 28.7" H', sed_tags)
insert_product('NC6600LS',   'Sedona Loveseat',                    'Sedona 6600', CAT_DEEP_SEATING, sed_mat, sed_slug, '55.1" x 33" x 28.7" H', sed_tags)
insert_product('NC6600C',    'Sedona Lounge Chair',                 'Sedona 6600', CAT_DEEP_SEATING, sed_mat, sed_slug, '30" x 33" x 28.7" H', sed_tags)
insert_product('NC6600SR',   'Sedona Swivel Rocker',                'Sedona 6600', CAT_DEEP_SEATING, sed_mat, sed_slug, '30" x 33" x 28.7" H', sed_tags)
insert_product('NC6600LL',   'Sedona Sectional Left Arm Loveseat',  'Sedona 6600', CAT_DEEP_SEATING, sed_mat, sed_slug, '52.6" x 32.8" x 28.7" H', sed_tags)
insert_product('NC6600RL',   'Sedona Sectional Right Arm Loveseat', 'Sedona 6600', CAT_DEEP_SEATING, sed_mat, sed_slug, '52.6" x 32.8" x 28.7" H', sed_tags)
# Dining chair -- catalog shows C6600DC
insert_product('C6600DC',    'Sedona Dining Chair',                 'Sedona 6600', CAT_DINING,       sed_mat, sed_slug, '26" x 22" x 34.6" H', sed_dining_tags)
# Sedona shares dining tables with Hixon 6400 (NC2685DT-TN-33/41/72/83) -- already inserted above
# Sedona shares sectional SCM and SCC with 6400 (NC6400SCM, NC6400SCC-TAN) -- already on site or inserted above

# --- Chesapeake Bay 6701 (Mixed Media Aluminum) ---
cb_tags = ['Chesapeake Bay 6701', 'Mixed Media Aluminum', 'Deep Seating']
cb_table_tags = ['Chesapeake Bay 6701', 'Mixed Media Aluminum', 'Coffee & Side Tables']
cb_mat = 'Aluminum'
cb_slug = 'aluminum'
insert_product('NC674013S',  'Chesapeake Bay Sofa',               'Chesapeake Bay 6701', CAT_DEEP_SEATING, cb_mat, cb_slug, '78" x 31" x 27" H', cb_tags)
insert_product('NC6701-LS',  'Chesapeake Bay Loveseat',           'Chesapeake Bay 6701', CAT_DEEP_SEATING, cb_mat, cb_slug, '53" x 31" x 27" H', cb_tags)
insert_product('NC6701C',    'Chesapeake Bay Lounge Chair',        'Chesapeake Bay 6701', CAT_DEEP_SEATING, cb_mat, cb_slug, '28" x 31" x 27" H', cb_tags)
insert_product('NC6701SR',   'Chesapeake Bay Swivel Rocker',       'Chesapeake Bay 6701', CAT_DEEP_SEATING, cb_mat, cb_slug, '28" x 31" x 27" H', cb_tags)
insert_product('NC6701O-REC','Chesapeake Bay Ottoman',             'Chesapeake Bay 6701', CAT_DEEP_SEATING, cb_mat, cb_slug, '28" x 20" x 15" H', cb_tags)
insert_product('NC6701-RET', 'Chesapeake Bay Round Slat End Table','Chesapeake Bay 6701', CAT_COFFEE_SIDE,  cb_mat, cb_slug, '19" x 19" x 22" H', cb_table_tags)
insert_product('NC6701RCT',  'Chesapeake Bay Round Slat Coffee Table','Chesapeake Bay 6701', CAT_COFFEE_SIDE, cb_mat, cb_slug, '36" x 36" x 18" H', cb_table_tags)

# --- Sydney 5306 (Woven) ---
syd_tags = ['Sydney 5306', 'Wicker', 'Deep Seating']
syd_table_tags = ['Sydney 5306', 'Wicker', 'Coffee & Side Tables']
syd_mat = 'Wicker'
syd_slug = 'wicker'
insert_product('NC53063S',    'Sydney Sofa',                        'Sydney 5306', CAT_DEEP_SEATING, syd_mat, syd_slug, '86" x 33.5" x 35" H', syd_tags)
insert_product('NC5306LS',    'Sydney Loveseat',                    'Sydney 5306', CAT_DEEP_SEATING, syd_mat, syd_slug, '61" x 35.5" x 35" H', syd_tags)
insert_product('NC5306C',     'Sydney Lounge Chair',                 'Sydney 5306', CAT_DEEP_SEATING, syd_mat, syd_slug, '36" x 35.5" x 35" H', syd_tags)
insert_product('NC5306SG',    'Sydney Swivel Glider',                'Sydney 5306', CAT_DEEP_SEATING, syd_mat, syd_slug, '36" x 35.5" x 35" H', syd_tags)
insert_product('NC5306O-SQ',  'Sydney Square Ottoman',              'Sydney 5306', CAT_DEEP_SEATING, syd_mat, syd_slug, '25" x 25" x 12" H', syd_tags)
insert_product('NC5306ET-SQ', 'Sydney Square End Table',            'Sydney 5306', CAT_COFFEE_SIDE,  syd_mat, syd_slug, '23" x 23" x 22" H', syd_table_tags)
insert_product('NC5306CT-REC','Sydney Rectangle Coffee Table',      'Sydney 5306', CAT_COFFEE_SIDE,  syd_mat, syd_slug, '43.5" x 24.5" x 18" H', syd_table_tags)
insert_product('NC5306CT-SQ', 'Sydney Square Cube Coffee Table',    'Sydney 5306', CAT_COFFEE_SIDE,  syd_mat, syd_slug, '35" x 34" x 21" H', syd_table_tags)
insert_product('NC5306SCM',   'Sydney Sectional Middle Armless',    'Sydney 5306', CAT_DEEP_SEATING, syd_mat, syd_slug, '25" x 35.5" x 35" H', syd_tags)
insert_product('NC5306LL',    'Sydney Sectional Left Arm Loveseat', 'Sydney 5306', CAT_DEEP_SEATING, syd_mat, syd_slug, '55" x 35.5" x 35" H', syd_tags)
insert_product('NC5306RL',    'Sydney Sectional Right Arm Loveseat','Sydney 5306', CAT_DEEP_SEATING, syd_mat, syd_slug, '55" x 35.5" x 35" H', syd_tags)
insert_product('NC5306SCC-90','Sydney Sectional Corner Chair',      'Sydney 5306', CAT_DEEP_SEATING, syd_mat, syd_slug, '36" x 36" x 35" H', syd_tags)

# --- Chalfonte Duraboard dining tables (replacing old SKUs) ---
ch_dining_tags = ['Chalfonte', 'Mixed Media Aluminum', 'Dining']
ch_mat = 'Aluminum'
ch_slug = 'aluminum'
insert_product('NC2685DT33-SQ-DRB-DH',  'Chalfonte Square Dining Table 33"',           'Chalfonte', CAT_DINING, ch_mat, ch_slug, '33" x 33" x 29" H', ch_dining_tags)
insert_product('NC2685DT41-SQ-DRB-DH',  'Chalfonte Square Dining Table 41"',           'Chalfonte', CAT_DINING, ch_mat, ch_slug, '41" x 41" x 29" H', ch_dining_tags)
insert_product('NC2685DT72-REC-DRB-DH', 'Chalfonte Rectangle Dining Table 72"',        'Chalfonte', CAT_DINING, ch_mat, ch_slug, '72" x 41" x 29" H', ch_dining_tags)
insert_product('NC2685DT83-REC-DRB-DH', 'Chalfonte Rectangle Dining Table 83"',        'Chalfonte', CAT_DINING, ch_mat, ch_slug, '83" x 41" x 29" H', ch_dining_tags)
insert_product('NC2685CH33-SQ-DRB',     'Chalfonte Square Counter Height Table 33"',   'Chalfonte', CAT_DINING, ch_mat, ch_slug, '33" x 33" x 38" H', ch_dining_tags)
insert_product('NC2685CH41-SQ-DRB',     'Chalfonte Square Counter Height Table 41"',   'Chalfonte', CAT_DINING, ch_mat, ch_slug, '41" x 41" x 38" H', ch_dining_tags)
insert_product('NC2685CH72-REC-DRB',    'Chalfonte Rectangle Counter Height Table 72"','Chalfonte', CAT_DINING, ch_mat, ch_slug, '72" x 33" x 38" H', ch_dining_tags)
insert_product('NC2685SWDC',  'Chalfonte Swivel Rocker Dining Chair','Chalfonte', CAT_DINING,  ch_mat, ch_slug, '23.5" x 24" x 36" H', ch_dining_tags)
insert_product('NC2685BS-CH', 'Chalfonte Counter Height Stool',      'Chalfonte', CAT_BAR,    ch_mat, ch_slug, '24" x 23.5" x 43.5" H; Seat Height: 25.5"; Arm Height: 33"', ['Chalfonte','Mixed Media Aluminum','Bar & Counter Stools'])
insert_product('NC2685DLS',   'Chalfonte Dining Loveseat Bench',     'Chalfonte', CAT_DINING, ch_mat, ch_slug, '63" x 14" x 17" H', ch_dining_tags)
insert_product('NC2685SACL',  'Chalfonte Single Adjustable Chaise Lounge','Chalfonte', CAT_CHAISE, ch_mat, ch_slug, '78.5" x 29.75" x 15" H', ['Chalfonte','Mixed Media Aluminum','Chaise Lounges'])

# --- 6401 Chaise (Mixed Media Aluminum / Sling) ---
insert_product('NC6401-ACL',  'Hixon Arm Chaise',    'Hixon 6400', CAT_CHAISE, 'Aluminum', 'aluminum', '80" x 30" x 14" H; Bed Width: 26"', ['Hixon 6400','Mixed Media Aluminum','Chaise Lounges'])
insert_product('NC6401-SACL', 'Hixon Armless Chaise','Hixon 6400', CAT_CHAISE, 'Aluminum', 'aluminum', '80" x 26" x 14" H', ['Hixon 6400','Mixed Media Aluminum','Chaise Lounges'])

# --- Tuscino additions ---
tus_tags = ['Tuscino', 'Aluminum', 'Deep Seating']
insert_product('NC2001OT-SQ',   'Tuscino Square Ottoman',     'Tuscino', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '30" x 30" x 18" H', tus_tags)
insert_product('NC2001CUB-MED', 'Tuscino Cube Ottoman Medium','Tuscino', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '22" x 22" x 18" H', tus_tags)
insert_product('NC2001CUBE-SM', 'Tuscino Cube Ottoman Small', 'Tuscino', CAT_DEEP_SEATING, 'Aluminum', 'aluminum', '18" x 18" x 18" H', tus_tags)

# --- Fire Tables: 2 new Tangent Top variants ---
ft_tags = ['Fire Tables', 'Aluminum', 'Fire Tables']
insert_product('NC5319R-42-TAN',   'Cal Sil Fire Table Round 42" Tangent Top',        'Fire Tables', CAT_FIRE_TABLES, 'Aluminum', 'aluminum', '42" Dia. x 25" H; 45,000 BTU', ft_tags)
insert_product('NC5319RCT-48-TAN', 'Cal Sil Fire Table Rectangle 48" x 32" Tangent Top','Fire Tables', CAT_FIRE_TABLES, 'Aluminum', 'aluminum', '48" x 32" x 25" H; 25,000 BTU', ft_tags)

# --- Universal / Bainbridge companion pieces ---
bain_tags = ['Bainbridge', 'Wicker', 'Deep Seating']
insert_product('NC415HBSG-P', 'Universal High Back Swivel Glider',  'Bainbridge', CAT_DEEP_SEATING, 'Wicker', 'wicker', '30" x 33" x 39" H', bain_tags)
insert_product('NC415RX',     'Universal Recliner',                 'Bainbridge', CAT_DEEP_SEATING, 'Wicker', 'wicker', '31" x 33" x 39" H', bain_tags)
insert_product('NC415RX-P',   'Universal Recliner Premium Weave',   'Bainbridge', CAT_DEEP_SEATING, 'Wicker', 'wicker', '31" x 33" x 39" H', bain_tags)

# --- Biscayne glass top variants ---
bis_tags = ['Biscayne 6510', 'Wicker', 'Coffee & Side Tables']
insert_product('NC6510R-CHT-GL',  'Biscayne Rotating Chat Table Glass Top',    'Biscayne 6510', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '36" Dia.', bis_tags)
insert_product('NC6510ET-SQ-GL',  'Biscayne Square End Table Glass Top',       'Biscayne 6510', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '22" x 22"', bis_tags)
insert_product('NC6510CT-REC-GL', 'Biscayne Rectangular Coffee Table Glass Top','Biscayne 6510', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '34" x 24"', bis_tags)

# --- Bainbridge glass top variants ---
bain_table_tags = ['Bainbridge', 'Wicker', 'Coffee & Side Tables']
insert_product('NC275ET-SQ-GL',  'Bainbridge End Table Glass Top',              'Bainbridge', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '20" x 20"', bain_table_tags)
insert_product('NC275CT-SQ-GL',  'Bainbridge Square Coffee Table Glass Top',    'Bainbridge', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '32" x 32"', bain_table_tags)
insert_product('NC275CT-REC-GL', 'Bainbridge Rectangular Coffee Table Glass Top','Bainbridge', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '44" x 28"', bain_table_tags)

# --- Grand Stafford glass top variants ---
gs_table_tags = ['Grand Stafford', 'Wicker', 'Coffee & Side Tables']
insert_product('NC4331CT-REC-GL', 'Grand Stafford Coffee Table Glass Top', 'Grand Stafford', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '44" x 28"', gs_table_tags)
insert_product('NC4331ET-SQ-GL',  'Grand Stafford End Table Glass Top',    'Grand Stafford', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '22" x 22"', gs_table_tags)

# --- Lakeside glass top + corner end table glass variants ---
lak_table_tags = ['Lakeside', 'Wicker', 'Coffee & Side Tables']
insert_product('NC4302CET-GL',    'Lakeside Corner End Table Glass Top',          'Lakeside', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '32.5" x 32.5"', lak_table_tags)
insert_product('NC4302CT-REC-GL', 'Lakeside Rectangular Coffee Table Glass Top',  'Lakeside', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '43.3" x 27.6"', lak_table_tags)
insert_product('NC4302CT-SQ-GL',  'Lakeside Square Coffee Table Glass Top',       'Lakeside', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '32" x 32"', lak_table_tags)
insert_product('NC4302ET-SQ-GL',  'Lakeside End Table Glass Top',                 'Lakeside', CAT_COFFEE_SIDE, 'Wicker', 'wicker', '20" x 20"', lak_table_tags)

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
