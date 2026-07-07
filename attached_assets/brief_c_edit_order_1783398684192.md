# Brief C: Edit Order -- Staff-Created Orders

For: Replit Agent
From: Karen / Claude
Date: July 2026

> IMPORTANT: Do not make any assumptions during this build. If anything is unclear, stop and ask Karen before proceeding.

---

## Overview

Staff users need the ability to edit the line items on an order after it has been created. Currently, once an order is saved there is no way to add, remove, or modify items. This brief adds inline editing to the order detail page for eligible orders only.

---

## Background -- why this is needed

The primary use case is an in-store scenario: a staff user builds and saves an order, then the customer decides to add another item before leaving. Without edit capability, the staff user has to create a second separate order, which is bad workflow. The fix is to allow edits directly on the existing order detail page.

---

## Eligibility -- which orders can be edited

Only staff-created orders may be edited. Online customer orders are locked and must never be editable via this feature.

Before writing any logic, confirm the exact field and values used to distinguish order origin. It is likely something like `order_type`, `source`, `created_by`, or a similar column. Do not assume the field name -- look it up in the schema, report the field name and its possible values to Karen, and stop. Do not write any eligibility logic until Karen has reviewed and confirmed the correct field and values.

**Staff-created orders:** Edit Order button is shown and functional.

**Online customer orders:** Edit Order button is not shown at all. No indication is needed -- the button simply does not appear. These orders are placed by customers via the storefront and will eventually be processed through the Authorize.net payment API. They must not be modified by staff.

Note for context: staff-created orders are paid at the store's physical POS and are never processed through the payment API. This is the clearest practical distinction between the two order types.

---

## UI -- Edit Order button placement

Place an "Edit Order" button on the order detail page, right-aligned within the Items section header, opposite the "Items" label and approximately above the Amount column.

- Label: "Edit Order"
- Style: match the existing secondary button style used elsewhere in the admin portal. Do not introduce new styles.
- Only render this button when the order is eligible (staff-created). For ineligible orders, render nothing in that position.

---

## Edit mode behavior

When a staff user clicks Edit Order, the Items section switches to edit mode inline on the same page. Do not navigate away or reopen the order builder screen.

### What becomes editable in edit mode

- **Quantity** on each existing line item -- editable numeric input
- **Remove line** -- each existing line item gets a remove/delete control
- **Add item** -- a product lookup input appears at the bottom of the items list. This must reuse the existing product search/lookup component already used on the initial order creation screen. Do not build a new lookup from scratch. If the selected product has fabric, finish, or other configurable options, those selection controls must appear inline before the item is added to the order, using the same selection flow as the original order builder. A product with required options cannot be added to the order without those selections being made.

### What does not change in edit mode

- Customer assignment
- Order type or source
- Status
- Shipping, tax, delivery fields
- Payment records
- Any field outside the Items section

### Saving edits

- A "Save Changes" button and a "Cancel" button appear while in edit mode.
- "Save Changes" commits all item additions, removals, and quantity changes in a single operation and returns the Items section to read-only view. Order totals (subtotal, total, balance due) must recalculate immediately on save to reflect the updated line items.
- "Cancel" discards all unsaved changes and returns the Items section to read-only view with no modifications applied.
- If the staff user navigates away with unsaved changes, show a confirmation prompt before leaving.

### Empty order guard

If the staff user removes all line items and attempts to save, block the save and show an inline error: "An order must have at least one item." Do not allow saving an order with zero line items.

---

## Check-in

After implementation, check in with Karen showing:

1. A staff-created order with the Edit Order button visible and functional -- demonstrate adding a line item, changing a quantity, removing a line item, and confirming totals recalculate correctly after save.
2. An online customer order open on the same page -- confirm the Edit Order button does not appear.

Do not close this brief until Karen has confirmed both scenarios.

---

## Scope limits

- This change applies only to the order detail page in the staff portal.
- Do not modify the order creation flow, the product lookup component itself, or any other screen.
- Do not touch payment logic, Authorize.net integration, or any checkout flow.
- Do not change how online customer orders are displayed or processed in any way.

---

*End of brief*
