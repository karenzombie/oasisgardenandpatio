"""
Oasis -- PHASE 1: visibility flag coherence fix.

107 products, four groups, all changes under CURRENT code semantics
(available_online = appears in listings, quote_only = cannot purchase,
show_price_online = price rendered). No schema change. Dev DB only.

  GROUP A (80)  Homecrest Timber/Latitude tables and combo-SKU tables (incl. 3 Slate
                fire tables). Accidentally hidden by broad updates. Karen confirmed:
                these are orderable manufacturer configurations, should be visible,
                wishlist / call for price.
                -> available_online=TRUE, show_price_online=FALSE, quote_only=TRUE

  GROUP B (9)   7 Frankford aluminum top covers + 2 Echo 2-pack cushions. True
                components: surfaced only through pickers on parent PDPs. Stay hidden;
                gain quote_only for coherence.
                -> available_online stays FALSE, show_price_online=FALSE, quote_only=TRUE

  GROUP C (11)  Frankford replacement parts (ribs, straps, rope, spare kit). Karen
                confirmed: should be purchasable like the rest of Frankford.
                -> quote_only=FALSE (available_online / show_price_online already TRUE)

  GROUP D (7)   Elements padded slings + Echo 2-packs created in the rebuild with
                default flags. Homecrest is quote-only; these are also unpriced yet
                currently purchasable (frontend hasPrice guard is the only net).
                -> show_price_online=FALSE, quote_only=TRUE (stay visible)

SAFETY NET / REVERT:
  Before writing anything, this script copies the CURRENT full row state of all 107
  products into a backup table:  flag_fix_backup_phase1
  (created if absent; aborts if it already contains rows, so it cannot be silently
  overwritten). It also writes flag_fix_backup_phase1.csv to the working directory.
  The separate revert script restores all five flag columns from that table.

DRY RUN by default.

Run:      python3 flag_fix_phase1.py
Commit:   python3 -c "exec(open('flag_fix_phase1.py').read().replace('COMMIT = False', 'COMMIT = True'))"
"""
import os
import sys
import csv
import psycopg2
import psycopg2.extras

COMMIT = False

GROUP_A = [
    "254284BTMNU", "254284FTM", "254284FTMNU", "2542SBTM", "2542SBTMNU",
    "2542SFTM", "2542SFTMNU", "2548SBTMNU", "2548SFTMNU", "2721STM",
    "2722STM", "274284FTMNU", "2742SFTM", "2742SFTMNU", "3742RBTMNU",
    "3742RFTMNU", "3742SBTM", "3742SBTMNU", "3742SFTM", "3742SFTMNU",
    "3754RBTMNU", "3754RFTMNU", "42SQSLTT+89SNC", "6224S", "624274XBLT",
    "624274XFLT", "6242SBLT", "6242SBLTNU", "6242SFLT", "6242SFLTNU",
    "6254RBLT", "893252XSLTT+89XNC", "893660XSLTT+89XNC",
    "C0030RTM+2330B", "C0030RTM+2334B", "C0030RTM+2340B",
    "C0030RTMWH+2330B", "C0030RTMWH+2334B", "C0030RTMWH+2340B",
    "C0036RTM+2330B", "C0036RTM+2334B", "C0036RTM+2340B",
    "C0036RTMNU+2330B", "C0036RTMNU+2334B", "C0036RTMNU+2340B",
    "C0042RTM+3330B", "C0042RTM+3334B", "C0042RTM+3340B",
    "C0042RTMNU+2742RB", "C0042RTMNU+3330B", "C0042RTMNU+3334B",
    "C0042RTMNU+3340B", "C2424STM+2330B", "C2424STM+2334B",
    "C2424STM+2340B", "C2424STM+5723B", "C2644XTM+272644B",
    "C2644XTM+5744B", "C3030STM+2330B", "C3030STM+2334B",
    "C3030STM+2340B", "C3030STM+5723B", "C3030STMWH+2330B",
    "C3030STMWH+2334B", "C3030STMWH+2340B", "C3252XTM+273252B",
    "C3636STM+2330B", "C3636STM+2334B", "C3636STM+2340B",
    "C3636STMNU+2330B", "C3636STMNU+2334B", "C3636STMNU+2340B",
    "C3660XTM+273660B", "C4242STM+3330B", "C4242STM+3334B",
    "C4242STM+3340B", "C4242STMNU+2742SB", "C4242STMNU+3330B",
    "C4242STMNU+3334B", "C4242STMNU+3340B",
]
GROUP_B = ["20G-SQ-TC", "24G-SQ-TC", "24G-TC", "30G-TC", "36G-SQ-TC",
           "36G-TC", "40G-TC", "9435P-2", "9437P-2"]
