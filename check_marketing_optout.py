#!/usr/bin/env python3
"""
Read-only PROD snapshot of a customer's marketing opt-out preference.

Run it BEFORE the opt-out link test and AGAIN after, then compare. The whole
point of the Gate 2 fix is that clicking the email link changes NOTHING, so
marketing_opt_out and marketing_opt_out_at must be identical across both runs.
Only a manual toggle on the account page should ever move them.

Usage:
    ALLOW_PROD=1 python3 check_marketing_optout.py            # defaults to customer 21
    ALLOW_PROD=1 python3 check_marketing_optout.py 21
    ALLOW_PROD=1 python3 check_marketing_optout.py someone@example.com

Safety:
    - Requires ALLOW_PROD=1
    - READ ONLY session. No writes possible. No commit.
"""

import os
import re
import sys

import psycopg2

# ---------------------------------------------------------------- guard
if os.environ.get("ALLOW_PROD") != "1":
    print("ALLOW_PROD is not set to 1. This script reads prod. Aborting.")
    sys.exit(1)

PROD_URL = os.environ.get("PROD_DATABASE_URL")
if not PROD_URL:
    print("PROD_DATABASE_URL is not set. Aborting.")
    sys.exit(1)

# optional target: id (int) or email (contains @). default customer 21.
target = sys.argv[1] if len(sys.argv) > 1 else "21"
by_email = "@" in target

host_match = re.search(r"@([^/:?]+)", PROD_URL)
host = host_match.group(1) if host_match else "unknown"
print("=" * 68)
print(f"TARGET: PROD  ({host})")
print("SESSION: READ ONLY  (no writes possible, no commit)")
print(f"LOOKING UP: {'email ' if by_email else 'customer id '}{target}")
print("=" * 68)

conn = psycopg2.connect(PROD_URL)
conn.set_session(readonly=True, autocommit=True)
cur = conn.cursor()

# confirm the columns actually exist before selecting them
cur.execute(
    """
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'customers'
    """
)
cols = {r[0] for r in cur.fetchall()}

required = {"id", "marketing_opt_out", "marketing_opt_out_at"}
missing = required - cols
if missing:
    print(f"  Expected column(s) not found on customers: {sorted(missing)}")
    print("  Aborting so nothing is misread.")
    sys.exit(1)

wanted = ["id", "email", "first_name", "marketing_opt_out", "marketing_opt_out_at"]
select_cols = [c for c in wanted if c in cols]
col_sql = ", ".join(select_cols)

if by_email:
    cur.execute(f"SELECT {col_sql} FROM customers WHERE email = %s", (target,))
else:
    cur.execute(f"SELECT {col_sql} FROM customers WHERE id = %s", (int(target),))

row = cur.fetchone()

# DB wall-clock, so two runs are easy to tell apart
cur.execute("SELECT now()")
db_now = cur.fetchone()[0]

print(f"\n  read at (db time): {db_now}")
print("-" * 68)
if not row:
    print("  No matching customer found.")
else:
    d = dict(zip(select_cols, row))
    for c in select_cols:
        print(f"  {c:22}: {d.get(c)}")
    print("-" * 68)
    print(f"  >>> marketing_opt_out    = {d.get('marketing_opt_out')}")
    print(f"  >>> marketing_opt_out_at = {d.get('marketing_opt_out_at')}")
    print("  Compare these two lines before vs after the link test. They must match.")

print("\n" + "=" * 68)
print("Read-only snapshot complete. No changes were made.")
print("=" * 68)

cur.close()
conn.close()
