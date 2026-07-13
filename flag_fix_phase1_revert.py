"""
Oasis -- PHASE 1 REVERT.

Restores the five visibility flag columns on all products touched by flag_fix_phase1.py,
using the flag_fix_backup_phase1 snapshot table as the source of truth. This is a restore,
not a re-derivation: every column goes back to exactly the value it held at snapshot time.

DRY RUN by default.

Run:      python3 flag_fix_phase1_revert.py
Commit:   python3 -c "exec(open('flag_fix_phase1_revert.py').read().replace('COMMIT = False', 'COMMIT = True'))"
"""
import os
import sys
import psycopg2
import psycopg2.extras

COMMIT = False
BACKUP_TABLE = "flag_fix_backup_phase1"

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print(f"MODE: {'LIVE REVERT' if COMMIT else 'DRY RUN -- nothing will be written'}\n")

cur.execute("""
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name=%s
""", (BACKUP_TABLE,))
if cur.fetchone() is None:
    print(f"ABORT: {BACKUP_TABLE} does not exist. There is nothing to revert from.")
    sys.exit(1)

cur.execute(f"SELECT * FROM {BACKUP_TABLE} ORDER BY sku")
snap = cur.fetchall()
if not snap:
    print(f"ABORT: {BACKUP_TABLE} is empty. There is nothing to revert from.")
    sys.exit(1)

print(f"snapshot rows: {len(snap)}  (taken {snap[0]['snapshot_at']})\n")

# show what would change
cur.execute(f"""
    SELECT p.sku,
           p.available_online AS cur_vis,  b.available_online  AS snap_vis,
           p.show_price_online AS cur_px,  b.show_price_online AS snap_px,
           p.quote_only AS cur_quo,        b.quote_only        AS snap_quo,
           p.is_active AS cur_act,         b.is_active         AS snap_act,
           p.in_store_only AS cur_store,   b.in_store_only     AS snap_store
    FROM {BACKUP_TABLE} b JOIN products p ON p.id = b.product_id
    ORDER BY b.sku
""")
rows = cur.fetchall()


def b_(v):
    return {True: "T", False: "F", None: "-"}[v]


diff = [r for r in rows if (r["cur_vis"], r["cur_px"], r["cur_quo"], r["cur_act"], r["cur_store"])
        != (r["snap_vis"], r["snap_px"], r["snap_quo"], r["snap_act"], r["snap_store"])]
print(f"rows that currently differ from the snapshot (will be restored): {len(diff)}")
print(f"rows already identical to the snapshot: {len(rows) - len(diff)}\n")
print(f"  {'SKU':<20} {'CURRENT v/p/q':<15} {'SNAPSHOT v/p/q':<15}")
for r in diff:
    print(f"  {r['sku']:<20} {b_(r['cur_vis'])}/{b_(r['cur_px'])}/{b_(r['cur_quo']):<12} "
          f"{b_(r['snap_vis'])}/{b_(r['snap_px'])}/{b_(r['snap_quo'])}")

if COMMIT:
    cur.execute(f"""
        UPDATE products p SET
            is_active         = b.is_active,
            available_online  = b.available_online,
            show_price_online = b.show_price_online,
            quote_only        = b.quote_only,
            in_store_only     = b.in_store_only,
            updated_at        = NOW()
        FROM {BACKUP_TABLE} b
        WHERE p.id = b.product_id
    """)
    conn.commit()
    print("\nREVERTED.\n")

    cur.execute(f"""
        SELECT COUNT(*) AS n
        FROM {BACKUP_TABLE} b JOIN products p ON p.id = b.product_id
        WHERE p.is_active         IS DISTINCT FROM b.is_active
           OR p.available_online  IS DISTINCT FROM b.available_online
           OR p.show_price_online IS DISTINCT FROM b.show_price_online
           OR p.quote_only        IS DISTINCT FROM b.quote_only
           OR p.in_store_only     IS DISTINCT FROM b.in_store_only
    """)
    n = cur.fetchone()["n"]
    print(f"  rows still differing from snapshot after revert: {n} (expected 0)")
    if n == 0:
        print("\n  Revert complete and verified. The snapshot table is retained for the record.")
    else:
        print("\n  !! REVERT VERIFICATION FAILED. Tell Claude immediately.")
else:
    conn.rollback()
    print("\nDRY RUN COMPLETE -- nothing written.")
    print()
    print("To revert for real:")
    print('  python3 -c "exec(open(\'flag_fix_phase1_revert.py\').read().replace(\'COMMIT = False\', \'COMMIT = True\'))"')

cur.close()
conn.close()
