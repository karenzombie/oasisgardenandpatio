---
name: Featured/curated homepage lists must filter availableOnline
description: Why homepage product lists that link to /shop/:slug must filter availableOnline=true
---

Any homepage/storefront product list whose cards link to the customer PDP (`/shop/:slug`, served by `/products/by-slug/:slug`) must filter `availableOnline = true` in its query — not just `isActive` + the curation flag.

**Why:** `/products/by-slug/:slug` returns 404 when `availableOnline = false`. A staff-flagged in-store-only product would otherwise render on the homepage and 404 when clicked. The admin `featured` toggle has no online/active gate, so curated lists must enforce it themselves.

**How to apply:** The `/products/featured` route filters `isActive && availableOnline && featured`. Apply the same `availableOnline` gate to any future curated/homepage list that links to the PDP.
