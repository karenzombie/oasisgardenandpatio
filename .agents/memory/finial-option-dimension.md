---
name: Adding a new product option dimension (finial pattern)
description: The full surface checklist + the staff-dialog stale-ID gating trap when adding an option dimension like finial/finish.
---

# Adding a new product option dimension

When adding a per-product selectable option dimension (e.g. Frankford "finial" pole-cap, modeled on "finish"), it is NOT a separate line item — it folds an upcharge into the per-unit price. To keep it consistent you must touch EVERY surface or one silently drops it:

- **DB**: new `product_<dim>_options` table; add `<dim>Id` to `cart_items` (FK set null) AND to the cart_items unique index via `COALESCE(<dim>Id,0)`; add `<dim>Id` + `<dim>CodeSnapshot` + `<dim>NameSnapshot` to `order_items`.
- **OpenAPI**: add the option schema; add `<dim>Options[]` to BOTH `CatalogProductBySlug` and `AdminProductPickerDetail`; add `<dim>Id` to `AddCartItemRequest` + `CreateOrderItemRequest`; add `<dim>Id`/`<dim>Name` to `CartItem`, `AdminOrderItem`, `AccountOrderItem` — properties AND the `required` list (these schemas `.parse()` server-side, so a producer missing the column 500s). Then regenerate codegen.
- **API routes**: by-slug, picker, cart (serialize select + leftJoin AND validate/apply on POST/PUT), checkout (snapshot), adminOrders, account, vendorOrderPdf.
- **Web**: customer PDP picker (stack upcharge into the same finishUpcharge sum, grade + flat), staff NewOrder `ProductPickerDialog` (selector UI + state) AND `applyPickedProduct`/LineItem literals + create-order payload, Cart.tsx display, AccountOrderDetail.tsx display.

**Why this is a trap:** the price must be computed ONCE (PDP / dialog) and passed down; line-item code must never recompute. Upcharge stacks additively with the finish upcharge.

## Staff dialog stale-ID gating trap
`ProductPickerDialog` state (`<dim>Id` as a string) must be reset on BOTH dialog close and product change (`useEffect` on `open` and on `picked?.id`) — the other selectors already are; it is easy to forget the new one. Gate `canAdd`/`handleAdd` on the RESOLVED option object (`selectedFinial = options.find(...)`), NOT raw `!!<dim>Id`. A leftover ID from a previously-picked product passes a raw-ID check while `selectedFinial` is null, sending `<dim>Id: null` on the line.

**How to apply:** any future option dimension — copy the finish wiring end-to-end, then grep for every place `finishId`/`finishName` appears and add the parallel `<dim>` field. The picker mirrors the customer `by-slug` shape.

## Prod sync caveat
New option tables are NOT auto-mirrored to prod. The post-merge catalog full-sync has a fixed table allowlist (see prod-catalog-full-sync.md) — a new `product_<dim>_options` table plus the `cart_items`/`order_items` column additions must be added there (and the columns created in prod) or the option never reaches production.
