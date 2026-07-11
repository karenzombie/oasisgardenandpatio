import os
import psycopg2
import psycopg2.extras

COMMIT = False

MANUFACTURER_ID = 16
FRAME_FINISH_IDS = [290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300]
AVA_PRODUCT_IDS = [3942, 3943, 3944]
HDPE_FINISH_IDS = [517, 518]
NEW_COLLECTION_LABEL = 'Table Top & HDPE Finishes'

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor()

print("=" * 60)
print("HDPE FINISH FIX -- DRY RUN" if not COMMIT else "HDPE FINISH FIX -- LIVE COMMIT")
print("=" * 60)

# ── Step 1: Rename frame finishes collection label ────────────
print("\n[1] UPDATE finishes.collection ON ids 290-300")
cur.execute("SELECT id, name, collection FROM finishes WHERE id BETWEEN 290 AND 300 ORDER BY id")
rows = cur.fetchall()
for r in rows:
    if COMMIT:
        cur.execute("UPDATE finishes SET collection = %s WHERE id = %s", (NEW_COLLECTION_LABEL, r[0]))
        print(f"  Updated id={r[0]} {r[1]}: collection -> '{NEW_COLLECTION_LABEL}'")
    else:
        print(f"  DRY RUN: id={r[0]} {r[1]} | current collection={repr(r[2])} -> '{NEW_COLLECTION_LABEL}'")

# ── Step 2: Remove Ava Cushion wiring to HDPE finishes ───────
print("\n[2] DELETE product_finish_options for HDPE finishes (517, 518) on Ava Cushion")
cur.execute("""
    SELECT pfo.id, p.id, p.sku, pfo.finish_id
    FROM product_finish_options pfo
    JOIN products p ON p.id = pfo.product_id
    WHERE pfo.product_id IN %s AND pfo.finish_id IN %s
    ORDER BY p.id, pfo.finish_id
""", (tuple(AVA_PRODUCT_IDS), tuple(HDPE_FINISH_IDS)))
rows = cur.fetchall()
for r in rows:
    if COMMIT:
        cur.execute("DELETE FROM product_finish_options WHERE id = %s", (r[0],))
        print(f"  Deleted pfo id={r[0]} product={r[2]} finish_id={r[3]}")
    else:
        print(f"  DRY RUN: Would delete pfo id={r[0]} product={r[2]} finish_id={r[3]}")

# ── Step 3: Delete HDPE finish records ───────────────────────
print("\n[3] DELETE finishes records 517, 518")
cur.execute("SELECT id, name FROM finishes WHERE id IN %s", (tuple(HDPE_FINISH_IDS),))
rows = cur.fetchall()
for r in rows:
    if COMMIT:
        cur.execute("DELETE FROM finishes WHERE id = %s", (r[0],))
        print(f"  Deleted finish id={r[0]} name={r[1]}")
    else:
        print(f"  DRY RUN: Would delete finish id={r[0]} name={r[1]}")

# ── Step 4: Wire Ava Cushion to 11 standard frame finishes ───
print("\n[4] WIRE Ava Cushion (3942-3944) to 11 standard frame finishes")
for pid in AVA_PRODUCT_IDS:
    for order, fid in enumerate(FRAME_FINISH_IDS, start=1):
        cur.execute("SELECT id FROM product_finish_options WHERE product_id = %s AND finish_id = %s", (pid, fid))
        if cur.fetchone():
            print(f"  id={pid}/finish={fid}: already exists, skipping.")
            continue
        if COMMIT:
            cur.execute("""
                INSERT INTO product_finish_options (product_id, finish_id, display_order, upcharge_msrp, upcharge_sale)
                VALUES (%s, %s, %s, 0, 0)
            """, (pid, fid, order))
        else:
            print(f"  DRY RUN: Would wire product_id={pid} finish_id={fid} order={order}")

if COMMIT:
    print(f"  Wired {len(AVA_PRODUCT_IDS)} products x {len(FRAME_FINISH_IDS)} finishes.")
else:
    print(f"  DRY RUN: Would wire {len(FRAME_FINISH_IDS)} finishes to {len(AVA_PRODUCT_IDS)} products.")

# ── Step 5: Verification ──────────────────────────────────────
print("\n[5] VERIFICATION")

print("  Frame finishes 290-300 collection label:")
cur.execute("SELECT id, name, collection FROM finishes WHERE id BETWEEN 290 AND 300 ORDER BY id")
for r in cur.fetchall():
    status = "OK" if r[2] == NEW_COLLECTION_LABEL else "MISMATCH"
    print(f"    {status} id={r[0]} {r[1]} | collection={repr(r[2])}")

print("\n  HDPE finishes 517/518 -- should be gone:")
cur.execute("SELECT id, name FROM finishes WHERE id IN (517, 518)")
rows = cur.fetchall()
if rows:
    for r in rows:
        print(f"    STILL EXISTS: id={r[0]} {r[1]}")
else:
    print("    OK -- both deleted.")

print("\n  Ava Cushion finish wiring:")
cur.execute("""
    SELECT p.id, p.sku, COUNT(pfo.id) AS finish_ct,
           bool_or(pfo.finish_id IN (517, 518)) AS has_hdpe
    FROM products p
    LEFT JOIN product_finish_options pfo ON pfo.product_id = p.id
    WHERE p.id IN (3942, 3943, 3944)
    GROUP BY p.id, p.sku
    ORDER BY p.id
""")
for r in cur.fetchall():
    finish_ok = r[2] == 11
    hdpe_ok = not r[3]
    status = "OK" if finish_ok and hdpe_ok else "MISMATCH"
    print(f"    {status} id={r[0]} {r[1]} | {r[2]} finishes {'OK' if finish_ok else 'MISMATCH (expected 11)'} | hdpe_gone={'OK' if hdpe_ok else 'STILL WIRED'}")

if COMMIT:
    conn.commit()
    print("\nCOMMIT COMPLETE.")
else:
    conn.rollback()
    print("\nDRY RUN COMPLETE. No changes written.")

cur.close()
conn.close()
