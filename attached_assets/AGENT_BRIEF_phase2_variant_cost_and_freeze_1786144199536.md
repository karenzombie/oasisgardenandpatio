# Agent Brief: Phase 2 of 4 - variant cost field + freeze order/vendor-order cost (staff-only)

## What this phase does, in plain terms

Vendor-order cost is broken in three ways today:

1. Absolute and size-priced variants have nowhere to store a cost. The variant
   table has msrp and sale_price but no cost column.
2. Cost is pulled LIVE from `products.cost` only. So it reads $0 for
   grade-priced products (their cost lives per grade) and for variant-priced
   products, and it differs between the two vendor-order types.
3. Because it is live, an old order shows today's cost, not the cost it had the
   day it was created. That rewrites history.

This phase fixes all three:

- Add a cost field to variants.
- Build one shared cost lookup that returns the correct per-unit cost for any
  line (flat product, absolute/size variant, or grade-priced).
- FREEZE that resolved cost onto each line when the line is created (a new
  snapshot column), and read that frozen value on every later view. Never
  re-resolve live.
- Add a grade/finish selector to the hand-built vendor-order screen so
  grade-priced lines can resolve their cost there too.
- Show cost per unit and total (qty x cost) in the staff screens, identical for
  both vendor-order types.
- Leave the printed and emailed PO exactly as it is. It already shows no cost.

## Absolute constraints (non-negotiable, read before writing any code)

1. Cost is STAFF-ONLY. It must never appear on the printed or emailed vendor PO,
   never in any customer-facing response, and never to the vendor. The PO
   document today shows only Item #, Description, and Order Qty. It must still
   show exactly those three after this work.
2. Cost FREEZES at line creation. It is captured once, stored on the line, and
   read from storage forever after. It is never re-resolved live on view.
3. Pre-existing lines have no stored cost. They show BLANK. Do not backfill them,
   do not stamp them with today's cost, do not leave them on a live lookup.
4. No manual cost entry. Staff do not type cost. The hand-editable unit-price
   field on the vendor-order screens is removed; cost is resolved automatically.
5. Never fabricate a cost. When nothing resolves, the value is blank (null),
   never 0 and never a guessed number.
6. Do not touch any product visibility flag (available_online, quote_only,
   show_price_online, catalog_visible, is_active) anywhere in this work.
7. DEV ONLY. Do not touch the production database. Do not run any prod push. Do
   not set ALLOW_PROD. Karen handles the dev-to-prod sync separately, later.
8. This is Phase 2 only. Phases 3 and 4 (re-point price reads to msrp, drop the
   `price` column) are NOT in scope. Do not start them or "prepare" for them.

## The two order concepts share one line table

Both vendor-order types, and customer/staff orders, store their line items in
`order_items`. A standalone (hand-built) vendor order inserts `order_items` rows
with `order_id` NULL and `vendor_order_id` set. A customer-order-derived vendor
order reuses the customer order's `order_items` rows. So a single cost snapshot
column on `order_items` serves customer orders and both vendor-order types at
once. Karen's rule is that BOTH orders and vendor orders freeze cost at creation,
so the snapshot is stamped wherever an `order_items` line is created.

---

## STEP 0 - Recon (read-only, no code changes)

Before writing anything, produce two inventories so the full footprint is on the
table:

A. Every code path that CREATES an `order_items` line. Expected to include, at
   minimum: customer checkout, staff-created orders, standalone vendor orders
   (`adminVendorOrders.ts`), customer-order-derived vendor orders
   (`adminOrders.ts`), and any inventory-driven vendor-order creation
   (`adminInventory.ts`). Find all of them, do not assume this list is complete.

B. Every place that currently READS or DISPLAYS a resolved cost for a line. The
   known one is the live pull in `adminVendorOrders.ts` (the `resolveCost`
   helper that reads `products.cost` by product id and by SKU) which feeds the
   vendor-order detail screen. Find every consumer of that value, and any other
   staff surface that shows a per-line cost.

### STOP. Paste both inventories (file + line ranges for each hit). Do not write
code until Karen confirms the footprint is complete.

---

## STEP 1 - Schema (dev only)

Add two additive, nullable columns. Both nullable so nothing existing breaks and
pre-existing rows read blank.

- `product_variants.cost` numeric(10,2), nullable. Absolute per-variant cost, for
  the variants that carry their own msrp/sale (size-priced, absolute-priced).
  Staff-only.
- `order_items.unit_cost_snapshot` numeric(10,2), nullable. The per-unit cost
  frozen at line creation. Staff-only. Sits alongside the existing snapshots on
  this table (sku, variant name, finish, fabric grade, MSRP, weight).

Update the Drizzle schema files to match (`lib/db/src/schema/variants.ts` and
`lib/db/src/schema/orders.ts`), then apply to the DEV database using the db
package's push script (`@workspace/db` `push`) against the dev `DATABASE_URL`.
Do NOT use push-force. Do NOT touch prod.

