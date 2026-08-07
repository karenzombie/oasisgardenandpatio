# Addendum 1 to Phase 2 Brief - recon correction + add-on cost scope

This addendum supplements AGENT_BRIEF_phase2_variant_cost_and_freeze.md. The
brief remains in force exactly as written. This document corrects the Step 0
recon and adds one scope item. All Absolute Constraints, STOP gates, and
check-in rules from the brief apply to this work identically.

---

## PART 1 - Step 0 recon corrections (required before proceeding)

Your Step 0-A inventory is incomplete and one claim in it is wrong. Correct
both and re-post the corrected Step 0 before writing any code.

### 1a. Missed file: `artifacts/api-server/src/lib/autoGenerateVendorOrders.ts`

This helper was not in your inventory. It is the bridge that turns staff
orders, including inventory-only staff orders, into vendor orders
automatically. It is called from `adminOrders.ts` (order creation and the PO
regroup path).

What it does, verified in the code: it creates the `vendor_orders` header rows,
then RELINKS the order's existing `order_items` rows to the new vendor order by
setting `vendor_order_id` (and `fabric_vendor_order_id` for fabric POs). It
does NOT insert new `order_items` rows.

Consequence for Step 5: because it reuses lines, the `unit_cost_snapshot`
stamped when the staff/customer order line was created flows through to the
vendor order with no extra work. No freeze logic is needed inside this helper.
But it MUST be listed in the Step 0-A inventory so the footprint is honest, and
Step 6's display work must be confirmed to cover vendor orders produced this
way.

### 1b. Retract the "no inventory path" claim

Your recon stated adminInventory.ts, cart.ts, and lib/db contain no order_items
insert paths, implying inventory-driven vendor orders do not exist. They do
exist: staff orders created as inventory-only auto-create vendor orders through
`autoGenerateVendorOrders.ts` exactly like any other staff-created order. The
correct statement is: the inventory-only path creates no NEW order_items rows
because it relinks existing ones, per 1a.

### STOP. Re-post the corrected Step 0-A inventory including
`autoGenerateVendorOrders.ts` with file and line ranges for the relink
operations. Wait for Karen's confirmation before Step 1.

---

## PART 2 - Scope addition: add-on cost (msrp, sale, cost - no exceptions)

Rule, verbatim from Karen: anything that has an MSRP has a cost. No exceptions.
Add-ons carry MSRP and sale price today but no cost anywhere. That is the same
gap variants had, and it gets the same fix in this phase. Cost values start
blank; real values are entered later. The absence of cost data in the DB today
is NOT a blocker and must not be treated as one. The columns, the staff input
to set them, and the freeze plumbing all go in now.

The add-on pricing surfaces, verified in the schema (`lib/db/src/schema/addons.ts`):

- `product_addon_options`: flat-priced add-ons have `flat_msrp` and
  `flat_sale_price` here.
- `product_addon_grade_prices`: per-grade add-ons have `msrp` and `sale_price`
  per grade row here (mirrors `variant_grade_prices`).
- `order_item_addons`: the add-on order line, with existing snapshots
  (`unit_msrp_snapshot`, `unit_price_snapshot`, `amount`).

### 2a. Schema (fold into Step 1)

Add three additive, nullable numeric(10,2) columns, same pattern as the brief's
Step 1 columns:

- `product_addon_options.flat_cost` - cost for flat-priced add-ons, beside
  `flat_msrp` / `flat_sale_price`.
- `product_addon_grade_prices.cost` - per-grade cost, beside `msrp` /
  `sale_price` (mirrors `variant_grade_prices.cost`).
- `order_item_addons.unit_cost_snapshot` - the add-on's per-unit cost frozen at
  line creation, beside the existing snapshots.

Update the Drizzle schema (`lib/db/src/schema/addons.ts`) to match. Same push
rules as the brief's Step 1: dev only, no push-force, never prod. The Step 1
STOP proof (schema diff, full push output, information_schema query) must cover
these three columns too.

### 2b. Staff input to set add-on cost (fold into Step 2)

Wherever staff currently edit an add-on's flat MSRP / sale price and per-grade
MSRP / sale price (ProductEdit.tsx and the adminProductConfig routes), add a
Cost input beside them, mirroring exactly how the variant cost input is added
in Step 2. Blank stays null. Persist through the same API paths that already
carry the add-on price fields, and regenerate the contract/types.

### 2c. Resolver (fold into Step 3)

Add an add-on cost resolution path alongside the Step 3 helper: for a
per-grade add-on, return the `cost` of the `product_addon_grade_prices` row
matching the line's grade; for a flat add-on, return
`product_addon_options.flat_cost`. Unresolved returns null. Never 0, never
fabricated.

### 2d. Freeze (fold into Step 5)

Add-on order lines are created in exactly one place today: customer checkout
(`checkout.ts`, the `order_item_addons` insert). At that insert, resolve the
add-on's cost with the 2c resolver and store it in
`order_item_addons.unit_cost_snapshot`. Written once, at creation. If your
corrected Step 0 recon finds any other `order_item_addons` insert site, stamp
it there too and list it.

Pre-existing add-on lines have no snapshot and show blank. Do not backfill.

### 2e. Display and regression guard (fold into Steps 6 and 7)

Where the vendor-order detail screen renders add-on sub-rows, show the add-on's
frozen cost from its snapshot the same staff-only way as the parent line, blank
when null. The PO PDF's add-on sub-rows currently show SKU, name, and qty only;
they must still show exactly that after this work. The Step 7 regression guard
extends to `order_item_addons.unit_cost_snapshot`, `flat_cost`, and
`product_addon_grade_prices.cost`: none of them may appear in any
customer-facing response, the PO PDF, or the PO email.

---

## What this addendum does NOT change

- Every Absolute Constraint in the brief stands, including: staff-only cost, no
  manual cost entry anywhere, freeze at creation, blank when unresolved, no
  backfill, no visibility flags, dev only, no Phase 3/4 work.
- The brief's Step ordering and STOP gates stand. The add-on work rides inside
  the existing steps as noted above; it does not add new steps.
- Do not touch cart_item_addons pricing behavior, customer-facing add-on
  pricing, or anything else about how add-ons are sold.
