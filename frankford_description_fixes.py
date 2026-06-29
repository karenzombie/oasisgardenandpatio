import psycopg2
import os

DRY_RUN = True

conn = psycopg2.connect(os.environ['DATABASE_URL'])
cur = conn.cursor()

print("=== DRY RUN ===" if DRY_RUN else "=== LIVE RUN ===")
print()

# -----------------------------------------------------------------------
# SECTION 1: Description / slug / short_description fixes
# -----------------------------------------------------------------------
desc_updates = [

    # 868ARU (id 2299) - fix slug, short_description, description from MSRP p.7
    {
        'id': 2299,
        'sku': '868ARU',
        'slug': 'the-aurora-aluminum',
        'short_description': 'Aluminum cantilever umbrella',
        'description': (
            "Extruded Aluminum Frame and Aluminum G-Ribs / SS Hardware\n"
            "Full 360\u00b0 Rotation\n"
            "Crank Lift and Infinity Canopy Tilt w/ 90\u00b0 auto-locking\n"
            "Wind Stabilizer Kit and Black Polyester Protective Cover\n"
            "Powder Coated Steel Spigot (ARU-SP)\n"
            "TPU Tonal Frame Match Cantilever Vertex Finial (VF-ARU)\n"
            "WIND RATING: 30mph (882ARU-R 15mph) - Addition of Wind Stabilizer: +5mph"
        ),
    },

    # 24G (id 5084) - cannot stack, MSRP p.28
    {
        'id': 5084,
        'sku': '24G',
        'description': 'Galvanized steel plate base. Cannot be stacked. Table use with 8ST stem.',
        'short_description': 'Galvanized steel plate base. Cannot be stacked. Table use with 8ST stem.',
    },

    # 36G (id 5078) - add 8ST and 18ST2 to stem list, MSRP p.28
    {
        'id': 5078,
        'sku': '36G',
        'description': 'Galvanized steel plate base. Stackable up to 4 plates. Must be paired with 8ST (table), 18ST, or 18ST2 stem.',
        'short_description': 'Galvanized steel plate base. Stackable up to 4 plates. Must be paired with 8ST (table), 18ST, or 18ST2 stem.',
    },

    # 36G-SQx4 (id 5562) - fill blank from MSRP p.6
    {
        'id': 5562,
        'sku': '36G-SQx4',
        'description': 'Quad Stack (qty. 4): Square Galvanized Steel Plate Bases. (1) bottom plate / (3) stacking plates. 800 lbs./363kg. 36" x 2"/91cm x 5cm. Wheels available (+W Add to MSRP).',
        'short_description': 'Square galvanized steel base quad stack. 800 lbs. Wheels available.',
    },

    # 38-SAP (id 5564) - fill blank from MSRP p.30
    {
        'id': 5564,
        'sku': '38-SAP',
        'description': 'Sand and soil anchor. Can be used with all 1.5" diameter aluminum and 1.38" ash wood bottom poles. Customer must drill a hole to accommodate hitch pin. 4 lbs./2kg. 27" x 1.5"/40cm x 68cm.',
        'short_description': 'Sand and soil anchor for 1.5" diameter poles.',
    },

    # 38-SAP-2 (id 5565) - fill blank from MSRP p.30
    {
        'id': 5565,
        'sku': '38-SAP-2',
        'description': 'Sand and soil anchor. Can be used with all 2" diameter aluminum bottom poles. Customer must drill a hole to accommodate hitch pin. 4 lbs./2kg. 38" x 2"/40cm x 97cm.',
        'short_description': 'Sand and soil anchor for 2" diameter poles.',
    },

    # BZ-SM (id 5563) - fill blank from MSRP p.30
    {
        'id': 5563,
        'sku': 'BZ-SM',
        'description': 'Bazooka in-ground anchored stem. In-ground galvanized steel female tube with powder coated SM-Silver Mist fitted male stem. 16" length above ground. 11 lbs./5kg. 16" x 1.5"/40cm x 3.8cm. Stainless steel upgrade available (BZ-SS).',
        'short_description': 'In-ground bazooka anchored stem. Silver Mist finish. 1.5" diameter.',
    },
]

