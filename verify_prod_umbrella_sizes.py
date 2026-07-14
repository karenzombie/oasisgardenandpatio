#!/usr/bin/env python3
"""
verify_prod_umbrella_sizes.py

READ-ONLY. Makes no changes to anything.
Reads BOTH prod (PROD_DATABASE_URL) and dev (DATABASE_URL).

Last gate before deploy. The agent reported all of this with check marks and no
output. This checks it independently.

What must be true before deploying:
  - prod HAS product_umbrella_sizes, correctly shaped
  - prod has ZERO rows in it (the deploy sync brings the data)
  - dev still has 114 rows
  - nothing else in prod moved
"""

import os
import sys
import psycopg2
import psycopg2.extras

prod_url = os.environ.get("PROD_DATABASE_URL")
dev_url = os.environ.get("DATABASE_URL")
if not prod_url:
    print("PROD_DATABASE_URL is not set. Aborting.")
    sys.exit(1)

failures = []


def check(label, passed, detail=""):
    if not passed:
        failures.append(label)
    print("  [%s] %s%s" % ("PASS" if passed else "FAIL", label,
                           ("   " + detail) if detail else ""))


print()
print("*** MODE: READ-ONLY. NOTHING WILL BE WRITTEN TO PROD OR DEV. ***")
print()

# ===========================================================================
prod = psycopg2.connect(prod_url)
prod.set_session(readonly=True)
p = prod.cursor(cursor_factory=psycopg2.extras.DictCursor)

print("=" * 78)
print("1. CONFIRM WE ARE LOOKING AT PROD")
print("=" * 78)
p.execute("SELECT current_database()")
pdb = p.fetchone()[0]
print("  database      :", pdb)
p.execute("SELECT count(*) FROM products")
pcount = p.fetchone()[0]
print("  products rows :", pcount)
print()
check("this is neondb (prod)", pdb == "neondb", "got: %s" % pdb)
check("products still 3612", pcount == 3612, "got: %s" % pcount)
print()
if pdb != "neondb":
    print("  Not prod. Aborting.")
    sys.exit(1)

# ---------------------------------------------------------------------------
print("=" * 78)
print("2. PROD TABLE SHAPE")
print("=" * 78)
p.execute("""
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_name = 'product_umbrella_sizes'
    ORDER BY ordinal_position
""")
cols = p.fetchall()
for c in cols:
    print("      %-12s %-10s nullable=%s" % (c["column_name"], c["data_type"], c["is_nullable"]))
names = [c["column_name"] for c in cols]
check("table exists in prod", len(cols) > 0)
check("columns are exactly (product_id, size_label)",
      sorted(names) == ["product_id", "size_label"], "got: %s" % names)
check("no surrogate id column (cleanupProdOnlyRows would throw on one)",
      "id" not in names)
print()

p.execute("""
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON kcu.constraint_name = tc.constraint_name
    WHERE tc.table_name = 'product_umbrella_sizes'
      AND tc.constraint_type = 'PRIMARY KEY'
    ORDER BY kcu.ordinal_position
""")
pk = [r["column_name"] for r in p.fetchall()]
print("      PK: %s" % pk)
check("composite PK (product_id, size_label)", pk == ["product_id", "size_label"])

p.execute("""
    SELECT pg_get_constraintdef(con.oid) AS def
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    WHERE rel.relname = 'product_umbrella_sizes' AND con.contype = 'f'
""")
fks = [r["def"] for r in p.fetchall()]
for f in fks:
    print("      %s" % f)
check("FK to products with ON DELETE CASCADE",
      any("ON DELETE CASCADE" in f.upper() for f in fks))

p.execute("""
    SELECT indexdef FROM pg_indexes
    WHERE tablename = 'product_umbrella_sizes' ORDER BY indexname
""")
idxs = [r["indexdef"] for r in p.fetchall()]
for i in idxs:
    print("      %s" % i)
check("index on size_label exists",
      any("size_label" in i and "product_id" not in i.split("(")[-1] for i in idxs))
print()

# ---------------------------------------------------------------------------
print("=" * 78)
print("3. PROD TABLE IS EMPTY (the deploy sync fills it)")
print("=" * 78)
p.execute("SELECT count(*) FROM product_umbrella_sizes")
n_prod = p.fetchone()[0]
print("      row count: %d" % n_prod)
check("prod count = 0", n_prod == 0,
      "" if n_prod == 0 else "Agent populated it. Not what was asked, but not fatal.")
print()

# ---------------------------------------------------------------------------
print("=" * 78)
print("4. PROD BACKUP TABLES SURVIVED")
print("=" * 78)
p.execute("""
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name ILIKE '%backup%'
    ORDER BY table_name
""")
b = [r["table_name"] for r in p.fetchall()]
for t in b:
    print("      %s" % t)
check("at least one prod backup table survives", len(b) > 0)
print()

p.close()
prod.close()

# ===========================================================================
print("=" * 78)
print("5. DEV IS UNTOUCHED AND STILL HOLDS THE DATA")
print("=" * 78)
dev = psycopg2.connect(dev_url)
dev.set_session(readonly=True)
d = dev.cursor(cursor_factory=psycopg2.extras.DictCursor)
d.execute("SELECT current_database()")
ddb = d.fetchone()[0]
print("      database   :", ddb)
d.execute("SELECT count(*) FROM product_umbrella_sizes")
n_dev = d.fetchone()[0]
print("      dev rows   : %d" % n_dev)
d.execute("SELECT count(DISTINCT product_id) FROM product_umbrella_sizes")
print("      dev products: %d" % d.fetchone()[0])
d.execute("""
    SELECT count(*) FROM product_umbrella_sizes
    WHERE size_label LIKE '%%' || chr(8217) || '%%'
""")
curly = d.fetchone()[0]
print("      curly apostrophes: %d" % curly)
check("dev is heliumdb", ddb == "heliumdb")
check("dev still has 114 rows", n_dev == 114, "got: %s" % n_dev)
check("no curly apostrophes in dev labels", curly == 0)
d.close()
dev.close()
print()

# ===========================================================================
print("=" * 78)
print("RESULT")
print("=" * 78)
if failures:
    print("  FAILED: %d" % len(failures))
    for f in failures:
        print("     -> %s" % f)
    print()
    print("  DO NOT DEPLOY. Send me this output.")
    sys.exit(1)

print("  All checks passed.")
print()
print("  Prod has the table, empty. Dev has the 114 rows. The deploy sync is")
print("  what moves them across.")
print()
print("  SAFE TO DEPLOY.")
print()
print("  After deploying, look in the deploy logs for this exact line:")
print()
print("      Prod catalog sync complete.")
print()
print("  Because of the '|| true' in postbuild, a GREEN DEPLOY DOES NOT PROVE")
print("  THE SYNC RAN. That line is the only thing that does.")
print()
