"""
READ-ONLY. Verifies the finishing work on product 6334 against real DB state,
and checks the one thing that could silently break a PO: that EVERY umbrella
model code appearing on a pole variant has a resolvable name.

The agent's [MODEL] substitution maps a model CODE (e.g. UM810) to a NAME
(e.g. AUTO TILT 9'). If any code that can appear at checkout is missing from
that map, a real order/PO would print an unresolved value. We can't read the
TS map from here, but we CAN enumerate every model code the picker can pass
(from the master CSV fits lists) and confirm each one has a known name in our
own source data. Any gap is worth flagging to the agent.

No writes.
"""
import os, csv, psycopg2

conn = psycopg2.connect(os.environ["DATABASE_URL"])
conn.set_session(readonly=True)
cur = conn.cursor()

print("=== 1. Rename ===")
cur.execute("SELECT id, name, slug, sku FROM products WHERE id = 6334")
print("  ", cur.fetchone())

print("\n=== 2. Image ===")
cur.execute("""SELECT id, url, alt_text, is_primary, image_kind
               FROM product_images WHERE product_id = 6334""")
imgs = cur.fetchall()
print("  ", imgs if imgs else "NONE (problem)")

print("\n=== 3. Pole model-code coverage ===")
rows = list(csv.DictReader(open("tg_replacement_parts_master.csv")))
poles = [r for r in rows if r["Part Type"] == "Bottom Pole"]

# Build code -> set(names) from the fits lists (code list and name list are
# positional per row).
code_names = {}
issues = []
for r in poles:
    codes = [c.strip() for c in r["Fits Model (Code)"].split(",")]
    names = [n.strip() for n in r["Fits Model (Name)"].split(",")]
    if len(codes) != len(names):
        issues.append(("count mismatch", r["Composed SKU"], r["Fits Model (Code)"],
                        r["Fits Model (Name)"]))
        continue
    for c, n in zip(codes, names):
        code_names.setdefault(c, set()).add(n)

print(f"  distinct pole model codes the picker can pass: {len(code_names)}")
for c in sorted(code_names):
    names = code_names[c]
    flag = "  <-- AMBIGUOUS (>1 name)" if len(names) > 1 else ""
    missing = "  <-- NO NAME" if not names or "" in names else ""
    print(f"    {c:<10} -> {sorted(names)}{flag}{missing}")

if issues:
    print("\n  ROW ISSUES (code/name count mismatch):")
    for i in issues:
        print("   ", i)
else:
    print("\n  No code/name count mismatches. Every pole code has exactly one name" 
          if all(len(v) == 1 for v in code_names.values())
          else "\n  Some codes map to more than one name (see AMBIGUOUS above).")

print("\n  NOTE: agent reported 19 map entries; distinct pole codes above is the"
      f" number that MUST be covered ({len(code_names)}). If they differ, ask the"
      " agent which codes are in the map.")

cur.close(); conn.close()