GROUP_C = ["ARU-RIB", "ARU-SP", "ARU-WS", "ARUF-RIB", "CAM-RIB", "CAM-RIB-G",
           "CANOPY-SS", "ECU-RIB", "FM-RIB", "FM-RIB-G", "ROPE"]
GROUP_D = ["51190", "51690", "51790", "51890", "51990", "94350-2", "94370-2"]

ALL = GROUP_A + GROUP_B + GROUP_C + GROUP_D
BACKUP_TABLE = "flag_fix_backup_phase1"

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print(f"MODE: {'LIVE COMMIT' if COMMIT else 'DRY RUN -- nothing will be written'}\n")
print(f"  Group A (make visible, quote-only)      : {len(GROUP_A)}")
print(f"  Group B (stay hidden, gain quote_only)  : {len(GROUP_B)}")
print(f"  Group C (Frankford parts, make buyable) : {len(GROUP_C)}")
print(f"  Group D (new Homecrest, quote-only)     : {len(GROUP_D)}")
print(f"  total                                   : {len(ALL)}")
if len(set(ALL)) != len(ALL):
    print("ABORT: a SKU appears in more than one group.")
    sys.exit(1)

# --------------------------------------------------------- resolve products
print("\n" + "=" * 88)
print("STEP 1 -- resolve every SKU and verify its CURRENT flags match expectations")
print("=" * 88)

cur.execute("""
    SELECT id, sku, name, is_active, available_online, show_price_online,
           quote_only, in_store_only, price, sale_price
    FROM products WHERE sku = ANY(%s)
""", (ALL,))
rows = cur.fetchall()
by_sku = {}
dupes = []
for r in rows:
    if r["sku"] in by_sku:
        dupes.append(r["sku"])
    by_sku[r["sku"]] = r

missing = [s for s in ALL if s not in by_sku]
if missing or dupes:
    if missing:
        print(f"  !! SKUs not found: {missing}")
    if dupes:
        print(f"  !! duplicate SKUs: {dupes}")
    print("\nABORT. Nothing written.")
    conn.rollback()
    sys.exit(1)
print(f"  all {len(ALL)} SKUs resolved, one product each.")

# expected current state per group -- if a row does not look like what we diagnosed,
# something changed since the recon and we stop.
EXPECT = {}
for s in GROUP_A:
    EXPECT[s] = dict(available_online=False, quote_only=False)
for s in GROUP_B:
    EXPECT[s] = dict(available_online=False, quote_only=False)
for s in GROUP_C:
    EXPECT[s] = dict(available_online=True, show_price_online=True, quote_only=True)
for s in GROUP_D:
    EXPECT[s] = dict(available_online=True, quote_only=False)

drift = []
for s, exp in EXPECT.items():
    r = by_sku[s]
    for k, v in exp.items():
        if r[k] is not v:
            drift.append((s, k, r[k], v))
if drift:
    print("\n  !! CURRENT STATE DRIFT -- these rows do not match the recon diagnosis:")
    for s, k, got, want in drift:
        print(f"     {s:<20} {k} = {got} (diagnosis assumed {want})")
    print("\nABORT: the database changed since the recon. Re-diagnose before writing.")
    conn.rollback()
    sys.exit(1)
