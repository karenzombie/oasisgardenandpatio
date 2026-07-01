# Visibility and Flags — UI Overhaul Brief

**For:** Replit Agent
**From:** Karen / Claude
**Date:** July 2026

---

> **IMPORTANT:** Do not make any assumptions during this build. If anything is unclear, ambiguous, or could be interpreted more than one way, stop and ask Karen before proceeding. This section touches core product visibility and pricing logic — a wrong assumption here could affect how products appear to customers on the live site.

---

## Overview

This brief covers a targeted overhaul of the Visibility and Flags section of the product edit screen in the admin portal. The goal is to simplify what staff users see and interact with, remove toggles that serve no purpose for this business, and make the remaining controls clearer and harder to misconfigure.

A reference mockup screenshot is attached. Use it as the visual target for the finished UI. The sections below describe every change in detail including what to remove, what to keep, what logic changes to make, and how the existing database columns map to the new behavior.

---

## Section 1 — What to remove

The following items must be removed from the Visibility and Flags section of the product edit screen. Each removal is described with its scope so nothing else in the system is accidentally broken.

### 1A. LED Lighting toggle

**Remove from UI**
- Remove the LED Lighting toggle from the product edit screen entirely.

**Remove from database and codebase**
- Identify the column that stores this value (likely a boolean on the products table — confirm before touching anything).
- Remove the column from the database if it exists and has no other dependencies.
- Remove any associated filter or facet logic on the storefront that uses this field to filter products.
- Remove any search indexing or tag logic tied to this field.
- If any other part of the codebase reads or writes this column, flag it to Karen before removing.

> Do not assume this column is safe to drop. Check for any references to it across the codebase first and report back before making any database changes.

---

### 1B. Commercial Grade toggle

**Remove from UI**
- Remove the Commercial Grade toggle from the product edit screen entirely.

**Remove from database and codebase**
- Identify the column that stores this value (likely a boolean on the products table — confirm before touching anything).
- Remove the column from the database if it exists and has no other dependencies.
- Remove any associated filter or facet logic on the storefront that uses this field.
- Remove any search indexing or tag logic tied to this field.
- If any other part of the codebase reads or writes this column, flag it to Karen before removing.

> Same caution as above. Check for references across the full codebase before dropping anything.

---

### 1C. In-Store Only toggle

**Remove from UI**
- Remove the In-Store Only toggle from the product edit screen entirely.

**Database — keep the column, do not remove it**
- The `in_store_only` column (or equivalent) should remain in the database schema untouched.
- It simply should not be exposed in the UI any longer.
- If the storefront has any logic that reads `in_store_only` to affect product display or checkout behavior, flag it to Karen before changing anything. We need to understand what it currently does before deciding whether that logic stays or goes.

> Do not remove `in_store_only` from the schema. Hide it from the UI only. Flag any storefront logic that reads this value.

---

### 1D. Display Order field

**Remove from UI**
- Remove the Display Order numeric input from the product edit screen. Staff users do not need to interact with this.

**Database and code — leave completely untouched**
- The `display_order` column must remain in the database.
- Any backend or storefront logic that uses `display_order` for sorting must remain exactly as it is.
- This is a hide-from-UI-only change. Nothing else changes.

---

### 1E. Show Price Online toggle (standalone)

The current standalone Show Price Online toggle is being replaced by new consolidated logic described in Section 2. Do not leave the old toggle in place alongside the new controls. Once the new pricing logic is implemented, the old toggle should be removed from the UI.

---

### 1F. Quote / Call for Price toggle (standalone)

Same as above. The current standalone Quote toggle is being replaced by the new consolidated logic in Section 2. Remove it from the UI once the new controls are in place.

---

## Section 2 — What to keep and how the logic changes

The following controls remain but are reorganized and in some cases their logic is adjusted. The underlying database columns for all of these already exist — this is a UI and logic change only, not a schema change.

