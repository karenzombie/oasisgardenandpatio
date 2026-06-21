"""
Homecrest Product Name Cleanup
Strips dimension prefixes from product names.

Run AFTER homecrest_backfill_dimensions has committed successfully.

    python3 homecrest_name_cleanup.py           # dry run
    python3 homecrest_name_cleanup.py --commit  # write to DB
"""

import os
import re
import psycopg2

DATABASE_URL = os.environ.get("DATABASE_URL")

DIM_PREFIX_PATTERN = re.compile(
    r"""^
    (?:
        \d+(?:\.\d+)?"-\d+(?:\.\d+)?"
        |
        \d+/\d+"
        |
        \d+(?:\.\d+)?(?:"|')
        (?:\s*[xX]\s*\d+(?:\.\d+)?(?:"|'))?
        (?:\s*[xX]\s*\d+(?:\.\d+)?(?:"|'))?
    )
    \s+
    """,
    re.VERBOSE | re.IGNORECASE
)


def strip_dim_prefix(name):
    return DIM_PREFIX_PATTERN.sub("", name).strip()


def run(dry_run=True):
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    cur.execute("""
        SELECT id, name, dimensions, sku
        FROM products
        WHERE manufacturer_id = (
            SELECT id FROM manufacturers WHERE LOWER(name) = 'homecrest'
        )
        ORDER BY name
    """)
    rows = cur.fetchall()
    print(f"Found {len(rows)} Homecrest products.\n")

    changes = []
    no_change = []

    for product_id, name, dimensions, sku in rows:
        cleaned = strip_dim_prefix(name)
        if cleaned != name:
            changes.append((product_id, name, cleaned, dimensions, sku))
        else:
            no_change.append(name)

    print(f"Names that will change: {len(changes)}")
    print(f"Names with no prefix detected: {len(no_change)}\n")

    if changes:
        print("=" * 70)
        print("PROPOSED CHANGES:")
        print("=" * 70)
        for pid, old_name, new_name, dims, sku in changes:
            print(f"  ID {pid} | SKU {sku}")
            print(f"    BEFORE: {old_name}")
            print(f"    AFTER:  {new_name}")
            print(f"    dims:   {dims}")
            print()

    if no_change:
        print("=" * 70)
        print("NO CHANGE:")
        print("=" * 70)
        for name in no_change:
            print(f"  {name}")
        print()

    if dry_run:
        print("DRY RUN -- no changes written. Run with --commit to apply.")
        cur.close()
        conn.close()
        return

    print("Applying changes...")
    updated = 0
    for pid, old_name, new_name, dims, sku in changes:
        cur.execute(
            "UPDATE products SET name = %s WHERE id = %s",
            (new_name, pid)
        )
        updated += 1

    conn.commit()
    print(f"Done. {updated} product names updated.")
    cur.close()
    conn.close()


if __name__ == "__main__":
    import sys
    dry = "--commit" not in sys.argv
    if not dry:
        print("*** COMMIT MODE -- changes will be written to the database ***\n")
    run(dry_run=dry)
