#!/usr/bin/env python3
"""
step2_fix_strays.py

DEV (heliumdb) only. DRY RUN by default.

Two fixes:

  A. Telescope umbrella BASES and a pole extension are sitting in the Umbrellas
     category (38). They belong in Umbrella Bases (39).

     These are DISCOVERED by SKU pattern, not hardcoded. The five ids we expect are
     listed only as a cross-check. If the discovery finds a different set, the script
     STOPS and shows you, rather than quietly moving whatever it happened to match.

  B. Product 5110 (Nova Replacement Top Cover) is in Replacement Parts but carries
     sub_category 'Market', which is not a valid sub-category of that category.
     Set it to NULL.

Also REPORTS (read only, changes nothing): every sub_category value in the database
that violates the approved category whitelist. This is so we see the full set of
violations rather than only the ones already noticed.

Safety:
  - Aborts unless connected to heliumdb.
  - Fingerprints every product row NOT being touched. Any drift rolls back.
  - Refuses to update more rows than the plan says.

Run:
    python3 step2_fix_strays.py
"""

import os
import sys
import psycopg2

COMMIT = False

DEV_DB_NAME = "heliumdb"

UMBRELLAS_CAT = 38
UMBRELLA_BASES_CAT = 39

# Cross-check only. The script discovers the real set; this is what we approved.
EXPECTED_BASE_IDS = {3899, 3900, 3901, 3902, 3903}

# The one known invalid sub_category, agreed with Karen.
CLEAR_SUBCAT_IDS = [5110]

# Approved whitelist. Category name -> allowed sub_category values.
WHITELIST = {
    "Deep Seating":      {"Sofas", "Love Seats", "Lounge Chairs", "Sectionals", "Ottomans", "Benches"},
    "Dining":            {"Dining Tables", "Dining Chairs", "Dining Sets"},
    "Bar":               {"Bar Tables", "Bar & Counter Stools", "Bar Sets"},
    "Tables":            {"Coffee & Side Tables", "Table Bases", "Table Tops", "Table Accessories"},
    "Fire Tables":       {"Fire Accessories"},
    "Umbrellas":         {"Market", "Cantilever", "Cabana", "Commercial", "Specialty"},
    "Umbrella Bases":    {"Market", "Cantilever", "Cabana"},
    "Chaise Lounges":    set(),
    "Accent Pieces":     set(),
    "Accessories":       set(),
    "Adirondack":        set(),
    "Daybeds":           set(),
    "Lighting":          set(),
    "Outdoor Rugs":      set(),
    "Pool":              set(),
    "Protective Covers": set(),
    "Replacement Parts": set(),
}


def connect():
    url = os.environ.get("DATABASE_URL")
    if not url:
        sys.exit("ABORT: DATABASE_URL is not set in this shell.")
    conn = psycopg2.connect(url)
    cur = conn.cursor()
    cur.execute("SELECT current_database()")
    db = cur.fetchone()[0]
    if db != DEV_DB_NAME:
        conn.close()
        sys.exit("ABORT: DATABASE_URL points at '%s', expected '%s'." % (db, DEV_DB_NAME))
    print("Connected: DATABASE_URL -> %s" % db)
    cur.close()
    return conn


def fingerprint_products_except(cur, exclude_ids):
    """md5 of every product row NOT in exclude_ids. Must not change."""
    cur.execute(
        "SELECT count(*), coalesce(md5(string_agg(t::text, '|' ORDER BY t.id)), 'empty') "
        "FROM products t WHERE t.id <> ALL(%s)",
        (list(exclude_ids),),
    )
    return cur.fetchone()


