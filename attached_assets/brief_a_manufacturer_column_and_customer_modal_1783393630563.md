# Brief A: Manufacturer Column and Customer Modal Read-Only Logic

For: Replit Agent
From: Karen / Claude
Date: July 2026

> IMPORTANT: Do not make any assumptions during this build. If anything is unclear, stop and ask Karen before proceeding.

---

## Overview

This brief covers two separate but related improvements to the staff portal:

1. Add a Manufacturer column to all staff portal product tables.
2. Apply read-only logic to the customer modal based on how the customer record was created.

---

## Part 1 -- Manufacturer column on staff portal product tables

### Background

Product tables throughout the staff portal currently do not show which manufacturer a product belongs to. This column needs to be added consistently across all screens where products appear in a table or list.

### Scope -- screens to update

Add a Manufacturer column to every product table on the following screens:

- Order detail page (the line items table within an order)
- Order print layout (the printed/PDF version of an order)
- Wishlist detail page (the line items table within a wishlist)
- Wishlist print layout (the printed/PDF version of a wishlist)
- Product picker (the modal or screen staff use to search and select products when building an order)

### Column behavior

- The column label is "Manufacturer".
- The value displayed is the manufacturer name (not the slug).
- The manufacturer name is pulled by joining to the manufacturers table via the product's `manufacturer_id`. Do not assume a `manufacturer_name` column exists directly on the products table -- confirm the join path before writing any query.
- The column should be read-only everywhere it appears. It is display only.

### Placement

- On the order and wishlist detail pages, place the Manufacturer column immediately after the Product Name column.
- On the order and wishlist print layouts, place it in the same position so the printed output matches the on-screen layout.
- On the product picker, place it after the Product Name column. If the picker has limited horizontal space, it is acceptable to show the manufacturer name as a secondary line of muted text beneath the product name rather than a separate column -- use whichever approach fits the existing layout without breaking it.

### Check-in

Update one screen at a time. After each screen is updated, check in with Karen with a preview before moving to the next screen. Do not update all five and check in at the end.

---

## Part 2 -- Customer modal read-only logic

### Background

The staff portal has a customer modal that displays customer record details. Staff can currently edit fields in this modal regardless of how the customer account was created. This needs to change.

There are two ways a customer record can exist in the system:

1. Created by staff directly in the admin portal (staff-created).
2. Created by the customer themselves via the storefront (self-created via Clerk).

Staff-created records should remain fully editable by staff. Self-created records should be read-only in the staff modal -- staff should not be able to overwrite data that the customer manages themselves through their own account.

### How to determine record origin

There should already be a way to distinguish between these two record types -- either a column on the customers table (such as `created_by`, `source`, `origin`, or similar), or the presence or absence of a Clerk user ID on the record. Confirm the exact field and its values before writing any logic. Do not assume the field name.

If no such field currently exists, stop and ask Karen before proceeding. Do not invent a new field without confirmation.

### Read-only behavior for self-created records

When a staff user opens the customer modal for a self-created (storefront/Clerk) customer record:

- All editable fields in the modal become read-only. Display the values as plain text, not as inputs.
- No Save or Update button is shown.
- Display a clearly visible notice near the top of the modal that reads: "This customer manages their own account. Contact details can only be updated by the customer."
- Staff can still view all data in the modal -- nothing is hidden.
- The marketing opt-out badge and wishlist data (if present) remain visible and unchanged.

### Editable behavior for staff-created records

When a staff user opens the customer modal for a staff-created record:

- The modal behaves exactly as it does today -- all fields are editable and the Save button is present.
- No notice is shown.
- No changes to the existing edit flow for these records.

### Scope limits

- This change applies only to the customer modal in the staff portal.
- Do not change anything about how customers manage their own accounts on the storefront.
- Do not change the underlying data or schema unless a new origin field is genuinely missing and Karen has confirmed it needs to be added.

### Check-in

After implementing the read-only logic, confirm with Karen by showing:
- A staff-created record open in the modal (should still be fully editable).
- A storefront self-created record open in the modal (should be read-only with the notice visible).

---

## Order of operations

1. Complete Part 1 (manufacturer column) across all five screens. Check in with Karen after each screen -- do not batch all five together.
2. After Karen confirms all five screens are correct, proceed to Part 2 (customer modal read-only logic).
3. Complete the read-only logic and check in with Karen as described above.

---

*End of brief*