### STOP. Paste:
1. The schema-file diff.
2. The exact push command and its FULL output.
3. A read-only `information_schema.columns` query result proving both new columns
   exist on dev with the right type and nullability, and confirming no other
   column was added, dropped, or altered.

---

## STEP 2 - Variant cost field in the product editor

Wire the new `product_variants.cost` end to end so staff can set it.

- In `artifacts/web/src/staff/pages/admin/ProductEdit.tsx`, add a Cost input in
  the variant-level absolute-price block, directly after the existing "Sale
  price" input (the block with "MSRP / Absolute price (overrides base)" and "Sale
  price / Optional; blank = no sale", around the `v.msrp` / `v.salePrice`
  inputs). This is the variant's own absolute pricing block. Do NOT add it to the
  GRADE PRICES table below it, which already has its own per-grade Cost column
  from Phase 1.
- Add `cost` to the variant form state where msrp/salePrice are initialized and
  where they are serialized on save (the same two spots that already handle
  `v.msrp` / `v.salePrice`). Blank stays null, same pattern as msrp.
- Update the product create and update API so variant `cost` is accepted and
  persisted, mirroring how variant `msrp` / `salePrice` already flow through.
- Regenerate the API contract/types so the new field is in the generated client.

### STOP. Paste the raw diff of every changed file, `git status --porcelain`, and
the real typecheck/build output for each affected package.

---

## STEP 3 - One shared cost resolver

Add a single cost-resolution helper in `lib/db/src/pricing.ts` so every creation
path resolves cost the same way. It returns the per-unit cost for a line given
the product, the variant (if any), and the selected grade/finish:

- Grade-priced (the variant has `variant_grade_prices` rows): return the `cost`
  of the row whose `grade` matches the line's selected grade key. Match using the
  SAME key the product uses: the fabric grade label for fabric-graded products,
  the finish id for tile/finish-graded products. If there is no matching row, or
  the matching row's `cost` is null, return null.
- Absolute/size variant (variant.cost is set): return variant.cost.
- Flat product: return `products.cost`.
- Anything unresolved: return null. Never 0, never a fabricated value.

This step only adds the function. Do not wire it into any route yet.

### STOP. Paste the function and the real typecheck output.

---

## STEP 4 - Grade/finish capture on the hand-built vendor order

The standalone vendor-order screen (`VendorOrderNew.tsx`) today captures only
product, variant, and quantity. Grade-priced products need a grade so the
resolver can find the cost.

- When a grade-priced product/variant is added to the line, present a selector of
  that variant's available grade rows by their human-readable name (fabric grade
  name, or finish name for tile-graded), and require a selection.
- Store the chosen grade key and its display-name snapshot on the resulting
  `order_items` line, using the existing snapshot columns
  (`fabric_grade_snapshot` / `finish_id` + `finish_name_snapshot`, matching how
  customer-order lines already record grade/finish). Do not invent a new column.
- Non-grade-priced products (flat, absolute) show no selector, unchanged.
- This screen today has a hand-editable "Unit cost" input that defaults to
  `products.cost`. Remove that input. Cost is never typed on a vendor order; it
  is resolved automatically (Step 3) and frozen (Step 5). After this step the
  screen captures product, variant, grade/finish (when applicable), and quantity
  only. The removed input's stored values are handled in Step 5.

Customer-order-derived and inventory-derived lines already carry the grade/finish
from the customer's selection, so they need no picker.

### STOP. Paste the raw diff, `git status --porcelain`, and the real typecheck
output.

---

## STEP 5 - Freeze cost at creation, at every line-creation path

At every path found in Step 0-A, when an `order_items` line is created, resolve
the per-unit cost with the Step 3 helper and store it in
`order_items.unit_cost_snapshot`:

- Customer checkout and staff-created orders: resolve using the grade/finish the
  customer/staff selected on that line.
- Standalone vendor orders: resolve using the product/variant and, for
  grade-priced lines, the grade/finish captured in Step 4.
- Customer-order-derived and inventory-derived vendor orders: resolve using the
  grade/finish already on the line.

The snapshot is written once, at creation. If a line is edited in a way that
creates or replaces a line later, resolve and stamp at that point too; do not
re-stamp existing lines on unrelated edits.

### The two required money columns (`unit_price`, `amount`)

`order_items.unit_price` and `order_items.amount` are NOT NULL, so every created
line must write both. Their meaning depends on the order type, and this work
changes them only on the standalone vendor-order path:

- Customer checkout and staff-created orders: `unit_price` and `amount` keep
  their existing meaning (the sale price charged and the line total charged) and
  MUST NOT be altered by this work. The sale price stays editable on the order,
  exactly as today. This work only ADDS the staff-only `unit_cost_snapshot` on
  these lines; it does not touch price or total.
- Standalone (manual) vendor orders: there is no customer and no sale price on
  these lines, so the only money is cost. Set `unit_price` to the resolved frozen
  cost and `amount` to that cost x quantity, so the stored line matches exactly
  what staff see and audit (per-unit cost and calculated total). These are the
  same frozen figure as `unit_cost_snapshot`; they are never typed by staff.
