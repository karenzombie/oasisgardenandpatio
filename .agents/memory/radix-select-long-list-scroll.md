---
name: Radix Select long-list scroll bug
description: Radix Select popovers clip/won't-scroll for long option lists (esp. Safari); use a cmdk Combobox instead.
---

# Radix Select fails for long option lists

A Radix `Select` (shadcn `Select`/`SelectContent`) holding many options clips the
list above the viewport top and becomes unscrollable on Safari, even with
`position="popper"` and `overflow-y-auto`. Swapping a native `<select>` for it does
NOT fix a "stuck scroll" complaint — it can make it worse (item-aligned popover
opens over the trigger and overflows off-screen).

**Fix:** Use a searchable Combobox = `Popover` + cmdk `Command`
(`CommandInput`/`CommandList`/`CommandItem`). `CommandList` has a fixed
`max-h-[300px] overflow-y-auto`, which scrolls reliably across browsers, and the
search box makes long lists usable. Reference pattern: `artifacts/web/src/pages/Fabrics.tsx`.

**Why:** This came up for the manufacturer-page "Collection" filter, where the
first-word collection rule generates a long option list.

**How to apply:** Any time a dropdown's option list can grow long (dynamic/derived
options), prefer the Popover+Command combobox over Radix Select. Clear-filter option
goes first as an explicit item (e.g. "All collections" → set the URL param to null).
