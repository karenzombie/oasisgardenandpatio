# Galtech — Compatible Recommendations (Phase 2)

---

## Overview

This is Phase 2 of the Compatible Recommendations feature, extending the same pattern already built for Treasure Garden to Galtech International umbrella product pages.

The behavior, UI, and rules are identical to the Treasure Garden implementation:

- A "Compatible Recommendations" section appears below the Add to Cart button on Galtech umbrella product pages
- Cards link through to the compatible base's own product page
- The first base listed per umbrella is marked as "Recommended"
- Only display recommended items if the base product is available for online purchase
- Do not touch the configurator, cart, pricing, fabric/finish selectors, or any other existing product page element

If you need a reference for the UI pattern, card design, grid layout, expand/collapse behavior, or the Recommended badge style, refer to the Treasure Garden Compatible Recommendations implementation already on the site.

---

## Key differences from Treasure Garden

Galtech bases are individual products with their own SKUs and come in two finish options each (Black and Silver for Premium Metal; Antique Bronze and Black for European). The card for each base should link to that base's product page so the customer can choose their finish before adding to cart.

The descriptor line on each card should show the style (e.g., "Cast Iron" or "Premium Metal" or "Premium Metal with Wheels").

---

## Galtech base products reference

| SKU | Name | Notes |
|-----|------|-------|
| 075EDAB | European Cast Iron Base — Antique Bronze | 24" diameter |
| 075EDB | European Cast Iron Base — Black | 24" diameter |
| 060SQBK | Premium Metal Base — Black | 21x21" square |
| 060SQSR | Premium Metal Base — Silver | 21x21" square |
| 085SQBK | Premium Metal Base — Black | 24x24" square |
| 085SQSR | Premium Metal Base — Silver | 24x24" square |
| 095SQBK | Premium Metal Base with Wheels — Black | 26x26" square with wheels |
| 095SQSR | Premium Metal Base with Wheels — Silver | 26x26" square with wheels |
| 120SQBK | Premium Metal Base — Black | 26x26" square |
| 120SQSR | Premium Metal Base — Silver | 26x26" square |
| 170SQBK | Premium Metal Base — Black | 26x26" square |
| 170SQSR | Premium Metal Base — Silver | 26x26" square |
| 040SQBK | Steel Plate Base — Black | 13x22" rectangle — for 772 half-wall only |

---

## Compatibility data

Use the umbrella's model number to look up which bases to show. The first base group listed is Recommended. Within each base group, both finish SKUs (Black and Silver, or Antique Bronze and Black) link to their respective product pages — display them as a single card that navigates to the base category or lets the customer pick finish on the base's product page, whichever matches how Treasure Garden bases are handled on the site.

---

### 772 — 3.5' x 7' Half Wall

Show: 040SQBK (Steel Plate Base — Black)
Recommended: 040SQBK

Note: Galtech specifies this base for the 772 only. No other bases apply.

---

### 6' and 7.5' umbrellas

**Models:** 715, 762, 722, 725, 727, 121

Show (in this order):
1. 075EDAB / 075EDB — European Cast Iron Base — **Recommended**
2. 060SQBK / 060SQSR — Premium Metal Base
3. 085SQBK / 085SQSR — Premium Metal Base
4. 095SQBK / 095SQSR — Premium Metal Base with Wheels

---

### 8' and 9' umbrellas

**Models:** 782, 636, 736, 737, 936, 732, 735, 131, 132, 136, 532, 537

Show (in this order):
1. 075EDAB / 075EDB — European Cast Iron Base — **Recommended**
2. 085SQBK / 085SQSR — Premium Metal Base
3. 095SQBK / 095SQSR — Premium Metal Base with Wheels
4. 120SQBK / 120SQSR — Premium Metal Base

---

### 10' umbrellas

**Models:** 799, 792

Show (in this order):
1. 085SQBK / 085SQSR — Premium Metal Base — **Recommended**
2. 095SQBK / 095SQSR — Premium Metal Base with Wheels
3. 120SQBK / 120SQSR — Premium Metal Base

---

### 11' umbrellas

**Models:** 779, 789, 781, 986, 183, 587

Show (in this order):
1. 120SQBK / 120SQSR — Premium Metal Base — **Recommended**
2. 170SQBK / 170SQSR — Premium Metal Base

---

### 13' umbrella

**Model:** 791

Show (in this order):
1. 170SQBK / 170SQSR — Premium Metal Base — **Recommended**
2. 120SQBK / 120SQSR — Premium Metal Base

---

## What NOT to show

- Cantilever models (887, 899, 897) — do not render the Compatible Recommendations section at all on these pages. Cantilevers include their own integrated base and do not use a separate pole base.
- If a Galtech umbrella model number does not appear in this list, do not render the section.
- Do not show a base card if that base product is not available for online purchase.

---

## Nothing else changes

Do not modify the configurator, cart, pricing, fabric selector, finish selector, product images, breadcrumbs, tabs, or any other element on Galtech product pages. Only add the Compatible Recommendations section below the cart button area, using the same component already built for Treasure Garden.
