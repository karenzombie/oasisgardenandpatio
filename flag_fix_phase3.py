"""
Oasis -- PHASE 3: normalize available_online to its new meaning (purchasable).

After Phase 2, nothing customer-facing reads available_online for visibility anymore.
But ~2,700 quote-only products still carry available_online=TRUE from the old semantics,
so the admin "Available online" toggle shows ON while the status bar correctly says
inquiry mode. This phase makes the toggle honest.

RULE (simple and total):  available_online = NOT quote_only

  quote_only=TRUE  (call for price)  -> available_online=FALSE   (toggle shows OFF)
  quote_only=FALSE (purchasable)     -> available_online=TRUE    (toggle shows ON)

Customer-facing behavior is untouched:
  - listings read catalog_visible (not touched here)
  - cart/checkout block on quote_only first; a quote-only product was already
    unbuyable, and a purchasable product already had available_online=TRUE
  - show_price_online is not touched

SAFETY NET: snapshot of every row that will change into flag_fix_backup_phase3
plus flag_fix_backup_phase3.csv. Revert: flag_fix_phase3_revert.py.

POST-COMMIT INVARIANTS:
  - rows where available_online != NOT quote_only : 0
  - catalog_visible untouched (count of visible products unchanged)
  - purchasable set unchanged: still only Frankford/Galtech/Treasure Garden, all priced

DRY RUN by default.

Run:      python3 flag_fix_phase3.py
Commit:   python3 -c "exec(open('flag_fix_phase3.py').read().replace('COMMIT = False', 'COMMIT = True'))"
"""
import os
import sys
import csv
import psycopg2
import psycopg2.extras

COMMIT = False
BACKUP_TABLE = "flag_fix_backup_phase3"

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print(f"MODE: {'LIVE COMMIT' if COMMIT else 'DRY RUN -- nothing will be written'}\n")

# ------------------------------------------------- pre-state and what changes
cur.execute("SELECT COUNT(*) AS n FROM products WHERE catalog_visible IS TRUE")
visible_before = cur.fetchone()["n"]
print(f"catalog_visible=TRUE products before: {visible_before}  (must be unchanged after)")

cur.execute("""
    SELECT COALESCE(m.name,'(none)') AS mfg,
           COUNT(*) AS to_change
    FROM products p LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
    WHERE p.available_online IS DISTINCT FROM (NOT p.quote_only)
    GROUP BY 1 ORDER BY 2 DESC
""")
rows = cur.fetchall()
total_change = sum(r["to_change"] for r in rows)
print(f"\nrows where available_online disagrees with NOT quote_only: {total_change}")
print(f"\n  {'MANUFACTURER':<26} {'ROWS TO FLIP':>12}")
for r in rows:
    print(f"  {r['mfg']:<26} {r['to_change']:>12}")

if total_change == 0:
    print("\nNothing to do. Already normalized.")
    conn.rollback(); sys.exit(0)

# direction sanity: every changing row should be quote_only=TRUE going TRUE->FALSE.
# a purchasable row with available_online=FALSE would be a customer-facing change; abort.
cur.execute("""
    SELECT COUNT(*) AS n FROM products
    WHERE available_online IS DISTINCT FROM (NOT quote_only)
      AND quote_only IS FALSE
""")
weird = cur.fetchone()["n"]
print(f"\npurchasable rows currently hidden-from-purchase (would flip OFF->ON): {weird}")
if weird:
    print("ABORT: unexpected direction. A purchasable product has available_online=FALSE,")
    print("which would be a real behavior change, not cosmetic. Investigate before running.")
    conn.rollback(); sys.exit(1)
print("All changing rows are quote-only products flipping TRUE->FALSE. Cosmetic only.")

# ---------------------------------------------------------------- snapshot
print("\n" + "=" * 88)
print(f"SNAPSHOT to {BACKUP_TABLE}")
print("=" * 88)

