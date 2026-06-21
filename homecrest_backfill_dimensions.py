"""
Homecrest Dimensions Backfill Script
Run:
    python3 homecrest_backfill_dimensions.py          # dry run
    python3 homecrest_backfill_dimensions.py --commit  # write to DB
"""

import os
import csv
import json
import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL")
CATALOG_CSV = "homecrest_catalog_complete.csv"


def build_dimensions(row):
    w = row.get("width", "").strip()
    d = row.get("depth", "").strip()
    h = row.get("height", "").strip()
    l = row.get("length", "").strip()
    parts = []
    if w:
        parts.append(f'{w}" W')
    if d:
        parts.append(f'{d}" D')
    if l:
        parts.append(f'{l}" L')
    if h:
        parts.append(f'{h}" H')
    return " x ".join(parts) if parts else None


def build_specs_additions(row):
    extras = {}
    seat_h = row.get("seat_height", "").strip()
    arm_h = row.get("arm_height", "").strip()
    if seat_h:
        extras["Seat Height"] = f'{seat_h}"'
    if arm_h:
        extras["Arm Height"] = f'{arm_h}"'
    return extras


def run(dry_run=True):
    catalog_map = {}
    with open(CATALOG_CSV, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            sku = row.get("sku", "").strip()
            if sku:
                catalog_map[sku] = row

    print(f"Catalog entries loaded: {len(catalog_map)}")

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, name, sku, dimensions, specs
        FROM products
        WHERE manufacturer_id = (
            SELECT id FROM manufacturers WHERE LOWER(name) = 'homecrest'
        )
        ORDER BY name
    """)
    db_rows = cur.fetchall()
    print(f"Homecrest DB products: {len(db_rows)}")
    print()

    updates = []
    no_catalog_match = []
    already_has_dims = []
    no_catalog_dims = []

    for db_id, name, sku, current_dims, current_specs in db_rows:
        sku = (sku or "").strip()
        if sku not in catalog_map:
            no_catalog_match.append((db_id, name, sku))
            continue

        cat = catalog_map[sku]
        new_dims = build_dimensions(cat)
        spec_adds = build_specs_additions(cat)

        if current_dims and current_dims.strip():
            already_has_dims.append((db_id, name, sku, current_dims))
            continue

        if not new_dims and not spec_adds:
            no_catalog_dims.append((db_id, name, sku))
            continue

        try:
            specs = json.loads(current_specs) if current_specs else {}
        except (json.JSONDecodeError, TypeError):
            specs = {}
        specs.update(spec_adds)
        # Always serialize to string
        new_specs_str = json.dumps(specs) if specs else (current_specs or "")

        updates.append((db_id, name, sku, new_dims, new_specs_str))

    print(f"Will update (dims empty, catalog has data): {len(updates)}")
    print(f"Already has dimensions (skipping):          {len(already_has_dims)}")
    print(f"No catalog match:                           {len(no_catalog_match)}")
    print(f"Catalog also missing dims:                  {len(no_catalog_dims)}")
    print()

    if updates:
        print("=" * 70)
        print("PROPOSED UPDATES (first 30 shown):")
        print("=" * 70)
        for db_id, name, sku, new_dims, new_specs_str in updates[:30]:
            print(f"  ID {db_id} | SKU {sku}: {name}")
            print(f"    dimensions -> {new_dims}")
            try:
                s = json.loads(new_specs_str) if new_specs_str else {}
                if "Seat Height" in s or "Arm Height" in s:
                    print(f"    specs adds -> Seat: {s.get('Seat Height','')}  Arm: {s.get('Arm Height','')}")
            except Exception:
                pass
            print()
        if len(updates) > 30:
            print(f"  ... and {len(updates) - 30} more")
            print()

    if no_catalog_dims:
        print("=" * 70)
        print("SKIPPED (catalog also has no dimensions):")
        print("=" * 70)
        for db_id, name, sku in no_catalog_dims:
            print(f"  ID {db_id} | SKU {sku}: {name}")
        print()

    if dry_run:
        print("DRY RUN -- no changes written. Run with --commit to apply.")
        cur.close()
        conn.close()
        return

    print("Applying updates...")
    updated = 0
    for db_id, name, sku, new_dims, new_specs_str in updates:
        cur.execute(
            "UPDATE products SET dimensions = %s, specs = %s WHERE id = %s",
            (new_dims, new_specs_str, db_id)
        )
        updated += 1

    conn.commit()
    print(f"Done. {updated} products updated.")
    cur.close()
    conn.close()


if __name__ == "__main__":
    import sys
    dry = "--commit" not in sys.argv
    if not dry:
        print("*** COMMIT MODE -- changes will be written to the database ***\n")
    run(dry_run=dry)
