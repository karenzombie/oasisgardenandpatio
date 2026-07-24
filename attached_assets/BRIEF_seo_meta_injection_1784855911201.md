# Brief: Per-Route SEO Metadata (Titles, Descriptions, Canonical) for the Storefront

For: Replit Agent
From: Karen / Claude

| IMPORTANT: Do not make assumptions. If anything is unclear or could be done
| more than one way, STOP and ask Karen. This touches how every page is served
| to search engines. Check in after each gate below and paste REAL diffs and
| REAL command output (curl), never prose summaries. Be economy-minded. |

---

## Problem

The storefront is a client-rendered React/Vite SPA. When a crawler (or anything
that does not execute JavaScript) requests any route, the server returns a
near-empty HTML shell whose `<title>` is the site-wide default "Oasis Garden &
Patio" with no meta description. Verified by fetching
`https://oasisgardenandpatio.com/shop?page=1&material=mgp` cold: the response
contained only that generic title and a viewport tag, no product content and no
per-page metadata. Product detail pages are expected to have the same problem.

Result: even for Google (which can render JS), every page looks like the same
generic page, so nothing ranks. Product names have been cleaned vendor by vendor
(Hanamint, Sunset West, and others complete; more ongoing), and those names
should be the page titles.

## Goal

Inject correct, per-route metadata into the HTML the server already serves, so
the FIRST response for each route carries real SEO tags. No full SSR of the page
body is required. No new routes or pages. No changes to the customer UI, the API,
pricing, cart, or checkout.

Tags to inject per route:
- `<title>`
- `<meta name="description">`
- `<link rel="canonical">`
- Open Graph: `og:title`, `og:description`, `og:image`, `og:url`, `og:type`

## Hard constraints (do not touch)

- Do NOT create new routes, pages, or nav entries.
- Do NOT change any API endpoint, query, response shape, or business logic.
- Do NOT change pricing, cart, checkout, or the Authorize.net path in any way.
- Do NOT change the database or run any migration.
- Do NOT alter the rendered page body or client behavior for users; this is about
  the `<head>` of the served document only.
- Do NOT change existing routing structure or URL formats.
- If injecting server-side head tags requires reading product/category data,
  reuse existing read queries; do not add write paths.
- Build and verify everything in DEV first. Nothing goes to production until
  Karen has reviewed the final verification output and explicitly approves the
  deploy.

---

## Gate 1 - Discovery only (STOP, no code changes)

Report, with the relevant code pasted:

1. Exactly how an app route (e.g. `/product/{slug}` and `/shop`) is served. Which
   server file/handler returns `index.html`? Is it the Hono server, a static
   middleware, Vite preview, or something else? Paste that handler.
2. The current `index.html` `<head>` in full.
3. Any existing metadata handling anywhere: `document.title` sets, react-helmet
   or similar, meta tags set on the client. List every place title/meta is set.
4. How HTML document requests are distinguished from API and static asset
   requests at the server (so head injection only applies to document responses).
5. The current `robots.txt` (paste it) and whether any route currently emits a
   `noindex` or a `canonical`.
6. Whether product and category data needed for titles/descriptions is readily
   available server-side at request time (what functions/queries exist to fetch a
   product by slug, a category, a manufacturer).

Then STOP. Karen reviews before any change. The implementation approach (client
helmet vs server injection vs both) is confirmed after this report.

---

## Gate 2 - Product detail pages (STOP after)

Implement server-side injection of the head tags for product detail routes.