---

### 2A. Active toggle

**What it does — no logic change**
- On: product exists in the system, is manageable by staff, and is subject to the other visibility controls.
- Off: product is permanently archived. Hidden from all storefront routes and all staff order screens. This is for retiring a product for good, not for temporarily hiding it.

**UI behavior**
- When Active is turned off, the Available Online toggle and the Show Price in Inquiry Mode toggle must both be visually grayed out and non-interactive.
- The status bar (described in Section 3) must update to show the archived state.

**Tooltip text for staff**
- **On:** Product exists in the system and is manageable by staff.
- **Off:** Product is permanently archived. Hidden from the storefront and all staff order screens. Use this only to retire a product for good.

---

### 2B. Available Online toggle

**What it does — logic change**

This toggle is the primary control for whether a product can be purchased online or is in inquiry/quote mode. It replaces the old separate Show Price Online and Quote / Call for Price toggles, which overlapped and caused confusion.

| State | What happens |
|---|---|
| Available Online ON | Product is shown on the storefront with its price. Customers can add it to cart and complete an online purchase. This is the standard state for purchasable products. |
| Available Online OFF | Product is still shown on the storefront but switches to inquiry mode. The price is hidden by default and the Add to Cart button is replaced with a call or request-a-quote panel. Customers cannot purchase online. Staff can toggle this back on at any time to make the product purchasable again. |

**How this maps to existing database columns**

These two existing columns handle the new behavior between them. No new columns are needed.

| UI state | Column values |
|---|---|
| Available Online ON | `available_online = true`, `show_price_online = true`, `quote_only = false` |
| Available Online OFF (default inquiry) | `available_online = false`, `show_price_online = false`, `quote_only = true` |
| Available Online OFF + show price edge case | `available_online = false`, `show_price_online = true`, `quote_only = true` |

> The `show_price_online` and `quote_only` columns must NOT be removed from the schema. They continue to do the work behind the scenes. Only their standalone UI toggles are removed.

**Tooltip text for staff**
- **On:** Product is shown on the site with a price and can be added to cart and purchased online.
- **Off:** Product is shown on the site but switches to inquiry mode. Customers must call or request a quote to purchase. No cart or checkout. Toggle back on at any time to make it purchasable again.

---

### 2C. Show Price in Inquiry Mode toggle (edge case, subordinate control)

**What it does**

This is an edge case control that only applies when Available Online is off. It allows a staff user to optionally display the product price even while it is in inquiry mode. The customer still cannot purchase online — they must still call or request a quote. The only difference is whether the price number is visible on the product page.

| State | What happens |
|---|---|
| Off (default) | Price is hidden. Customer sees "Call for price" and an inquiry form. |
| On (rare) | Price is visible on the product page. Customer still cannot add to cart or check out. They still must call or request a quote. |

**UI behavior**
- This control must appear visually subordinate to the Available Online toggle — indented or nested beneath it.
- When Available Online is ON, this toggle must be grayed out and non-interactive. It has no effect when the product is purchasable online.
- When Available Online is OFF, this toggle becomes active and interactive.
- A note beneath the toggle should read: "Only relevant when available online is off."

**Tooltip text for staff**
- *Only applies when Available Online is off.*
- **On:** Price is visible on the product page, but customers still cannot buy online. They must call or request a quote.
- **Off:** Price is hidden entirely. Customers see "Call for price" and an inquiry form.

---

### 2D. Featured toggle

**What it does — no logic change**
- On: product appears in the homepage featured carousel and is promoted at the top of category pages.
- Off: product appears in the normal catalog and category listings only. No special promotion.

No logic change needed. This toggle is moved into the reorganized layout under a Discoverability section label but its underlying behavior is unchanged.

**Tooltip text for staff**
- **On:** Product appears in the homepage featured carousel and is promoted at the top of category pages.
- **Off:** Product appears in normal catalog and category listings only. No special promotion.

