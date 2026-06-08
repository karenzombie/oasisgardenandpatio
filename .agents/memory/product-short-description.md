---
name: Product short_description teaser
description: How product short_description relates to description and how to build it (no char-clamp).
---

# Product short_description teaser

`products.short_description` is the teaser shown at the top of the PDP (the blurb
above the buy/configuration area), set to the first paragraph of
`products.description`. The PDP tab area shows the *remainder* of
`description` (everything after the first paragraph) under a tab labelled
**"Features"** (not "Description") so the top blurb and the tab never duplicate
the same intro copy. If `description` has no second paragraph the Features tab is
hidden and Specifications becomes the default tab. Logic lives in the customer
PDP page.

**Rule:** build `short_description` from the *first paragraph* of `description`
(split on the first blank line, else the whole text), never a hard char-clamp.

**Why:** several product seeds originally built it as
`description.slice(0, N).replace(/\s\S*$/, "") + "…"`, which cut sentences
mid-word and showed a visible "…" on the live page. Customers (rightly) read
that as missing/lost data even though the full text was always intact in
`description`. The first-paragraph approach shows the complete leading paragraph
with no ellipsis.

**How to apply:** use the shared `scripts/src/firstParagraph.ts` helper for any
seed that derives a short teaser from a longer description. Only these
manufacturers' seeds ever char-clamped: Frankford, Couture Jardin, Summerset,
Hanamint, NorthCape, Galtech. Spec-generated teasers (loadVendorData, loadOwLee)
are sentences that never end in "…" and should be left alone. To repair stale
data, target rows whose `short_description` ends in "…"/"..." — that suffix is a
reliable provenance marker for the clamped seeds.
