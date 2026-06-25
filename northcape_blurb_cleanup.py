#!/usr/bin/env python3
"""
NorthCape blurb-redundancy cleanup.

For every NorthCape product (manufacturer_id = 17) whose `description` opens by
repeating the `short_description` blurb, this script:

  1. Removes the duplicated blurb from `description` (both the plain-text copy
     at the top and the <p>...</p> paragraph that restates it), keeping the
     feature-bullet <ul> list. If nothing but the blurb was in `description`,
     `description` is cleared (set to NULL).

  2. If `short_description` was truncated mid-sentence, repairs it to the
     complete sentence taken from the <p> block in that same record (existing
     data, nothing invented), before that block is removed.

Match key: products.id, additionally guarded by manufacturer_id = 17.

DRY_RUN = True  -> writes a before/after CSV, makes NO database changes.
To commit, run from the Replit shell:
    exec(open('northcape_blurb_cleanup.py').read().replace('DRY_RUN = True', 'DRY_RUN = False'))
"""

import os, re, csv, html
import psycopg2

DRY_RUN = True

MANUFACTURER_ID = 17
DRYRUN_CSV = "northcape_blurb_cleanup_dryrun.csv"

# ---------------------------------------------------------------- helpers
def _norm(t):
    """Normalize for comparison only: strip tags, unescape, unify quotes, collapse ws."""
    if not t:
        return ""
    t = t.replace("\\n", " ").replace("\n", " ")
    t = re.sub(r"<[^>]+>", " ", t)
    t = html.unescape(t)
    t = t.replace("\u201c", '"').replace("\u201d", '"').replace("\u2019", "'").replace("\u2018", "'")
    return re.sub(r"\s+", " ", t).strip().lower()

def _wordset(t):
    return set(re.findall(r"[a-z0-9]+", _norm(t)))

def _p_text(desc):
    """Complete blurb text from the first <p>...</p> block (verbatim, entities decoded)."""
    m = re.search(r"<p>(.*?)</p>", desc, flags=re.S)
    if not m:
        return ""
    inner = m.group(1).replace("\\n", " ").replace("\n", " ")
    inner = re.sub(r"\s+", " ", inner)
    return html.unescape(inner).strip()

def plan_change(short, desc):
    """
    Return (new_short, new_desc, action) for a product, or None if it is not
    part of this cleanup (left untouched). new_desc of None means clear the field.
    """
    if not desc or not desc.strip():
        return None                      # nothing in description
    if not short or not short.strip():
        return None                      # description-only product, leave alone

    # confirm the redundancy pattern: the text before the first HTML tag
    # must be a (possibly truncated) copy of short_description
    lead_m = re.match(r"^(.*?)(?=<)", desc, flags=re.S)
    lead = _norm(lead_m.group(1)) if lead_m else _norm(desc)
    short_n = _norm(short)
    is_dup_lead = bool(lead) and (lead in short_n or short_n.startswith(lead) or short_n in lead)
    if not is_dup_lead:
        return ("__SKIP_NO_REDUNDANCY__", None, "skipped (no leading blurb duplication)")

    # new description = the <ul> bullet block, or cleared if there is none
    ul_m = re.search(r"<ul>.*</ul>", desc, flags=re.S)
    new_desc = ul_m.group(0).strip() if ul_m else None

    # repair short_description only if it is a truncated prefix of the <p> copy
    new_short = short
    p = _p_text(desc)
    if p:
        sw, pw = _wordset(short), _wordset(p)
        if (pw - sw) and sw <= pw:        # p contains every short word, plus more
            new_short = p

    short_changed = (new_short != short)
    if not ul_m and short_changed:
        action = "oceanview: short-repaired + description cleared"
    elif not ul_m:
        action = "description cleared"
    elif short_changed:
        action = "description cleaned + short_description repaired"
    else:
        action = "description cleaned"
    return (new_short, new_desc, action)

# ---------------------------------------------------------------- run
def main():
    conn = psycopg2.connect(os.environ["DATABASE_URL"])
    cur = conn.cursor()
    cur.execute(
        "SELECT id, sku, name, short_description, description "
        "FROM products WHERE manufacturer_id = %s ORDER BY id",
        (MANUFACTURER_ID,),
    )
    rows = cur.fetchall()

    changes = []
    skipped_unexpected = []
    for pid, sku, name, short, desc in rows:
        res = plan_change(short, desc)
        if res is None:
            continue
        new_short, new_desc, action = res
        if new_short == "__SKIP_NO_REDUNDANCY__":
            skipped_unexpected.append((pid, sku, name))
            continue
        changes.append({
            "id": pid, "sku": sku, "name": name, "action": action,
            "short_changed": "YES" if new_short != short else "no",
            "short_before": short or "", "short_after": new_short or "",
            "desc_before": desc or "", "desc_after": "" if new_desc is None else new_desc,
        })

    # counts
    n_desc_only        = sum(1 for c in changes if c["action"] == "description cleaned")
    n_desc_plus_short  = sum(1 for c in changes if c["action"] == "description cleaned + short_description repaired")
    n_oceanview        = sum(1 for c in changes if c["action"].startswith("oceanview"))
    n_desc_cleared     = sum(1 for c in changes if c["action"] == "description cleared")

    print(f"NorthCape (manufacturer_id={MANUFACTURER_ID}) blurb-redundancy cleanup")
    print(f"  description cleaned (short kept)            : {n_desc_only}")
    print(f"  description cleaned + short repaired        : {n_desc_plus_short}")
    print(f"  oceanview (short repaired + desc cleared)   : {n_oceanview}")
    print(f"  description cleared only                    : {n_desc_cleared}")
    print(f"  TOTAL products changed                      : {len(changes)}")
    if skipped_unexpected:
        print(f"  !! UNEXPECTED rows with no leading duplication (left untouched): {len(skipped_unexpected)}")
        for pid, sku, name in skipped_unexpected:
            print(f"       id={pid} {sku} {name}")

    if DRY_RUN:
        with open(DRYRUN_CSV, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=[
                "id", "sku", "name", "action", "short_changed",
                "short_before", "short_after", "desc_before", "desc_after"])
            w.writeheader()
            for c in changes:
                w.writerow(c)
        print(f"\nDRY RUN — no changes written. Review file: {DRYRUN_CSV}")
    else:
        for c in changes:
            cur.execute(
                "UPDATE products SET short_description = %s, description = %s "
                "WHERE id = %s AND manufacturer_id = %s",
                (c["short_after"], (c["desc_after"] or None), c["id"], MANUFACTURER_ID),
            )
        conn.commit()
        print(f"\nCOMMITTED — {len(changes)} products updated.")

    cur.close()
    conn.close()

if __name__ == "__main__":
    main()