print("  current flags on all 107 rows match the recon diagnosis. No drift.")

# ---------------------------------------------- Group C price review table
print("\n" + "=" * 88)
print("STEP 2 -- GROUP C PRICE REVIEW (these 11 become BUYABLE; check prices vs MSRP book)")
print("=" * 88)
print(f"\n  {'SKU':<12} {'MSRP($)':>10} {'SALE($)':>10}  NAME")
for s in GROUP_C:
    r = by_sku[s]
    cur.execute("SELECT msrp, sale_price, price FROM products WHERE id = %s", (r["id"],))
    p = cur.fetchone()
    print(f"  {s:<12} {str(p['msrp']):>10} {str(p['sale_price']):>10}  {r['name']}")
print("\n  Quote-only has been hiding these prices from checkout until now. Verify against")
print("  the Frankford MSRP book before committing. Sale should be ceil(msrp x 0.90).")

# ------------------------------------------------------------- backup step
print("\n" + "=" * 88)
print(f"STEP 3 -- SNAPSHOT to {BACKUP_TABLE} (the revert source)")
print("=" * 88)

cur.execute("""
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name=%s
""", (BACKUP_TABLE,))
exists = cur.fetchone() is not None
if exists:
    cur.execute(f"SELECT COUNT(*) AS n FROM {BACKUP_TABLE}")
    n = cur.fetchone()["n"]
    if n:
        print(f"\n  !! {BACKUP_TABLE} already exists with {n} rows.")
        print("     Refusing to overwrite an existing snapshot. If a previous run was")
        print("     reverted and you want a fresh snapshot, drop the table first (ask Claude).")
        print("\nABORT. Nothing written.")
        conn.rollback()
        sys.exit(1)
    print(f"\n  {BACKUP_TABLE} exists and is empty. Will populate on commit.")
else:
    print(f"\n  {BACKUP_TABLE} does not exist. Will create on commit.")

# local CSV snapshot regardless of mode
with open("flag_fix_backup_phase1.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["id", "sku", "is_active", "available_online", "show_price_online",
                "quote_only", "in_store_only"])
    for s in ALL:
        r = by_sku[s]
        w.writerow([r["id"], r["sku"], r["is_active"], r["available_online"],
                    r["show_price_online"], r["quote_only"], r["in_store_only"]])
print(f"  WROTE flag_fix_backup_phase1.csv ({len(ALL)} rows). Download and keep it.")

# ------------------------------------------------------------- the changes
print("\n" + "=" * 88)
print("STEP 4 -- CHANGES")
print("=" * 88)
print(f"""
  GROUP A ({len(GROUP_A)}): available_online=T, show_price_online=F, quote_only=T
  GROUP B ({len(GROUP_B)}): show_price_online=F, quote_only=T (available_online stays F)
  GROUP C ({len(GROUP_C)}): quote_only=F (others untouched)
  GROUP D ({len(GROUP_D)}): show_price_online=F, quote_only=T (available_online stays T)
""")

