# Agent Brief: Filter Sidebar Should Scroll Independently (Desktop)

## Goal

On the product listing pages, the left filter sidebar is taller than the screen
but has no scroll region of its own, so scrolling over it scrolls the whole page
(products included) instead of the filter. Give the desktop sidebar its own
bounded height and independent scroll so it scrolls on its own and stays in view.

Pure CSS (Tailwind className) change. No schema, no api-spec, no codegen, no data.
Frontend only.

## Why (root cause, already diagnosed)

The desktop sidebar is wrapped in `<div className="sticky top-6">`. `sticky`
positions it, but with no `max-height` and no `overflow`, the element has no
scrollable area of its own. When the filter list exceeds the viewport height, the
wheel scrolls the nearest scrollable ancestor, which is the page. Adding a bounded
height plus `overflow-y-auto` gives the sidebar its own scroll; `overscroll-contain`
stops the scroll from chaining back to the page when the sidebar reaches its end.

## The change

At each of the three sites below, change the sidebar wrapper className from:

```
sticky top-6
```

to:

```
sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto overscroll-contain pr-1
```

Do not change anything else on these lines or in the `{sidebar}` content. This is
the desktop wrapper only (inside `hidden md:block w-52 shrink-0`); do not touch the
mobile filter panel.

### Sites (all identical)
1. `artifacts/web/src/pages/Shop.tsx` — around line 617, the
   `<div className="sticky top-6">` inside the "Desktop sidebar" block.
2. `artifacts/web/src/pages/ManufacturerProducts.tsx` — around line 422,
   `<div className="sticky top-6">{sidebar}</div>`.
3. `artifacts/web/src/pages/Search.tsx` — around line 453, the
   `<div className="sticky top-6">` inside the "Desktop sidebar" block.

(The Fabrics page uses a different layout and is intentionally out of scope. The
mobile filter panel, `md:hidden ... {sidebar}`, is an inline expandable panel and
is intentionally left as-is.)

## Do NOT

- Do not change the mobile filter panel.
- Do not change the `{sidebar}` markup, the results grid, or the page layout row.
- Do not introduce a fixed/absolute position; keep `sticky`.
- Do not add any new dependency, component, or api-spec change.

## Checkpoint 1

Stop after the three edits. Report the three diffs (they should be the single
className change and nothing else). Do not proceed to verification until confirmed.

## Verification

1. Typecheck / build the web app and paste the actual result (not just "passes").
2. Hands-on walkthrough in dev, desktop width, on all three pages
   (a category page like Umbrellas, a manufacturer page, and a search results
   page):
   - With the filter taller than the window, put the mouse over the filter and
     scroll. The filter should scroll on its own; the products and page should NOT
     move. When the filter reaches its bottom, it should stop, not drag the page.
   - Scroll the main product area. The filter should stay pinned in view
     (`sticky`) as before.
   - Confirm nothing shifted visually at the top (the sidebar still starts aligned
     with the results).
3. Quick mobile-width check that the inline filter panel still opens and behaves as
   before (unchanged).

### Checkpoint 2

Report the walkthrough result. Stop. Do not sync to prod (Karen handles that).

## Note (only if needed)

If in testing the sidebar tucks under a sticky site header at the top, the fix is
to bump the `top-6` offset to match the header height (and subtract the same from
the `max-h` calc). Only do this if you actually observe it; otherwise leave `top-6`.
