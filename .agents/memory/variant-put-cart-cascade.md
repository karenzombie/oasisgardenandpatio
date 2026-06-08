---
name: Variant PUT must not churn variant IDs
description: Why admin variant replace-all uses keyed upsert (by variantSku) instead of delete-all + reinsert.
---

`PUT /admin/products/:id/variants` (replace-all semantics from the staff ProductEdit
"Variants & grade pricing" editor) must update existing rows in place, not delete-all
+ reinsert.

**Why:** `product_variants.id` is referenced by `cart_items.variant_id` with
`ON DELETE CASCADE`. Reinserting variants mints new IDs every save, which
cascade-deletes any customer cart line pointing at the old variant — silent
customer cart data loss on a routine admin edit.

**How to apply:** Match submitted variants to existing rows by `variantSku`
(stable key) inside the transaction: update matched rows, insert new SKUs, and
delete only the variants whose SKU is no longer in the submission. `variant_grade_prices`
has no inbound cart FK, so it is safe to delete-and-reinsert per kept variant.
Also: the staff editor's Save must be gated on the variants query having hydrated
(`variantsHydrated`) — saving before load sends an empty array and wipes everything.
