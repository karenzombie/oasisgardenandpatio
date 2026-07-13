"""
Oasis -- PHASE 1B REVERT. Restores flags from flag_fix_backup_phase1b. Restore, not
re-derivation. DRY RUN by default.

Run:      python3 flag_fix_phase1b_revert.py
Commit:   python3 -c "exec(open('flag_fix_phase1b_revert.py').read().replace('COMMIT = False', 'COMMIT = True'))"
"""
import os, sys, psycopg2, psycopg2.extras

COMMIT = False
BACKUP_TABLE = "flag_fix_backup_phase1b"

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
print(f"MODE: {'LIVE REVERT' if COMMIT else 'DRY RUN'}\n")

cur.execute("""SELECT 1 FROM information_schema.tables
               WHERE table_schema='public' AND table_name=%s""", (BACKUP_TABLE,))
if not cur.fetchone():
    print(f"ABORT: {BACKUP_TABLE} does not exist."); sys.exit(1)
cur.execute(f"SELECT COUNT(*) AS n FROM {BACKUP_TABLE}")
n = cur.fetchone()["n"]
if not n:
    print(f"ABORT: {BACKUP_TABLE} is empty."); sys.exit(1)
print(f"snapshot rows: {n}")

cur.execute(f"""
    SELECT COUNT(*) AS n FROM {BACKUP_TABLE} b JOIN products p ON p.id=b.product_id
    WHERE p.available_online IS DISTINCT FROM b.available_online
       OR p.quote_only IS DISTINCT FROM b.quote_only
       OR p.show_price_online IS DISTINCT FROM b.show_price_online
       OR p.is_active IS DISTINCT FROM b.is_active
       OR p.in_store_only IS DISTINCT FROM b.in_store_only
""")
print(f"rows currently differing from snapshot (will be restored): {cur.fetchone()['n']}")

if COMMIT:
    cur.execute(f"""
        UPDATE products p SET
            is_active=b.is_active, available_online=b.available_online,
            show_price_online=b.show_price_online, quote_only=b.quote_only,
            in_store_only=b.in_store_only, updated_at=NOW()
        FROM {BACKUP_TABLE} b WHERE p.id=b.product_id
    """)
    conn.commit()
    print("\nREVERTED.")
    cur.execute(f"""
        SELECT COUNT(*) AS n FROM {BACKUP_TABLE} b JOIN products p ON p.id=b.product_id
        WHERE p.available_online IS DISTINCT FROM b.available_online
           OR p.quote_only IS DISTINCT FROM b.quote_only
           OR p.show_price_online IS DISTINCT FROM b.show_price_online
           OR p.is_active IS DISTINCT FROM b.is_active
           OR p.in_store_only IS DISTINCT FROM b.in_store_only
    """)
    n = cur.fetchone()["n"]
    print(f"rows still differing after revert: {n} (expected 0)")
else:
    conn.rollback()
    print('\nDRY RUN COMPLETE.\nTo revert:\n  python3 -c "exec(open(\'flag_fix_phase1b_revert.py\').read().replace(\'COMMIT = False\', \'COMMIT = True\'))"')
cur.close(); conn.close()
