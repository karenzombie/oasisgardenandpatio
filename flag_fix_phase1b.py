"""
Oasis -- PHASE 1B: unhide the 406 coherently-hidden Homecrest products.

Karen's decision (July 12): all 406 REVIEW rows from hidden_products_review.csv become
VISIBLE. They are complete, orderable Homecrest tables / fire tables / accessories that were
hidden wholesale during earlier bulk updates. They join the standard Homecrest presentation:
visible, no price shown, call for price / wishlist, cart blocked by quote_only.

The 13 true components (6 Echo cushion SKUs + 7 Frankford top covers) are NOT touched and
stay hidden.

Change per row:  available_online = TRUE.  Nothing else. All 406 already have
quote_only=TRUE and show_price_online=FALSE, which the script verifies per row and aborts
on any drift.

SAFETY NET:  snapshot of all touched rows into flag_fix_backup_phase1b (separate table;
Phase 1's snapshot stays pristine) plus flag_fix_backup_phase1b.csv. Revert script:
flag_fix_phase1b_revert.py.

POST-COMMIT GLOBAL INVARIANT CHECKS:
  - hidden products remaining platform-wide = 13 (the components)
  - purchasable products exist ONLY under Frankford / Galtech / Treasure Garden
  - every purchasable product has a price
DRY RUN by default.

Run:      python3 flag_fix_phase1b.py
Commit:   python3 -c "exec(open('flag_fix_phase1b.py').read().replace('COMMIT = False', 'COMMIT = True'))"
"""
import os
import sys
import csv
import psycopg2
import psycopg2.extras

COMMIT = False
BACKUP_TABLE = "flag_fix_backup_phase1b"
CSV_FILE = "hidden_products_review.csv"

COMPONENTS = {"9435P", "9435P-2", "9437P", "9437P-2", "9448P", "9458P",
              "20G-SQ-TC", "24G-SQ-TC", "24G-TC", "30G-TC", "36G-SQ-TC",
              "36G-TC", "40G-TC"}

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print(f"MODE: {'LIVE COMMIT' if COMMIT else 'DRY RUN -- nothing will be written'}\n")

rows = list(csv.DictReader(open(CSV_FILE, newline="", encoding="utf-8-sig")))
review = [r for r in rows if r["suggested_bucket"] == "REVIEW"]
comps  = [r for r in rows if r["suggested_bucket"] == "COMPONENT"]
print(f"CSV rows: {len(rows)}  (REVIEW -> visible: {len(review)}, COMPONENT -> untouched: {len(comps)})")

if {r["sku"] for r in comps} != COMPONENTS:
    print("ABORT: the CSV's COMPONENT set does not match the 13 known components.")
    print("  csv:", sorted(r["sku"] for r in comps))
    sys.exit(1)

skus = [r["sku"] for r in review]
if len(set(skus)) != len(skus):
    print("ABORT: duplicate SKUs in the review list.")
    sys.exit(1)

# --------------------------------------------------------- resolve + drift check
print("\n" + "=" * 88)
print("STEP 1 -- resolve all 406 and verify current state (hidden, quote-only, no price shown)")
print("=" * 88)

cur.execute("""
    SELECT id, sku, name, is_active, available_online, show_price_online,
           quote_only, in_store_only
    FROM products WHERE manufacturer_id = 16 AND sku = ANY(%s)
""", (skus,))
db = {r["sku"]: r for r in cur.fetchall()}

missing = [s for s in skus if s not in db]
if missing:
    print(f"  !! not found under Homecrest: {missing}")
    print("ABORT."); conn.rollback(); sys.exit(1)

drift = [s for s in skus if not (db[s]["available_online"] is False
                                 and db[s]["quote_only"] is True
                                 and db[s]["show_price_online"] is False)]
if drift:
    print(f"  !! {len(drift)} rows are not in the expected hidden/quote-only/no-px state:")
    for s in drift[:20]:
        r = db[s]
        print(f"     {s:<22} vis={r['available_online']} quo={r['quote_only']} px={r['show_price_online']}")
    print("ABORT: state drifted since the review list was generated.")
    conn.rollback(); sys.exit(1)

print(f"  all {len(skus)} rows resolved and in the expected state. No drift.")

# --------------------------------------------------------------- snapshot
print("\n" + "=" * 88)
print(f"STEP 2 -- SNAPSHOT to {BACKUP_TABLE}")
print("=" * 88)

