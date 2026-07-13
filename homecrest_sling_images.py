"""
Homecrest -- copy Sling images to their Padded Sling siblings.

40 Padded Sling products have no image. The padded sling is the same frame and the same photo
as the sling version, so each one reuses its sling sibling's image.

Pairings come from two verified sources, never from SKU arithmetic:

  28 pairs  -- derived from the database by matching product names in the discovery run
               (Harbor, Holly Hill, Kashton, Stella, Sutton)
  12 pairs  -- read directly from the 2026 Blair and Elements sell sheets, which have a real
               text layer, so the SKUs are exactly as printed
               (Blair, Elements)

Note Kashton pairs 1K200 to 1K300 and Blair pairs 10201 to 10301 / 10202 to 10302. Adjacent
number logic would get both wrong. Every pair below is explicit.

What gets copied: every product_images row on the source, reproduced against the target with
  url, alt_text, is_primary, display_order, image_kind, finish_id  copied as-is
  variant_id  forced to NULL

ABORTS before writing if:
  - any SKU does not resolve to exactly one Homecrest product
  - any target already has an image
  - any source has zero images
  - any source image carries a variant_id

DRY RUN by default.

Run:      python3 homecrest_sling_images.py
Commit:   python3 -c "exec(open('homecrest_sling_images.py').read().replace('COMMIT = False', 'COMMIT = True'))"
"""
import os
import sys
import psycopg2
import psycopg2.extras

COMMIT = False

MANUFACTURER_ID = 16

# target (Padded Sling, no image)  ->  source (Sling, has image)
PAIRS = [
    # ---- Blair (from the 2026 Blair sell sheet, S -> PS) ----
    ("10190",  "10180"),   # High Back Dining Chair
    ("10201",  "10301"),   # Armless Adjustable Chaise
    ("10202",  "10302"),   # Adjustable Chaise
    ("10690",  "10680"),   # Low Back Dining Chair
    ("10890",  "10880"),   # Low Back Swivel Rocker
    ("10990",  "10980"),   # High Back Swivel Rocker
    ("99130",  "99120"),   # Ottoman

    # ---- Elements (from the 2026 Elements sell sheet, S -> PS) ----
    ("51190",  "51180"),   # High Back Dining Chair
    ("51690",  "51680"),   # Low Back Dining Chair
    ("51790",  "51780"),   # Swivel Rocker Balcony Stool
    ("51890",  "51880"),   # Low Back Swivel Rocker
    ("51990",  "51980"),   # High Back Swivel Rocker

    # ---- Harbor ----
    ("32190",  "32180"),
    ("32691",  "32681"),
    ("32791",  "32781"),
    ("32890",  "32880"),
    ("32990",  "32980"),

    # ---- Holly Hill ----
    ("2A190",  "2A180"),
    ("2A459",  "2A449"),
    ("2A490",  "2A480"),
    ("2A690",  "2A680"),
    ("2A790",  "2A780"),
    ("2A890",  "2A880"),
    ("2A990",  "2A980"),

    # ---- Kashton ----
    ("1K190",  "1K180"),
    ("1K200",  "1K300"),   # chaise: NOT adjacent
    ("1K690",  "1K680"),
    ("1K791",  "1K781"),
    ("1K890",  "1K880"),
    ("1K990",  "1K980"),

    # ---- Stella ----
    ("7A190",  "7A180"),
    ("7A691",  "7A681"),
    ("7A791",  "7A781"),
    ("7A890",  "7A880"),
    ("7A990",  "7A980"),

    # ---- Sutton ----
    ("45190",  "45180"),
    ("45690",  "45680"),
    ("45791",  "45781"),
    ("45890",  "45880"),
    ("45990",  "45980"),
]

conn = psycopg2.connect(os.environ["DATABASE_URL"])
cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

print(f"MODE: {'LIVE COMMIT' if COMMIT else 'DRY RUN -- nothing will be written'}\n")
print(f"pairs to process: {len(PAIRS)}   (expected 40)")

targets = [t for t, s in PAIRS]
sources = sorted({s for t, s in PAIRS})
if len(set(targets)) != len(targets):
    print("ABORT: duplicate target SKU in PAIRS.")
    sys.exit(1)

# --------------------------------------------------------- resolve products
print("\n" + "=" * 82)
print("STEP 1 -- resolve every SKU")
print("=" * 82)

cur.execute("""
    SELECT id, sku, name, collection
    FROM products
    WHERE manufacturer_id = %s AND sku = ANY(%s)
""", (MANUFACTURER_ID, targets + sources))
rows = cur.fetchall()

by_sku = {}
dupes = []
for r in rows:
    if r["sku"] in by_sku:
        dupes.append(r["sku"])
    by_sku[r["sku"]] = r

missing = [s for s in targets + sources if s not in by_sku]
if missing:
    print(f"  !! SKUs not found under Homecrest: {missing}")
if dupes:
    print(f"  !! duplicate SKUs: {dupes}")
if missing or dupes:
    print("\nABORT: SKU resolution failed. Nothing written.")
    conn.rollback()
    sys.exit(1)

print(f"  all {len(set(targets + sources))} SKUs resolved, one product each.")

# ------------------------------------------------------------ image checks
print("\n" + "=" * 82)
print("STEP 2 -- verify image state")
print("=" * 82)

all_ids = [by_sku[s]["id"] for s in set(targets + sources)]
cur.execute("""
    SELECT product_id, COUNT(*) AS n FROM product_images
    WHERE product_id = ANY(%s) GROUP BY product_id
""", (all_ids,))
img_count = {r["product_id"]: r["n"] for r in cur.fetchall()}

