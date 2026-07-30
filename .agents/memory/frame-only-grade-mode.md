---
name: Frame Only for grade-priced products
description: How the FRAME_ONLY grade sentinel works across the full surface — cart, orders, PDP, staff builder, vendor docs, admin editor.
---

## Reserved sentinel: `"FRAME_ONLY"`
Stored as `variant_grade_prices.grade` for the frame-only price row on a grade-mode product. Never a real fabric grade. All consumers must filter it out of real-grade logic and handle it separately.

## Data model
- Price lives in `variant_grade_prices` with `grade = 'FRAME_ONLY'`. No new table.
- `wishlist_items.variantLabel = 'Frame Only'` encodes frame-only wishlist items (no new column).
- `order_items.fabricGradeSnapshot = 'FRAME_ONLY'` when a frame-only grade line is saved.

## isGradeMode split rule
- `isGradeMode` is TRUE only when at least one variant has a grade row whose grade `!== 'FRAME_ONLY'`.
- `gradeFrameOnlyPrice` is computed separately from the FRAME_ONLY row; excluded from "from" price teasers.
- `gradePriceMap` never contains the FRAME_ONLY key.

## Cart route (cart.ts)
- Early `requiresFabric && !fabricId` guard is skipped when `variantId` is set (grade mode checked later).
- After grade rows load: FRAME_ONLY row → `frameOnlyGradePrice`; real rows → `gradePriceMap`.
- `if (isGradeMode && !fabricId && frameOnlyGradePrice)` → `gradeLinePrice = frameOnlyGradePrice`.

## Staff order route (adminOrders.ts) — both create paths
- `else if (it.grade === 'FRAME_ONLY')` branch sets `fabricGrade = 'FRAME_ONLY'` when `fabricId == null`.
- MSRP lookup (`variant_grade_prices` by variantId + grade) naturally finds the FRAME_ONLY row.

## Vendor PO PDF (vendorOrderPdf.tsx)
- `fabricOption()`: if `fabricGradeSnapshot === 'FRAME_ONLY'` → returns `'Frame Only'` directly.

## PDP (Product.tsx)
- `offersFrameOnly = (isGradeMode && gradeFrameOnlyPrice != null) || (!isGradeMode && hasFabrics && frameOnlyPrice != null)`
- Frame Only toggle shows grade frame-only price (not flat product price) for grade products.
- WishlistButton in quote-only path receives grade-mode state: `selectedFabricId = frameOnly ? null : fabricId`, `selectedVariantLabel = frameOnly ? 'Frame Only' : selectedFabric.name`.

## Staff order builder (NewOrder.tsx)
- `supportsFrameOnly` extended: true when `isGradeMode && gradeFrameOnlyPrice != null`.
- `needsFabric` in grade mode: `!supportsFrameOnly || includeFabric` (fabric optional when FRAME_ONLY row exists).
- `gradeUnitPrice` returns `gradeFrameOnlyPrice` when `supportsFrameOnly && !includeFabric`.
- `addBaseLine.grade`: `isGradeMode ? (fabric != null ? fabric.grade : 'FRAME_ONLY') : null`.
- `addBaseLine.description`: includes `'Frame Only'` text when `isGradeMode && !fabric`.

## Admin grade price editor (ProductEdit.tsx)
- FRAME_ONLY row renders as read-only "Frame Only" dashed badge — grade field is NOT an input.
- "Add Frame Only pricing" button inserts `{ grade: 'FRAME_ONLY', ... }` row; hidden when one already exists.

**Why:**
Arc Furnishings products (grade-priced, quote-only) need a frame-only option without a cushion/fabric. Using a reserved grade sentinel keeps the data model simple and avoids new columns on variant_grade_prices or order_items.