# -----------------------------------------------------------------------
# SECTION 2: Name fixes - move leading numbers/measurements to end
# -----------------------------------------------------------------------
name_updates = [
    {'id': 5595, 'sku': '01-B (4)',     'old_name': '01 Bolt Set (4)',                    'new_name': 'Bolt Set 01 (4)'},
    {'id': 5596, 'sku': '02-B (4)',     'old_name': '02 Bolt Set (4)',                    'new_name': 'Bolt Set 02 (4)'},
    {'id': 5597, 'sku': '03-B (4)',     'old_name': '03 Bolt Set (4)',                    'new_name': 'Bolt Set 03 (4)'},
    {'id': 5598, 'sku': '04-B (4)',     'old_name': '04 Bolt Set (4)',                    'new_name': 'Bolt Set 04 (4)'},
    {'id': 5585, 'sku': '38F-SR-BP',   'old_name': '38" Fiberglass Steel Rib Bottom Pole', 'new_name': 'Fiberglass Steel Rib Bottom Pole 38"'},
    {'id': 5587, 'sku': '42AP',        'old_name': '42" Aluminum Bottom Pole',           'new_name': 'Aluminum Bottom Pole 42"'},
    {'id': 5586, 'sku': '42F-SR-BP',   'old_name': '42" Fiberglass Steel Rib Bottom Pole', 'new_name': 'Fiberglass Steel Rib Bottom Pole 42"'},
    {'id': 5601, 'sku': '480F',        'old_name': '480 Base Frame',                     'new_name': 'Base Frame 480'},
    {'id': 5600, 'sku': '480W',        'old_name': '480 Weight Plate',                   'new_name': 'Weight Plate 480'},
    {'id': 5610, 'sku': '50S/23-ST4',  'old_name': '50S/23 Steel 4-Plate Stack',         'new_name': 'Steel Plate Stack 50S/23 4-Plate'},
    {'id': 5609, 'sku': '50S/23-ST8',  'old_name': '50S/23 Steel 8-Plate Stack',         'new_name': 'Steel Plate Stack 50S/23 8-Plate'},
    {'id': 5589, 'sku': '52F-SR-BP',   'old_name': '52" Fiberglass Steel Rib Bottom Pole', 'new_name': 'Fiberglass Steel Rib Bottom Pole 52"'},
    {'id': 5611, 'sku': '75S/100S-ST8','old_name': '75S/100S Steel 8-Plate Stack',       'new_name': 'Steel Plate Stack 75S/100S 8-Plate'},
]

# -----------------------------------------------------------------------
# Print and apply Section 1
# -----------------------------------------------------------------------
print("=== SECTION 1: Description / slug / short_description fixes ===")
print()
for u in desc_updates:
    print(f"--- id={u['id']} SKU={u['sku']} ---")
    if 'slug' in u:
        print(f"  slug:              {u['slug']}")
    if 'short_description' in u:
        print(f"  short_description: {u['short_description']}")
    if 'description' in u:
        print(f"  description:       {u['description'][:120]}...")
    print()

    if not DRY_RUN:
        if 'slug' in u:
            cur.execute("""
                UPDATE products
                SET slug = %s, short_description = %s, description = %s
                WHERE id = %s AND manufacturer_id = 28;
            """, (u['slug'], u['short_description'], u['description'], u['id']))
        else:
            cur.execute("""
                UPDATE products
                SET description = %s, short_description = %s
                WHERE id = %s AND manufacturer_id = 28;
            """, (u['description'], u['short_description'], u['id']))

# -----------------------------------------------------------------------
# Print and apply Section 2
# -----------------------------------------------------------------------
print("=== SECTION 2: Name fixes (leading number -> end) ===")
print()
for u in name_updates:
    print(f"  id={u['id']} | {u['sku']}")
    print(f"    BEFORE: {u['old_name']}")
    print(f"    AFTER:  {u['new_name']}")
    print()

    if not DRY_RUN:
        cur.execute("""
            UPDATE products
            SET name = %s
            WHERE id = %s AND manufacturer_id = 28;
        """, (u['new_name'], u['id']))

# -----------------------------------------------------------------------
# Verify and commit
# -----------------------------------------------------------------------
if not DRY_RUN:
    print("=== VERIFICATION: descriptions ===")
    desc_ids = [u['id'] for u in desc_updates]
    cur.execute("""
        SELECT id, sku, slug, short_description, LEFT(description, 80)
        FROM products WHERE id = ANY(%s) ORDER BY id;
    """, (desc_ids,))
    for row in cur.fetchall():
        print(row)

    print()
    print("=== VERIFICATION: names ===")
    name_ids = [u['id'] for u in name_updates]
    cur.execute("""
        SELECT id, sku, name FROM products WHERE id = ANY(%s) ORDER BY id;
    """, (name_ids,))
    for row in cur.fetchall():
        print(row)

    conn.commit()
    print("\nCOMMITTED.")
else:
    conn.rollback()
    print("Dry run complete. No changes made.")

cur.close()
conn.close()
