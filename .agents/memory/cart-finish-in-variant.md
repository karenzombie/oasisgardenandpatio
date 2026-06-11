---
name: Cart finish requirement for finish-in-variant grade products
description: When the cart/checkout may require a discrete finishId vs. finish carried in the variant
---

# Grade-mode finish requirement must be gated on discrete-finish existence

In `POST /cart/items` (and any finish validation), grade-mode products fall into two shapes:

- **Discrete-finish products** (Galtech/Frankford via finish pools or `product_finish_options`): require + validate `finishId`.
- **Finish-in-variant products** (Treasure Garden umbrellas): the finish is encoded in the chosen variant (e.g. `AKZP13-09-DWV`, variantName "Black (DWV)"). They have NO finish pools and NO finish options. They must NOT require a separate `finishId`; a stray `finishId` is rejected.

Gate on `allowedFinishIds.size > 0` (pool-expanded mfr finishes ∪ product finish options). Do not unconditionally require `finishId` in grade mode — that silently blocks add-to-cart for TG umbrellas with "Please choose a frame finish".

**Why:** TG umbrella pricing uses the grade engine but the finish is a variant axis, not a discrete finish row. The original grade-mode cart code assumed every grade product had discrete finishes.

**How to apply:** Any change to finish validation in cart.ts / checkout / admin order creation must preserve the two-shape split. The PDP mirror is `finishVariantMode = isGradeMode && finishes.length===0 && variants all have optionLabel matching /finish/i`. The data invariant cart relies on: TG (mfr 12) has 0 product_finish_options and 0 product_finish_pools.
