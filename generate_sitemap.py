#!/usr/bin/env python3
"""
Generate sitemap.xml and robots.txt for the Oasis storefront.

No application code is touched. This script only WRITES TWO STATIC FILES into
the storefront's public dir. No routes, no serving config, no API changes, no
database writes. The database connection is opened READ ONLY.

REVISION (July 24, third pass): CATEGORY EXCLUSION
  Replacement parts are omitted. Their images are placeholders and they are not
  pages we want customers landing on from search. Controlled by
  EXCLUDE_CATEGORY_SLUGS below; add a slug to that list to omit that category.

  Knock-on effect is automatic: with every replacement part excluded, the
  /shop/category/cat-replacement-parts page has zero eligible products and the
  existing empty-page rule drops it too. Same for any manufacturer that ends up
  with nothing left.

  NOTE: omitting a URL from the sitemap stops us submitting it. It does not
  remove it from Google. If the pages are linked anywhere on the site, they can
  still be crawled and indexed. Keeping them out of results entirely needs a
  noindex tag on the page, which is application code, not this script.

EARLIER REVISIONS:
  - EMPTY-PAGE RULE: a manufacturer or category page is included only if it has
    at least one product that is itself in the sitemap.
  - ROUTE PROBE REMOVED: the SPA catch-all returns 200 for every path, so the
    old probe could never see a 404 and always reported success.

WHAT GOES IN:
  - Static public pages, canonical form:
        /   /shop   /manufacturers/   /materials/   /commercial   /contact
  - Product pages   /shop/{slug}
        catalog_visible AND is_active AND has >= 1 image
        AND not in an excluded category
  - Category pages  /shop/category/{slug}   >= 1 eligible product
  - Manufacturer    /manufacturers/{slug}   is_active AND >= 1 eligible product

Quote-only (inquiry) products are live pages and STAY IN.

lastmod is real, never fabricated:
  - product: its own updated_at
  - category / manufacturer: newest updated_at among its included products
  - /shop: newest updated_at in the included catalog
  - marketing pages: no lastmod

Dry run (default): prints the full breakdown, writes a review CSV, and does NOT
write sitemap.xml or robots.txt.

  python3 generate_sitemap.py
"""

import os
import sys
import csv
from xml.sax.saxutils import escape
import urllib.request
import urllib.error

try:
    import psycopg2
    import psycopg2.extras
except ImportError:
    print("psycopg2 not available."); sys.exit(1)

COMMIT = False            # controls sitemap.xml + robots.txt ONLY. Dry run by default.
WRITE_REVIEW_CSV = True   # writes sitemap_preview.csv to the WORKSPACE ROOT for eyeballing.
                          # Never written into public/. Not part of the site.

# Category slugs whose products are kept OUT of the sitemap.
# Add a slug here to omit that whole category. Remove one to put it back.
EXCLUDE_CATEGORY_SLUGS = [
    "cat-replacement-parts",
]

SITE = "https://oasisgardenandpatio.com"      # production domain, no trailing slash
PUBLIC_DIR = "artifacts/web/public"           # existing static dir; verified before any write
SITEMAP_PATH = os.path.join(PUBLIC_DIR, "sitemap.xml")
ROBOTS_PATH = os.path.join(PUBLIC_DIR, "robots.txt")
REVIEW_CSV = "sitemap_preview.csv"

# (path, priority, changefreq, lastmod_kind)   lastmod_kind: None | "shop"
STATIC_PAGES = [
    ("/",               "1.0", "daily",   None),
    ("/shop",           "0.9", "daily",   "shop"),
    ("/manufacturers/", "0.7", "weekly",  "shop"),
    ("/materials/",     "0.6", "monthly", None),
    ("/commercial",     "0.5", "monthly", None),
    ("/contact",        "0.5", "monthly", None),
]

# Base rule: visible, active, slugged, has an image.
BASE_INCLUDED = (
    "p.catalog_visible = true AND p.is_active = true "
    "AND p.slug IS NOT NULL AND length(trim(p.slug)) > 0 "
    "AND EXISTS (SELECT 1 FROM product_images pi WHERE pi.product_id = p.id)"
)

# Category exclusion. Alias xc is deliberately distinct so it cannot shadow a
# `c` alias in the outer categories query.
if EXCLUDE_CATEGORY_SLUGS:
    _slug_list = ", ".join("'" + s.replace("'", "''") + "'" for s in EXCLUDE_CATEGORY_SLUGS)
    IN_EXCLUDED_CATEGORY = (
        f"EXISTS (SELECT 1 FROM categories xc "
        f"WHERE xc.id = p.category_id AND xc.slug IN ({_slug_list}))"
    )
    CATEGORY_FILTER = f" AND NOT {IN_EXCLUDED_CATEGORY}"