bad = False

busy = [t for t in targets if img_count.get(by_sku[t]["id"], 0) > 0]
if busy:
    print(f"  !! target already has image(s), will not overwrite: {busy}")
    bad = True
else:
    print(f"  all {len(targets)} targets have 0 images. Good.")

empty = [s for s in sources if img_count.get(by_sku[s]["id"], 0) == 0]
if empty:
    print(f"  !! source has NO image to copy: {empty}")
    bad = True
else:
    print(f"  all {len(sources)} sources have at least 1 image. Good.")

src_ids = [by_sku[s]["id"] for s in sources]
cur.execute("""
    SELECT p.sku, COUNT(*) AS n
    FROM product_images i JOIN products p ON p.id = i.product_id
    WHERE i.product_id = ANY(%s) AND i.variant_id IS NOT NULL
    GROUP BY p.sku
""", (src_ids,))
vrows = cur.fetchall()
if vrows:
    print("  !! source images carry a variant_id, which cannot be copied to another product:")
    for r in vrows:
        print(f"       {r['sku']}: {r['n']} image(s)")
    bad = True
else:
    print("  no source image carries a variant_id. Good.")

if bad:
    print("\nABORT: image state check failed. Nothing written.")
    conn.rollback()
    sys.exit(1)

# ---------------------------------------------------------------- the plan
print("\n" + "=" * 82)
print("STEP 3 -- what will be copied")
print("=" * 82)

cur.execute("""
    SELECT id, product_id, url, alt_text, is_primary, display_order, image_kind, finish_id
    FROM product_images WHERE product_id = ANY(%s)
    ORDER BY product_id, display_order, id
""", (src_ids,))
src_images = {}
for r in cur.fetchall():
    src_images.setdefault(r["product_id"], []).append(r)

to_insert = []
print(f"\n  {'TARGET':<8} {'SOURCE':<8} {'COLLECTION':<14} {'#IMG':>4}  TARGET NAME")
for tgt, src in PAIRS:
    t = by_sku[tgt]
    s = by_sku[src]
    imgs = src_images[s["id"]]
    flag = "" if s["collection"] == t["collection"] else "   <-- CROSS-COLLECTION"
    print(f"  {tgt:<8} {src:<8} {str(t['collection']):<14} {len(imgs):>4}  {t['name']}{flag}")
    for im in imgs:
        to_insert.append((
            t["id"], im["url"], im["alt_text"], im["is_primary"],
            im["display_order"], im["image_kind"], im["finish_id"],
        ))

print(f"\n  product_images rows to insert: {len(to_insert)}")

print("\n" + "-" * 82)
print("  ALT TEXT that will land on each Padded Sling product (copied verbatim from the")
print("  Sling source). Read this. If the wording is wrong, say so and it gets rewritten.")
print("-" * 82)
for tgt, src in PAIRS:
    s = by_sku[src]
    for im in src_images[s["id"]]:
        print(f"  {tgt:<8} alt = {im['alt_text']}")

# ------------------------------------------------------------------- write
print("\n" + "=" * 82)
if COMMIT:
    psycopg2.extras.execute_values(
        cur,
        "INSERT INTO product_images "
        "(product_id, url, alt_text, is_primary, display_order, image_kind, finish_id) "
        "VALUES %s",
        to_insert,
    )
    conn.commit()
    print("COMMITTED.\n")

    fail = 0
    tgt_ids = [by_sku[t]["id"] for t in targets]
    cur.execute("""
        SELECT p.sku, COUNT(i.id) AS n
        FROM products p LEFT JOIN product_images i ON i.product_id = p.id
        WHERE p.id = ANY(%s) GROUP BY p.sku
    """, (tgt_ids,))
    got = {r["sku"]: r["n"] for r in cur.fetchall()}

    print("  Per-target image counts:")
    for tgt, src in PAIRS:
        want = len(src_images[by_sku[src]["id"]])
        have = got.get(tgt, 0)
        ok = have == want
        if not ok:
            fail += 1
        print(f"    {tgt:<8} {have:>3} images (expected {want}) {'' if ok else '  <-- MISMATCH'}")

    cur.execute("""
        SELECT COUNT(*) AS n FROM product_images
        WHERE product_id = ANY(%s) AND variant_id IS NOT NULL
    """, (tgt_ids,))
    n_var = cur.fetchone()["n"]
    print(f"\n  target images carrying a variant_id: {n_var} (expected 0)")
    if n_var:
        fail += 1

    cur.execute("""
        SELECT COUNT(*) AS n FROM products p
        WHERE p.manufacturer_id = %s
          AND NOT EXISTS (SELECT 1 FROM product_images i WHERE i.product_id = p.id)
    """, (MANUFACTURER_ID,))
    print(f"  Homecrest products still with NO image: {cur.fetchone()['n']} (was 70, expected 30)")

    print(f"\n  failures: {fail}")
    if fail == 0:
        print("\n  Padded sling image copy complete and verified.")
    else:
        print("\n  !! VERIFICATION FAILED. Review the mismatches above.")
else:
    conn.rollback()
    print("DRY RUN COMPLETE -- nothing written.")
    print()
    print("To commit:")
    print('  python3 -c "exec(open(\'homecrest_sling_images.py\').read().replace(\'COMMIT = False\', \'COMMIT = True\'))"')

cur.close()
conn.close()