cur.execute("""SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=%s""", (BACKUP_TABLE,))
if cur.fetchone():
    cur.execute(f"SELECT COUNT(*) AS n FROM {BACKUP_TABLE}")
    if cur.fetchone()["n"]:
        print(f"  !! {BACKUP_TABLE} already has rows. Refusing to overwrite. ABORT.")
        conn.rollback(); sys.exit(1)
    print(f"  {BACKUP_TABLE} exists, empty. Will populate on commit.")
else:
    print(f"  {BACKUP_TABLE} does not exist. Will create on commit.")

with open("flag_fix_backup_phase1b.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["id", "sku", "is_active", "available_online", "show_price_online",
                "quote_only", "in_store_only"])
    for s in skus:
        r = db[s]
        w.writerow([r["id"], r["sku"], r["is_active"], r["available_online"],
                    r["show_price_online"], r["quote_only"], r["in_store_only"]])
print(f"  WROTE flag_fix_backup_phase1b.csv ({len(skus)} rows). Download and keep it.")

# ------------------------------------------------------------------ change
print("\n" + "=" * 88)
print("STEP 3 -- CHANGE: available_online = TRUE on all 406. Nothing else.")
print("=" * 88)

if COMMIT:
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {BACKUP_TABLE} (
            product_id INTEGER PRIMARY KEY, sku TEXT NOT NULL,
            is_active BOOLEAN NOT NULL, available_online BOOLEAN NOT NULL,
            show_price_online BOOLEAN NOT NULL, quote_only BOOLEAN NOT NULL,
            in_store_only BOOLEAN NOT NULL,
            snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW())
    """)
    psycopg2.extras.execute_values(cur, f"""
        INSERT INTO {BACKUP_TABLE}
        (product_id, sku, is_active, available_online, show_price_online, quote_only, in_store_only)
        VALUES %s
    """, [(db[s]["id"], s, db[s]["is_active"], db[s]["available_online"],
           db[s]["show_price_online"], db[s]["quote_only"], db[s]["in_store_only"]) for s in skus])

    cur.execute("""
        UPDATE products SET available_online = TRUE, updated_at = NOW()
        WHERE manufacturer_id = 16 AND sku = ANY(%s)
    """, (skus,))
    conn.commit()
    print("COMMITTED.\n")

    fail = 0
    def check(desc, sql, params, expected):
        global fail
        cur.execute(sql, params)
        n = cur.fetchone()["n"]
        ok = n == expected
        if not ok: fail += 1
        print(f"  {desc}: {n} (expected {expected}){'' if ok else '   <-- FAIL'}")

    check("the 406 now visible + quote-only + no price shown",
          """SELECT COUNT(*) AS n FROM products WHERE sku = ANY(%s)
             AND available_online IS TRUE AND quote_only IS TRUE
             AND show_price_online IS FALSE""", (skus,), len(skus))
    check("backup table rows", f"SELECT COUNT(*) AS n FROM {BACKUP_TABLE}", (), len(skus))
    check("hidden products remaining platform-wide (the 13 components)",
          "SELECT COUNT(*) AS n FROM products WHERE available_online IS FALSE", (), 13)
    check("purchasable products outside Frankford/Galtech/Treasure Garden",
          """SELECT COUNT(*) AS n FROM products p JOIN manufacturers m ON m.id=p.manufacturer_id
             WHERE p.quote_only IS FALSE
             AND m.name NOT ILIKE '%%frankford%%' AND m.name NOT ILIKE '%%galtech%%'
             AND m.name NOT ILIKE '%%treasure%%'""", (), 0)
    check("purchasable products with NO price anywhere",
          """SELECT COUNT(*) AS n FROM products
             WHERE quote_only IS FALSE AND available_online IS TRUE
             AND COALESCE(price,0)=0 AND COALESCE(sale_price,0)=0 AND COALESCE(msrp,0)=0""",
          (), 0)

    print(f"\n  failures: {fail}")
    if fail == 0:
        print("\n  Phase 1B complete and verified. Revert: flag_fix_phase1b_revert.py")
    else:
        print("\n  !! VERIFICATION FAILED. Do not proceed. Revert is available.")
else:
    conn.rollback()
    print("\nDRY RUN COMPLETE -- nothing written.")
    print('\nTo commit:\n  python3 -c "exec(open(\'flag_fix_phase1b.py\').read().replace(\'COMMIT = False\', \'COMMIT = True\'))"')

cur.close(); conn.close()