- Customer-order-derived and inventory-derived vendor orders: these reuse the
  customer order's existing `order_items` rows, which already carry the customer's
  `unit_price` and `amount`. Do NOT overwrite them. Only ensure
  `unit_cost_snapshot` is present.

When cost does not resolve on a standalone line, `unit_cost_snapshot` is null
(blank, per Absolute Constraint 5). Because `unit_price` and `amount` are NOT
NULL, they fall back to 0 there, which is the screen's existing behavior when a
product has no cost. This 0 is a structural placeholder for the required columns
only; it is never a fabricated cost, and the auditable cost record
(`unit_cost_snapshot`) stays blank.

### STOP. Paste the raw diff of every changed path, `git status --porcelain`, and
the real typecheck output.

---

## STEP 6 - Read the frozen snapshot; fix the staff display

- Replace the live `products.cost` pull (the `resolveCost` helper in
  `adminVendorOrders.ts`) so cost is read from `order_items.unit_cost_snapshot`.
  Repoint every consumer found in Step 0-B to the stored snapshot.
- In the vendor-order detail screen (`VendorOrderDetail.tsx`): show cost per unit
  from the snapshot, and total = quantity x that snapshot cost, identically for
  both vendor-order types. Collapse the two separate money columns (the old
  editable "Unit" price and the "Cost" reference) into a single staff-only Cost
  column plus a Total column. The grand total is the sum of (snapshot cost x
  quantity).
- Remove the hand-editable unit-price field from BOTH vendor-order screens: the
  "Unit cost" input on `VendorOrderNew.tsx` (removed in Step 4) and the editable
  "Unit" input in `VendorOrderDetail.tsx` edit mode. There is no manual cost or
  price entry anywhere on a vendor order.
- Connected cleanup from removing that field (do not leave dangling references):
  - In the vendor-order edit-save path (`adminVendorOrders.ts`), the removed
    price fed the "changed from original" red-flag comparison and the
    `po_unit_price` PO-only override. Drop unit price from the change-detection
    comparison, since it can no longer differ, and stop writing `po_unit_price`
    from a now-removed field. Do NOT drop the `po_unit_price` column and do NOT
    touch the other overlay fields (`po_sku`, `po_description`, `po_quantity`,
    `po_removed`, `po_edited`); quantity, SKU, and description stay editable on
    the PO exactly as today.
  - For lines ADDED during a vendor-order edit and lines created on the standalone
    screen, write `unit_price` and `amount` per the Step 5 standalone rule (frozen
    cost and cost x quantity), not from any input.
- Where a line has no snapshot (pre-existing lines), the cost cell shows blank.

### STOP. Paste the raw diff of every changed file, `git status --porcelain`, and
the real typecheck output.

---

## STEP 7 - Regression guard: confirm cost stays off the PO and out of every
customer/vendor payload

Read-only verification, no new changes expected:

- Confirm `vendorOrderPdf.tsx` still renders only Item #, Description, and Order
  Qty. No unit price, no cost, no total, no amount column.
- Confirm the PO email path carries no cost.
- Confirm `unit_cost_snapshot` and variant `cost` appear in NO customer-facing
  response and in nothing sent to the vendor.

### STOP. Paste what you checked and the evidence (the relevant code showing no
cost column / no cost field) for each of the three points.

---

## What NOT to touch

- No product visibility flags anywhere.
- Do not add any cost or price to the PO document or the PO email.
- Do not backfill or stamp pre-existing lines. Blank is correct for them.
- Do not re-resolve cost live on any view. Always read the stored snapshot.
- Do not add cost to any customer-facing or vendor-facing payload, PDF, or email.
- Do not use drizzle-kit push-force. Dev only. Never prod. Never ALLOW_PROD.
- Do not start or prepare Phase 3 or Phase 4 (price re-point / price column drop).
- Do not "fix", refactor, or clean up anything else you notice. If something
  looks wrong, note it in your check-in and leave it alone.

## Check-in rules (apply at every STOP)

- Paste RAW diffs and REAL command output, never a prose summary.
- Paste `git status --porcelain` so it is clear exactly which files changed.
- For schema/DB steps, paste the read-only `information_schema` or row-query
  result as proof, not a description of it.
- Do not proceed past a STOP until Karen confirms.
- Do not attempt to screenshot or verify the UI yourself. Karen tests every UI
  change in dev after your check-in.

## What Karen will verify in dev (for your awareness, not your task)

- A hand-built vendor order for a flat product (for example DT03-BASE): the staff
  screen shows the product's cost per unit and total = qty x cost.
- A hand-built vendor order for a grade-priced product (O.W. Lee seating, or a
  tile-top): the grade/finish selector appears, and once chosen the correct
  per-grade cost and total show.
- A customer-order-derived vendor order for the same kinds of products: shows the
  SAME cost per unit and total as the hand-built one, no $0.
- An absolute/size-priced variant with the new variant Cost set: its cost flows
  through to the vendor order.
- The printed and emailed PO: still shows only Item #, Description, Qty. No cost
  anywhere.
- A pre-existing order/vendor order: cost cell is blank (expected, no snapshot).