if COMMIT:
    # snapshot into the backup table first, same transaction
    cur.execute(f"""
        CREATE TABLE IF NOT EXISTS {BACKUP_TABLE} (
            product_id INTEGER PRIMARY KEY,
            sku TEXT NOT NULL,
            is_active BOOLEAN NOT NULL,
            available_online BOOLEAN NOT NULL,
            show_price_online BOOLEAN NOT NULL,
            quote_only BOOLEAN NOT NULL,
            in_store_only BOOLEAN NOT NULL,
            snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    psycopg2.extras.execute_values(cur, f"""
        INSERT INTO {BACKUP_TABLE}
        (product_id, sku, is_active, available_online, show_price_online, quote_only, in_store_only)
        VALUES %s
    """, [(by_sku[s]["id"], s, by_sku[s]["is_active"], by_sku[s]["available_online"],
           by_sku[s]["show_price_online"], by_sku[s]["quote_only"], by_sku[s]["in_store_only"])
          for s in ALL])

    cur.execute("""
        UPDATE products SET available_online=TRUE, show_price_online=FALSE,
               quote_only=TRUE, updated_at=NOW()
        WHERE sku = ANY(%s)
    """, (GROUP_A,))
    cur.execute("""
        UPDATE products SET show_price_online=FALSE, quote_only=TRUE, updated_at=NOW()
        WHERE sku = ANY(%s)
    """, (GROUP_B,))
    cur.execute("""
        UPDATE products SET quote_only=FALSE, updated_at=NOW()
        WHERE sku = ANY(%s)
    """, (GROUP_C,))
    cur.execute("""
        UPDATE products SET show_price_online=FALSE, quote_only=TRUE, updated_at=NOW()
        WHERE sku = ANY(%s)
    """, (GROUP_D,))
    conn.commit()
    print("COMMITTED.\n")

    # ---------------------------------------------------------- verify
    fail = 0

    def check(desc, sql, params, expected):
        global fail
        cur.execute(sql, params)
        n = cur.fetchone()["n"]
        ok = n == expected
        if not ok:
            fail += 1
        print(f"  {desc}: {n} (expected {expected}){'' if ok else '   <-- FAIL'}")

    check("Group A rows now visible+quoteonly+nopx",
          """SELECT COUNT(*) AS n FROM products WHERE sku = ANY(%s)
             AND available_online IS TRUE AND show_price_online IS FALSE
             AND quote_only IS TRUE""", (GROUP_A,), len(GROUP_A))
    check("Group B rows hidden+quoteonly+nopx",
          """SELECT COUNT(*) AS n FROM products WHERE sku = ANY(%s)
             AND available_online IS FALSE AND show_price_online IS FALSE
             AND quote_only IS TRUE""", (GROUP_B,), len(GROUP_B))
    check("Group C rows visible+priced+buyable",
          """SELECT COUNT(*) AS n FROM products WHERE sku = ANY(%s)
             AND available_online IS TRUE AND show_price_online IS TRUE
             AND quote_only IS FALSE""", (GROUP_C,), len(GROUP_C))
    check("Group D rows visible+quoteonly+nopx",
          """SELECT COUNT(*) AS n FROM products WHERE sku = ANY(%s)
             AND available_online IS TRUE AND show_price_online IS FALSE
             AND quote_only IS TRUE""", (GROUP_D,), len(GROUP_D))
    check("backup table rows",
          f"SELECT COUNT(*) AS n FROM {BACKUP_TABLE}", (), len(ALL))

    # global coherence: the incoherent state should now be empty
    check("products remaining at available_online=F + quote_only=F (was 89)",
          """SELECT COUNT(*) AS n FROM products
             WHERE available_online IS FALSE AND quote_only IS FALSE""", (), 0)
    # safety net: visible + purchasable + no price should now be empty
    check("visible+purchasable products with NO price (was 7)",
          """SELECT COUNT(*) AS n FROM products
             WHERE is_active IS TRUE AND available_online IS TRUE AND quote_only IS FALSE
             AND COALESCE(price,0)=0 AND COALESCE(sale_price,0)=0
             AND COALESCE(msrp,0)=0""", (), 0)

    print(f"\n  failures: {fail}")
    if fail == 0:
        print("\n  Phase 1 complete and verified. Revert available via flag_fix_phase1_revert.py")
    else:
        print("\n  !! VERIFICATION FAILED. Do not proceed. Revert is available.")
else:
    conn.rollback()
    print("DRY RUN COMPLETE -- nothing written.")
    print()
    print("Review the Group C prices above, then to commit:")
    print('  python3 -c "exec(open(\'flag_fix_phase1.py\').read().replace(\'COMMIT = False\', \'COMMIT = True\'))"')

cur.close()
conn.close()