def main():
    print("=" * 74)
    print("step2_fix_strays.py   MODE: %s" % ("LIVE COMMIT" if COMMIT else "DRY RUN"))
    print("=" * 74)

    conn = connect()
    cur = conn.cursor()

    # ================= PART A: discover the misfiled bases =================
    print("\n" + "-" * 74)
    print("A. UMBRELLA BASES SITTING IN THE UMBRELLAS CATEGORY")
    print("-" * 74)

    cur.execute(
        """
        SELECT p.id, m.name, p.sku, p.name, p.sub_category
        FROM products p
        LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
        WHERE p.category_id = %s
          AND (p.sku ILIKE %s OR p.sku ILIKE %s OR p.sku ILIKE %s)
        ORDER BY p.id
        """,
        (UMBRELLAS_CAT, "%umbrella-base%", "%umbrella_base%", "%pole-extension%"),
    )
    discovered = cur.fetchall()
    discovered_ids = {r[0] for r in discovered}

    print("\nDiscovered by SKU pattern (not hardcoded): %d products" % len(discovered))
    for pid, mfr, sku, nm, sub in discovered:
        print("  %-6s %-18s %-46s %s" % (pid, (mfr or "")[:18], (sku or "")[:46], nm))

    if discovered_ids != EXPECTED_BASE_IDS:
        print("\n  Discovered set: %s" % sorted(discovered_ids))
        print("  Approved set:   %s" % sorted(EXPECTED_BASE_IDS))
        extra = discovered_ids - EXPECTED_BASE_IDS
        gone = EXPECTED_BASE_IDS - discovered_ids
        if extra:
            print("  FOUND BUT NOT APPROVED: %s" % sorted(extra))
        if gone:
            print("  APPROVED BUT NOT FOUND: %s" % sorted(gone))
        sys.exit("\nABORT: discovery does not match what we approved. Nothing changed.")
    print("\n  Discovery matches the approved set exactly.")

    # Also show anything ELSE in category 38 that has no umbrella size row, so we do
    # not accidentally leave another non-umbrella behind.
    cur.execute(
        """
        SELECT p.id, m.name, p.sku, p.name
        FROM products p
        LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
        LEFT JOIN product_umbrella_sizes s ON s.product_id = p.id
        WHERE p.category_id = %s
          AND s.product_id IS NULL
          AND p.id <> ALL(%s)
        ORDER BY p.id
        """,
        (UMBRELLAS_CAT, list(discovered_ids)),
    )
    leftovers = cur.fetchall()
    print("\n  FYI, other products in Umbrellas with no canopy size row (%d)." % len(leftovers))
    print("  These are handled in later steps, not here:")
    for pid, mfr, sku, nm in leftovers:
        print("    %-6s %-18s %-14s %s" % (pid, (mfr or "")[:18], (sku or "")[:14], nm))

    # ================= PART B: the invalid sub_category =================
    print("\n" + "-" * 74)
    print("B. INVALID sub_category VALUES")
    print("-" * 74)

    cur.execute(
        """
        SELECT p.id, m.name, c.name, p.sub_category, p.sku, p.name
        FROM products p
        LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
        LEFT JOIN categories    c ON c.id = p.category_id
        WHERE p.sub_category IS NOT NULL AND btrim(p.sub_category) <> ''
        ORDER BY c.name, p.sub_category, p.id
        """
    )
    all_subs = cur.fetchall()

    violations = []
    unknown_cats = set()
    for pid, mfr, cat, sub, sku, nm in all_subs:
        if cat not in WHITELIST:
            unknown_cats.add(cat)
            continue
        if sub not in WHITELIST[cat]:
            violations.append((pid, mfr, cat, sub, sku, nm))

    if unknown_cats:
        print("\n  WARNING: categories not in my whitelist: %s" % sorted(unknown_cats))
        print("  I cannot judge sub-categories for these. Tell me and I will add them.")

    # summarise violations by (category, sub) so it is readable
    summary = {}
    for pid, mfr, cat, sub, sku, nm in violations:
        summary.setdefault((cat, sub), []).append(pid)

    print("\n  WHITELIST VIOLATIONS: %d products across %d (category, sub) pairs"
          % (len(violations), len(summary)))
    print("  Reported for visibility. Only 5110 is fixed by THIS script.\n")
    for (cat, sub), pids in sorted(summary.items()):
        marker = "  <-- FIXED HERE" if pids == CLEAR_SUBCAT_IDS else ""
        print("    %-20s > %-24s %4d products%s" % (cat, sub, len(pids), marker))
        if len(pids) <= 6:
            print("        ids: %s" % pids)

    print("\n  Rows this script will clear (set sub_category = NULL):")
    cur.execute(
        """
        SELECT p.id, c.name, p.sub_category, p.sku, p.name
        FROM products p LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.id = ANY(%s)
        """,
        (CLEAR_SUBCAT_IDS,),
    )
    to_clear = cur.fetchall()
    if not to_clear:
        sys.exit("\nABORT: product(s) %s not found." % CLEAR_SUBCAT_IDS)
    for pid, cat, sub, sku, nm in to_clear:
        print("    %-6s %-20s sub='%s'  %-12s %s" % (pid, cat, sub, sku, nm))

    # ================= PLAN =================
    touched = sorted(discovered_ids | set(CLEAR_SUBCAT_IDS))
    print("\n" + "-" * 74)
    print("PLAN")
    print("-" * 74)
    print("  Move %d products from category %d to %d" % (len(discovered_ids), UMBRELLAS_CAT, UMBRELLA_BASES_CAT))
    print("  Clear sub_category on %d product(s): %s" % (len(CLEAR_SUBCAT_IDS), CLEAR_SUBCAT_IDS))
    print("  Total rows touched: %d  ->  %s" % (len(touched), touched))

    if not COMMIT:
        print()
        print("=" * 74)
        print("DRY RUN. Nothing was written. Dev is unchanged.")
        print("=" * 74)
        cur.close()
        conn.close()
        return

    # ================= WRITE =================
    fp_before = fingerprint_products_except(cur, touched)

    cur.execute(
        "UPDATE products SET category_id = %s, updated_at = now() WHERE id = ANY(%s)",
        (UMBRELLA_BASES_CAT, sorted(discovered_ids)),
    )
    moved = cur.rowcount

    cur.execute(
        "UPDATE products SET sub_category = NULL, updated_at = now() WHERE id = ANY(%s)",
        (CLEAR_SUBCAT_IDS,),
    )
    cleared = cur.rowcount

    if moved != len(discovered_ids):
        conn.rollback()
        sys.exit("ABORT: moved %d rows, expected %d. ROLLED BACK." % (moved, len(discovered_ids)))
    if cleared != len(CLEAR_SUBCAT_IDS):
        conn.rollback()
        sys.exit("ABORT: cleared %d rows, expected %d. ROLLED BACK." % (cleared, len(CLEAR_SUBCAT_IDS)))

    fp_after = fingerprint_products_except(cur, touched)
    if fp_before != fp_after:
        conn.rollback()
        print("  before: %s" % (fp_before,))
        print("  after:  %s" % (fp_after,))
        sys.exit("ABORT: untouched product rows drifted. ROLLED BACK.")

    # verify the result
    cur.execute("SELECT count(*) FROM products WHERE category_id = %s", (UMBRELLAS_CAT,))
    umb = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM products WHERE category_id = %s", (UMBRELLA_BASES_CAT,))
    bases = cur.fetchone()[0]

    conn.commit()
    print()
    print("=" * 74)
    print("COMMITTED. Moved %d, cleared %d." % (moved, cleared))
    print("Umbrellas (38) now holds %d products. Umbrella Bases (39) now holds %d."
          % (umb, bases))
    print("All other product rows unchanged.")
    print("=" * 74)

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
