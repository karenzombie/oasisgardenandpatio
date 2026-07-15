#!/usr/bin/env python3
"""
Read-only check of the generated ./dev-data-for-prod.sql BEFORE applying to prod.

Confirms the six newly-added tables are handled as wipe-and-reinsert
(a TRUNCATE ... RESTART IDENTITY line is present) and that their row counts
match what the drift check found in dev. Also confirms the three original
full-replace tables still have their TRUNCATE, and that the file is wrapped in
one BEGIN/COMMIT transaction.

Reads a local file only. Touches NO database. Writes nothing.

RUN:
    python3 check_generated_sql.py
"""

import os
import re
import sys

SQL_FILE = "./dev-data-for-prod.sql"

# Expected dev row counts (from the dev-vs-prod drift check).
EXPECTED = {
    "variant_grade_prices": 1330,
    "finish_collections": 29,
    "product_cover_options": 7,
    "product_cover_finish_prices": 42,
    "product_stem_options": 16,
    "product_addon_grade_prices": 21,
}

# The three tables that were already full-replace before this change.
ORIGINAL_FULL_REPLACE = [
    "product_images",
    "product_fabric_pools",
    "product_finish_pools",
]


def main():
    if not os.path.exists(SQL_FILE):
        sys.exit(f"{SQL_FILE} not found. Generate it first with the dump script.")

    with open(SQL_FILE, "r", encoding="utf-8") as fh:
        text = fh.read()

    # Row counts come from the per-table comment lines: "-- table: N rows".
    counts = {}
    for m in re.finditer(r'^-- (\S+): (\d+) rows$', text, re.MULTILINE):
        counts[m.group(1)] = int(m.group(2))

    def has_truncate(tbl):
        return f'TRUNCATE TABLE "{tbl}" RESTART IDENTITY;' in text

    print("=" * 72)
    print("READ-ONLY check of dev-data-for-prod.sql (no database touched)")
    print("=" * 72)

    ok = True

    def check(label, cond, detail=""):
        nonlocal ok
        print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f"  {detail}" if detail else ""))
        ok = ok and cond

    print("\n1. Transaction wrapper")
    print("-" * 72)
    check("file begins a transaction (BEGIN;)", "BEGIN;" in text)
    check("file ends the transaction (COMMIT;)", "COMMIT;" in text)

    print("\n2. Six newly-added tables: wipe-and-reinsert + expected row count")
    print("-" * 72)
    for tbl, expected in EXPECTED.items():
        present = tbl in counts
        trunc = has_truncate(tbl)
        got = counts.get(tbl)
        row_ok = present and got == expected
        check(f'{tbl}: TRUNCATE present', trunc)
        check(f'{tbl}: {expected} rows', row_ok, "" if row_ok else f"(got {got})")

    print("\n3. Original full-replace tables still wiped (no regression)")
    print("-" * 72)
    for tbl in ORIGINAL_FULL_REPLACE:
        check(f'{tbl}: TRUNCATE present', has_truncate(tbl),
              f'({counts.get(tbl, "?")} rows)')

    print("\n4. Sanity: these six must NOT be truncated (they'd cascade or lose data)")
    print("-" * 72)
    # Parent / transactional-adjacent tables that must never be full-replaced.
    for tbl in ["products", "product_variants", "fabrics", "finishes"]:
        no_trunc = not has_truncate(tbl)
        check(f'{tbl}: NOT truncated', no_trunc)

    print("\n" + "=" * 72)
    if ok:
        print("All checks passed. The SQL is ready to review/apply to prod.")
    else:
        print("One or more checks FAILED. Do not apply. Re-generate or review.")
    print("=" * 72)


if __name__ == "__main__":
    main()