else:
    IN_EXCLUDED_CATEGORY = "false"
    CATEGORY_FILTER = ""

INCLUDED = BASE_INCLUDED + CATEGORY_FILTER

DB_URL = os.environ.get("DATABASE_URL")
if not DB_URL:
    print("DATABASE_URL not set."); sys.exit(1)


def isodate(dt):
    if not dt:
        return None
    if isinstance(dt, str):
        return dt[:10]
    return dt.strftime("%Y-%m-%d")


def url_block(loc, lastmod=None, changefreq=None, priority=None):
    out = ["  <url>", f"    <loc>{escape(loc)}</loc>"]
    if lastmod:
        out.append(f"    <lastmod>{lastmod}</lastmod>")
    if changefreq:
        out.append(f"    <changefreq>{changefreq}</changefreq>")
    if priority:
        out.append(f"    <priority>{priority}</priority>")
    out.append("  </url>")
    return "\n".join(out)


def serving_check(path):
    """Classify what the live site currently returns at a root path."""
    url = f"{SITE}{path}"
    req = urllib.request.Request(url, method="GET",
                                 headers={"User-Agent": "oasis-sitemap-gen/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=12) as resp:
            head = resp.read(400).decode("utf-8", "replace").lstrip().lower()
            status = resp.status
    except urllib.error.HTTPError as e:
        return f"{e.code} (not present)"
    except Exception as e:
        return f"ERR {type(e).__name__}"
    if head.startswith("<?xml"):
        return f"{status} real XML file"
    if head.startswith("user-agent") or head.startswith("#"):
        return f"{status} real text file"
    if "<html" in head or "<!doctype html" in head:
        return f"{status} SPA HTML (file NOT surfacing at root)"
    return f"{status} (unrecognized: {head[:40]!r})"


def main():
    conn = psycopg2.connect(DB_URL)
    conn.set_session(readonly=True, autocommit=True)
    cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    entries = []          # (kind, url, lastmod, xml_block)
    excluded_pages = []   # (kind, slug, reason)

    # ---------- product accounting (buckets must sum to total) --------------
    cur.execute(f"""
        SELECT
          count(*) AS total,
          count(*) FILTER (WHERE p.is_active = false) AS inactive,
          count(*) FILTER (WHERE p.is_active = true AND p.catalog_visible = false) AS hidden,
          count(*) FILTER (WHERE p.is_active = true AND p.catalog_visible = true
                             AND (p.slug IS NULL OR length(trim(p.slug)) = 0)) AS noslug,
          count(*) FILTER (WHERE p.is_active = true AND p.catalog_visible = true
                             AND p.slug IS NOT NULL AND length(trim(p.slug)) > 0
                             AND NOT EXISTS (SELECT 1 FROM product_images pi
                                             WHERE pi.product_id = p.id)) AS noimage,
          count(*) FILTER (WHERE {BASE_INCLUDED} AND {IN_EXCLUDED_CATEGORY}) AS excl_cat,
          count(*) FILTER (WHERE {INCLUDED}) AS included
        FROM products p
    """)
    acct = cur.fetchone()

    # ---------- what the category exclusion actually caught ------------------
    excl_detail = []
    if EXCLUDE_CATEGORY_SLUGS:
        cur.execute(f"""
            SELECT xc.slug AS cat, coalesce(m.slug, '(none)') AS mfr,
                   count(*) AS n, min(p.slug) AS sample
            FROM products p
            JOIN categories xc ON xc.id = p.category_id
            LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
            WHERE {BASE_INCLUDED} AND {IN_EXCLUDED_CATEGORY}
            GROUP BY xc.slug, m.slug
            ORDER BY xc.slug, count(*) DESC
        """)
        excl_detail = cur.fetchall()

    # ---------- lastmod anchor ----------------------------------------------
    cur.execute(f"SELECT max(p.updated_at) AS m FROM products p WHERE {INCLUDED}")
    shop_lastmod = isodate(cur.fetchone()["m"])

    # ---------- 1. static pages ---------------------------------------------
    for path, pri, freq, kind in STATIC_PAGES:
        lm = shop_lastmod if kind == "shop" else None
        loc = f"{SITE}{path}"
        entries.append(("static", loc, lm, url_block(loc, lm, freq, pri)))

    # ---------- 2. products --------------------------------------------------
    cur.execute(f"""
        SELECT p.slug, p.updated_at, m.slug AS mfr
        FROM products p
        LEFT JOIN manufacturers m ON m.id = p.manufacturer_id
        WHERE {INCLUDED}
        ORDER BY m.slug NULLS LAST, p.slug
    """)
    products = cur.fetchall()
    product_rows = []
    for r in products:
        loc = f"{SITE}/shop/{r['slug']}"
        lm = isodate(r["updated_at"])
        entries.append(("product", loc, lm, url_block(loc, lm, "weekly", "0.8")))
        product_rows.append({"manufacturer": r["mfr"] or "(none)",
                             "slug": r["slug"], "url": loc, "lastmod": lm or ""})

    # ---------- 3. categories: require >= 1 eligible product -----------------
    cur.execute(f"""
        SELECT c.slug, c.name,
               count(p.id) FILTER (WHERE {INCLUDED}) AS eligible,
               max(p.updated_at) FILTER (WHERE {INCLUDED}) AS prod_max
        FROM categories c
        LEFT JOIN products p ON p.category_id = c.id
        WHERE c.slug IS NOT NULL AND length(trim(c.slug)) > 0
        GROUP BY c.slug, c.name
        ORDER BY c.slug
    """)
    cats = cur.fetchall()
    for r in cats:
        if r["eligible"] == 0:
            why = ("excluded category" if r["slug"] in EXCLUDE_CATEGORY_SLUGS
                   else "no eligible products")
            excluded_pages.append(("category", r["slug"], why))
            continue
        loc = f"{SITE}/shop/category/{r['slug']}"
        lm = isodate(r["prod_max"])
        entries.append(("category", loc, lm, url_block(loc, lm, "weekly", "0.7")))

    # ---------- 4. manufacturers: active AND >= 1 eligible product -----------
    cur.execute(f"""
        SELECT m.slug, m.name, m.is_active,
               count(p.id) FILTER (WHERE {INCLUDED}) AS eligible,
               max(p.updated_at) FILTER (WHERE {INCLUDED}) AS prod_max
        FROM manufacturers m
        LEFT JOIN products p ON p.manufacturer_id = m.id
        WHERE m.slug IS NOT NULL AND length(trim(m.slug)) > 0
        GROUP BY m.slug, m.name, m.is_active
        ORDER BY m.slug
    """)
    mfrs = cur.fetchall()
    for r in mfrs:
        if not r["is_active"]:
            excluded_pages.append(("manufacturer", r["slug"], "is_active = false"))
            continue
        if r["eligible"] == 0:
            excluded_pages.append(("manufacturer", r["slug"], "no eligible products"))
            continue
        loc = f"{SITE}/manufacturers/{r['slug']}"
        lm = isodate(r["prod_max"])
        entries.append(("manufacturer", loc, lm, url_block(loc, lm, "weekly", "0.7")))

    from collections import Counter
    counts = Counter(k for k, _, _, _ in entries)

    sitemap = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(b for _, _, _, b in entries)
        + "\n</urlset>\n"
    )

    robots = (
        "User-agent: *\n"
        "Disallow: /admin\n"
        "Disallow: /agent\n"
        "Disallow: /staff\n"
        "Disallow: /cart\n"
        "Disallow: /checkout\n"
        "Disallow: /sign-in\n"
        "Disallow: /wishlist\n"
        "\n"
        f"Sitemap: {SITE}/sitemap.xml\n"
    )

    # =================== REPORT ===========================================
    print("=" * 74)
    print("SITEMAP CONTENTS")
    print("=" * 74)
    print(f"  static pages       : {counts['static']}")
    print(f"  product pages      : {counts['product']}")
    print(f"  category pages     : {counts['category']}")
    print(f"  manufacturer pages : {counts['manufacturer']}")
    print(f"  TOTAL URLs         : {len(entries)}")

    print("\n" + "-" * 74)
    print("CATEGORY EXCLUSION (what this rule kept out)")
    print("-" * 74)
    if not EXCLUDE_CATEGORY_SLUGS:
        print("  no categories excluded")
    else:
        print(f"  excluding: {', '.join(EXCLUDE_CATEGORY_SLUGS)}")
        if excl_detail:
            for r in excl_detail:
                print(f"    {r['cat']:<24} {r['mfr']:<22} {r['n']:>4}   e.g. {r['sample']}")
            print(f"    {'TOTAL KEPT OUT':<47} {sum(r['n'] for r in excl_detail):>4}")
        else:
            print("    nothing matched (check the slug spelling against the category list)")

    print("\n" + "-" * 74)
    print("PRODUCT ACCOUNTING (these six must sum to the total)")
    print("-" * 74)
    print(f"  products in database        : {acct['total']}")
    print(f"    excluded, is_active=false : {acct['inactive']}")
    print(f"    excluded, hidden          : {acct['hidden']}")
    print(f"    excluded, blank slug      : {acct['noslug']}")
    print(f"    excluded, no image        : {acct['noimage']}")
    print(f"    excluded, category rule   : {acct['excl_cat']}")
    print(f"    INCLUDED                  : {acct['included']}")
    s = (acct['inactive'] + acct['hidden'] + acct['noslug']
         + acct['noimage'] + acct['excl_cat'] + acct['included'])
    print(f"  sum check                   : {s}  ({'OK' if s == acct['total'] else 'MISMATCH'})")

    print("\n" + "-" * 74)
    print("STATIC PAGES IN THE SITEMAP (all of them)")
    print("-" * 74)
    for k, loc, lm, _ in entries:
        if k == "static":
            print(f"  {loc:<52} {lm or '(no lastmod)'}")

    print("\n" + "-" * 74)
    print("MANUFACTURER PAGES IN THE SITEMAP (all of them)")
    print("-" * 74)
    inc_m = {loc.rstrip('/').rsplit('/', 1)[-1]: lm
             for k, loc, lm, _ in entries if k == "manufacturer"}
    for r in mfrs:
        if r["slug"] in inc_m:
            print(f"  {r['slug']:<26} {str(r['eligible']):>5} products   {inc_m[r['slug']]}")

    print("\n" + "-" * 74)
    print("CATEGORY PAGES IN THE SITEMAP (all of them)")
    print("-" * 74)
    inc_c = {loc.rstrip('/').rsplit('/', 1)[-1]: lm
             for k, loc, lm, _ in entries if k == "category"}
    for r in cats:
        if r["slug"] in inc_c:
            print(f"  {r['slug']:<26} {str(r['eligible']):>5} products   {inc_c[r['slug']]}")

    print("\n" + "-" * 74)
    print("PAGES EXCLUDED (and why)")
    print("-" * 74)
    if excluded_pages:
        for kind, slug, why in excluded_pages:
            print(f"  [{kind:<12}] {slug:<28} {why}")
    else:
        print("  none")

    print("\n" + "-" * 74)
    print("PRODUCTS PER MANUFACTURER (included only; should sum to product pages)")
    print("-" * 74)
    per_m = Counter(r["manufacturer"] for r in product_rows)
    for name, n in sorted(per_m.items()):
        print(f"  {name:<26} {n:>5}")
    print(f"  {'TOTAL':<26} {sum(per_m.values()):>5}")

    print("\n" + "-" * 74)
    print("SLUG QUALITY (informational, nothing is excluded for this)")
    print("-" * 74)
    digit_slugs = [r for r in product_rows if r["slug"][:1].isdigit()]
    print(f"  product slugs starting with a digit: {len(digit_slugs)}")
    short_slugs = sorted(product_rows, key=lambda r: len(r["slug"]))[:8]
    print("  shortest slugs remaining:")
    for r in short_slugs:
        print(f"      {r['manufacturer']:<22} /shop/{r['slug']}")

    print("\n" + "-" * 74)
    print("SERVING CHECK (what the live site returns at these paths right now)")
    print("-" * 74)
    print(f"  /robots.txt  : {serving_check('/robots.txt')}")
    print(f"  /sitemap.xml : {serving_check('/sitemap.xml')}")
    print("  Note: the SPA catch-all answers 200 for paths that do not exist, so")
    print("  'SPA HTML' before deploy is expected and proves nothing either way.")
    print("  The real test is AFTER deploy: re-run and look for 'real XML file'.")

    print("\n" + "-" * 74)
    print(f"sitemap.xml size: {len(sitemap):,} bytes  (limits: 50MB / 50,000 URLs)")
    print(f"would write: {SITEMAP_PATH}")
    print(f"would write: {ROBOTS_PATH}")

    # ---------- review CSV (workspace root, never public/) ------------------
    if WRITE_REVIEW_CSV:
        with open(REVIEW_CSV, "w", newline="", encoding="utf-8") as fh:
            w = csv.writer(fh)
            w.writerow(["type", "manufacturer", "slug", "url", "lastmod"])
            for k, loc, lm, _ in entries:
                if k != "product":
                    w.writerow([k, "", "", loc, lm or ""])
            for r in product_rows:
                w.writerow(["product", r["manufacturer"], r["slug"], r["url"], r["lastmod"]])
        print(f"\nREVIEW FILE: {REVIEW_CSV} written to the workspace root "
              f"({len(entries)} rows). Not part of the site, safe to delete.")

    if not COMMIT:
        print("\nDRY RUN -- sitemap.xml and robots.txt NOT written.")
        conn.close()
        return

    if not os.path.isdir(PUBLIC_DIR):
        print(f"\nABORT: {PUBLIC_DIR} does not exist. Check the path before writing.")
        conn.close()
        return

    with open(SITEMAP_PATH, "w", encoding="utf-8") as fh:
        fh.write(sitemap)
    with open(ROBOTS_PATH, "w", encoding="utf-8") as fh:
        fh.write(robots)

    print(f"\nWROTE {SITEMAP_PATH} ({len(entries)} URLs)")
    print(f"WROTE {ROBOTS_PATH}")
    conn.close()


if __name__ == "__main__":
    main()
