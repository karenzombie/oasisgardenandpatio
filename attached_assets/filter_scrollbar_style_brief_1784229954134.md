# Agent Brief (follow-up): Style the Filter Sidebar Scrollbar

## Goal

The desktop filter sidebar now scrolls independently, but it shows the default OS
scrollbar (a thick gray bar). Style it thin and subtle to match the site palette.
This matches the scrollbar-styling pattern already used in the codebase
(`Home.tsx:254`).

Pure CSS (Tailwind className) change. No schema, no api-spec, no codegen, no data.
Frontend only.

## The change

This applies to the SAME three sidebar wrappers edited in the sidebar-scroll fix.
Each currently reads:

```
sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto overscroll-contain pr-1
```

Append these classes to each, so the full className becomes:

```
sticky top-6 max-h-[calc(100vh-3rem)] overflow-y-auto overscroll-contain pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30
```

### Sites (all three, identical)
1. `artifacts/web/src/pages/Shop.tsx` — the desktop sidebar wrapper (was line ~617).
2. `artifacts/web/src/pages/ManufacturerProducts.tsx` — the desktop sidebar wrapper
   (was line ~422).
3. `artifacts/web/src/pages/Search.tsx` — the desktop sidebar wrapper (was line ~453).

Do not change anything else. Do not touch the mobile filter panel.

## Do NOT

- Do not change the mobile filter panel or the `{sidebar}` markup.
- Do not add a scrollbar plugin or new dependency; use the inline Tailwind
  arbitrary variants above (same approach already used in `Home.tsx`).
- Do not alter the scroll behavior classes already in place
  (`max-h`, `overflow-y-auto`, `overscroll-contain`).

## Checkpoint 1

Stop after the three edits. Report the three diffs (they should be only the
appended scrollbar classes). Do not proceed until confirmed.

## Verification

1. Build the web app and paste the actual result.
2. Hands-on walkthrough at desktop width on a category page (e.g. Umbrellas), a
   manufacturer page, and a search results page:
   - The filter scrollbar should now be a thin, rounded, muted sliver, not the
     thick gray default bar.
   - Scrolling over the filter still scrolls only the filter (behavior unchanged).
3. Quick mobile-width check that the inline filter panel is unaffected.

### Checkpoint 2

Report the walkthrough result. Stop. Do not sync to prod (Karen handles that).