---

## Section 3 — Status bar

Directly below the Active and Available Online toggles, a status bar must display a plain-English summary of what a customer would currently experience on the storefront. This updates in real time as staff change the toggles, before they save. It gives staff instant confirmation that the product is in the right state.

| Toggles state | Bar appearance |
|---|---|
| Active ON, Available Online ON | Green bar. Icon: checkmark circle. Text: "Live and purchasable online." |
| Active ON, Available Online OFF, Show Price OFF | Amber bar. Icon: message circle. Text: "Inquiry mode — price hidden, customers must call or request a quote." |
| Active ON, Available Online OFF, Show Price ON | Blue bar. Icon: tag. Text: "Inquiry mode — price is visible, but customers must call or request a quote to purchase." |
| Active OFF | Red bar. Icon: archive. Text: "Product is archived. Hidden from all storefront routes and staff order screens." |

---

## Section 4 — Layout and grouping

The Visibility and Flags section should be reorganized into three visual groups with small section labels above each group. Refer to the attached mockup screenshot for the exact visual layout.

| Group label | Contents |
|---|---|
| Product status | Active toggle, Available Online toggle, status bar, Show Price in Inquiry Mode (subordinate/nested beneath Available Online) |
| Discoverability | Featured toggle |
| Removed entirely | In-Store Only, Display Order, LED Lighting, Commercial Grade |

---

## Section 5 — Tooltips and mobile considerations

### Desktop tooltips

Each toggle must have a small circular question mark icon next to its label. On hover, a tooltip panel appears to the right of the icon with the On and Off explanations written out in plain language. The exact tooltip text for each toggle is specified in Section 2 above.

### Mobile staff users

Staff users may access the admin portal on a mobile web browser. Hover-based tooltips do not work on touch screens. The following approach has been decided and must be implemented:

On mobile screen sizes, hide the question mark icon entirely. Instead, show the tooltip description text directly beneath each toggle label at all times as a short subline in muted smaller text. No tap or hover interaction required — the explanation is always visible inline. This keeps the interface simple and clear for staff on phones or tablets without requiring any extra interaction.

> This is a confirmed decision. No need to ask Karen about the mobile tooltip approach.

---

## Section 6 — What must not change

The following must remain exactly as they are. Do not touch these during this build.

- The `display_order` column in the database and any sorting logic that uses it.
- The `in_store_only` column in the database.
- The `show_price_online` and `quote_only` columns in the database — these continue to do the backend work for the new Available Online logic.
- The `available_online` column — its behavior is being clarified in the UI but the column itself is unchanged.
- Any other sections of the product edit screen outside of Visibility and Flags.
- Any storefront display logic not directly tied to the fields being changed.
- Any order, pricing, or checkout logic not directly tied to the fields being changed.

---

## Section 7 — Order of operations

To reduce the risk of breaking anything, complete this build in the following order and check in with Karen between each step.

1. Remove LED Lighting and Commercial Grade from the UI only first. Confirm nothing breaks on the storefront before touching the database.
2. After Karen confirms step 1 is clean, remove the associated database columns and storefront filter logic for LED Lighting and Commercial Grade.
3. Hide Display Order and In-Store Only from the UI. Do not touch their database columns.
4. Implement the new Available Online logic and the subordinate Show Price in Inquiry Mode toggle, wiring them to the existing columns as specified in Section 2.
5. Remove the old standalone Show Price Online and Quote / Call for Price toggles from the UI.
6. Add the status bar.
7. Reorganize the layout into the three groups with section labels.
8. Add tooltips on desktop, then implement the always-visible mobile subtext behavior as specified in Section 5.
9. Full review pass — confirm every toggle behaves correctly, the status bar reflects the right state in all four scenarios, and nothing on the storefront has been affected.

> Ask Karen to review and confirm after each step before moving to the next. Do not batch multiple steps together.

---

*End of brief*