- `<title>`: the product name, then " | Oasis Garden & Patio".
- `<meta name="description">`: from the product's own fields, in this priority
  order: (1) `short_description` if non-empty; (2) else the product
  `description`, stripped to plain text and trimmed; (3) else a simple template
  from name + collection + category (e.g. "Cedar Sofa from Hanamint's Cedar
  collection. Outdoor deep seating at Oasis Garden & Patio."). Note: most
  products have an empty `short_description`, so paths 2 and 3 are the common
  cases. Plain text, no HTML, trimmed to roughly 150-160 characters. Do NOT
  fabricate specs or claims; use only fields that exist on the product.
- Hidden and inactive products: if a product is not publicly visible (e.g.
  `catalog_visible = false` or `is_active = false`), its route must emit
  `<meta name="robots" content="noindex">` and NO enriched metadata (generic
  title is fine). Do not leak hidden products to crawlers. Apply whatever
  visibility logic the storefront itself uses; if that logic is unclear, STOP
  and ask Karen.
- Nonexistent product slugs: the response must not carry enriched metadata; the
  route should behave as it does today for a bad slug (and if it currently
  returns HTTP 200 for bad slugs, report that in the check-in; do not change it
  without asking).
- `<link rel="canonical">`: the clean, canonical product URL (no tracking or
  filter params).
- Open Graph: og:title and og:description mirroring the above; og:image = the
  product's primary image URL; og:url = canonical URL; og:type = "product".
- Escape all injected values (HTML-attribute and text escaping) so a product name
  with quotes or `&` cannot break the markup.

Check in: paste the diff, and paste the `curl -s` output of the `<head>` for TWO
real product URLs: one normal, and one whose name contains a double quote or an
ampersand (e.g. a product with an inch mark in its name, such as the Dominion
Rectangular Dining Table 42" x 68"), proving the escaping holds. STOP.

---

## Gate 3 - Category, manufacturer, and shop/filter pages (STOP after)

Same tag set, for the list routes, driven by the route and its query params.

- Plain `/shop`: a sensible default title and description for the full catalog.
- Category and manufacturer routes: title and description from the category or
  manufacturer name (e.g. "Deep Seating Outdoor Furniture | Oasis Garden &
  Patio", "Hanamint Patio Furniture | ...").
- Filter params (e.g. `?material=mgp`): compose a readable title and description
  from the active facet (e.g. "MGP Outdoor Patio Furniture | ..."). Handle the
  common single facets: material, category, manufacturer.
- Canonical for filtered/paginated list URLs: to avoid indexing thin duplicate
  combinations, set `<link rel="canonical">` on multi-facet or deep-paginated
  URLs to the base or single-facet URL. Confirm the exact canonical rule with
  Karen before finalizing; do not guess the policy.

Check in: paste the diff, and paste `curl -s` head output for `/shop?material=mgp`
and for one category page. STOP.

---

## Gate 4 - Keep client navigation in sync (STOP after)

So the browser tab title and meta stay correct when a user navigates within the
SPA (client-side), wire the same values through react-helmet-async (or the
project's existing mechanism if one already exists, per Gate 1). The server
injection is the source of truth for crawlers; this keeps the client consistent.

DUPLICATE-TAG REQUIREMENT: the client mechanism will add its own title/meta on
hydration. It must REPLACE the server-injected tags, not sit alongside them. A
page must never contain two `<title>` elements or two `name="description"`
metas. The standard approach is to mark server-injected tags (e.g.
`data-ssr="1"`) and remove or take ownership of them on hydration. Verify in the
rendered DOM, not just the source.

Check in: paste the diff and describe how server and client values are kept
identical for a given route. STOP.

---

## Verification (before calling it done)

All in DEV.

- `curl -s` each route type; confirm the head carries the correct title,
  description, canonical, and OG tags in the FIRST response (no JS executed).
- `curl -s` a HIDDEN product's URL; confirm it emits noindex and no enriched
  metadata.
- Confirm in the rendered DOM (browser dev tools) that there is exactly ONE
  title and ONE description tag after hydration, on a product page and a filter
  page.
- Confirm API responses are byte-for-byte unchanged (spot check a couple).
- Confirm the app still renders and hydrates with no new console errors, and that
  a product page, a category page, and checkout still work end to end.
- Confirm no public route emits an unintended `noindex`.

## Out of scope (do NOT build here)

- Sitemap.xml and robots.txt rewrites (separate task).
- Per-tag landing pages or any new routes.
- Structured data / JSON-LD beyond the Open Graph tags above (can be a later
  task; flag it, do not build it now).