cur.execute("""SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=%s""", (BACKUP_TABLE,))
if cur.fetchone():
    cur.execute(f"SELECT COUNT(*) AS n FROM {BACKUP_TABLE}")
    if cur.fetchone()["n"]:
        print(f"!! {BACKUP_TABLE} already has rows. Refusing to overwrite. ABORT.")
        conn.rollback(); sys.exit(1)
    print(f"{BACKUP_TABLE} exists, empty. Will populate on commit.")
else:
    print(f"{BACKUP_TABLE} does not exist. Will create on commit.")

cur.execute("""
    SELECT id, sku, available_online, quote_only
    FROM products
    WHERE available_online IS DISTINCT FROM (NOT quote_only)
    ORDER BY sku
""")
changing = cur.fetchall()
with open("flag_fix_backup_phase3.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["id", "sku", "available_online", "quote_only"])
    for r in changing:
        w.writerow([r["id"], r["sku"], r["available_online"], r["quote_only"]])
print(f"WROTE flag_fix_backup_phase3.csv ({len(changing)} rows). Download and keep it.")

# ------------------------------------------------------------------- write
print("\n" + "=" * 88)
print(f"CHANGE: available_online = NOT quote_only on {total_change} rows. Nothing else.")
print("=" * 88)

if COMMIT:
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {BACKUP_TABLE} (
            product_id INTEGER PRIMARY KEY, sku TEXT NOT NULL,
            available_online BOOLEAN NOT NULL, quote_only BOOLEAN NOT NULL,
            snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW())
    """)
    psycopg2.extras.execute_values(cur, f"""
        INSERT INTO {BACKUP_TABLE} (product_id, sku, available_online, quote_only) VALUES %s
    """, [(r["id"], r["sku"], r["available_online"], r["quote_only"]) for r in changing])

    cur.execute("""
        UPDATE products SET available_online = NOT quote_only, updated_at = NOW()
        WHERE available_online IS DISTINCT FROM (NOT quote_only)
    """)
    conn.commit()
    print("COMMITTED.\n")

    fail = 0
    def check(desc, sql, expected):
        global fail
        cur.execute(sql)
        n = cur.fetchone()["n"]
        ok = n == expected
        if not ok: fail += 1
        print(f"  {desc}: {n} (expected {expected}){'' if ok else '   <-- FAIL'}")

    check("rows where available_online != NOT quote_only",
          "SELECT COUNT(*) AS n FROM products WHERE available_online IS DISTINCT FROM (NOT quote_only)", 0)
    check("catalog_visible=TRUE products (unchanged)",
          "SELECT COUNT(*) AS n FROM products WHERE catalog_visible IS TRUE", visible_before)
    check("backup table rows", f"SELECT COUNT(*) AS n FROM {BACKUP_TABLE}", total_change)
    check("purchasable products outside Frankford/Galtech/Treasure Garden",
          """SELECT COUNT(*) AS n FROM products p JOIN manufacturers m ON m.id=p.manufacturer_id
             WHERE p.quote_only IS FALSE
             AND m.name NOT ILIKE '%frankford%' AND m.name NOT ILIKE '%galtech%'
             AND m.name NOT ILIKE '%treasure%'""", 0)
    check("purchasable products with NO price",
          """SELECT COUNT(*) AS n FROM products
             WHERE quote_only IS FALSE AND COALESCE(price,0)=0
             AND COALESCE(sale_price,0)=0 AND COALESCE(msrp,0)=0""", 0)

    print(f"\n  failures: {fail}")
    if fail == 0:
        print("\n  Phase 3 complete and verified. Revert: flag_fix_phase3_revert.py")
    else:
        print("\n  !! VERIFICATION FAILED. Revert is available.")
else:
    conn.rollback()
    print("\nDRY RUN COMPLETE -- nothing written.")
    print('\nTo commit:\n  python3 -c "exec(open(\'flag_fix_phase3.py\').read().replace(\'COMMIT = False\', \'COMMIT = True\'))"')

cur.close(); conn.close()
