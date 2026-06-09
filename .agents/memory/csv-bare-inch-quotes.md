---
name: Malformed CSV with bare inch-mark quotes
description: Vendor product-list CSVs mix quoted fields with bare/escaped inch marks; how to preprocess before Papa parse.
---

Some vendor "product list" CSVs (e.g. TG rugs/covers) are malformed: the Features
column is wrapped in quotes (it has commas), but Size/Notes/Name fields contain
**bare** inch-mark quotes (`7'10"`, `33" W`) that are NOT escaped, and a few rows
DO use proper `""` escaping (fire-pit covers). Papa throws "Trailing quote on
quoted field is malformed".

**Fix:** preprocess only the product-list text before parsing — convert a `"`
preceded by a digit or `'` into the inch symbol `\u2033` (″), but use a negative
lookahead `(?!")` so genuine `""` escapes are preserved:
`text.replace(/([0-9'])"(?!")/g, "$1\u2033")`.

**Why the lookahead:** without it, `36""` (escaped inch) becomes `36″"`, leaving
a stray quote that re-breaks parsing.

**Caveat:** do NOT apply this to the companion *pricing* CSV — those are properly
`""`-escaped throughout and the transform would corrupt them.

Also: image filenames may drop the SKU hyphen (`PFC406C.png` vs SKU `PFC406-C`).
Index images under both the raw basename and a normalized key (uppercase, strip
`-`/spaces) and look up with the same normalization.
