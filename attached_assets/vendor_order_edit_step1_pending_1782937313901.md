# Vendor order edit — Step 1: pending (unsent) orders

For: Replit Agent
From: Karen / Claude
Date: July 2026

> IMPORTANT: Do not make any assumptions during this build. If anything is unclear, ambiguous, or could be interpreted more than one way, stop and ask Karen before proceeding.

---

## Overview

This brief covers the first step of a two-part build. Right now vendor orders have no edit capability — fields on a pending order are either open text inputs with no audit trail, or the items table is completely read-only. This step introduces a proper edit mode for vendor orders that have NOT yet been sent to the vendor, with mandatory change logging.

Step 2 (sent orders) will follow after Karen confirms this step is working correctly. Do not start Step 2 until instructed.

---

## What to build

### New "Edit order" button

Add an "Edit order" button to the Actions sidebar on the vendor order detail screen. It should sit below the "Send to vendor" button.

This button only appears when the order status is pending (not yet sent). Sent orders are handled in Step 2.

### Edit mode

When staff clicks "Edit order", the entire order enters edit mode. The following must all become editable simultaneously — this is a single unified edit mode, not per-section editing:

**Items table:**
- SKU field — editable text input per row
- Description field — editable text input per row
- Sub-description/variant field (the smaller muted line below the description, e.g. "5'3" x 7'4"") — editable text input per row
- Quantity — editable number input per row
- Unit price — editable number input per row
- Cost column — read-only, always. Staff can see the cost value but cannot edit it. Cost comes from the product record. If there is no cost data for a line item, display "no data" in muted italic text — do not block or disable anything.
- A delete (trash) icon appears on each row to remove that line item entirely
- An "Add line item" button appears below the table to add a new blank row

**Vendor order details section:**
- Vendor ETA — editable
- Note to vendor — editable
- Notes (internal) — editable

### Visual treatment in edit mode

- A blue information banner appears at the top of the main content area (not the sidebar) reading: "Edit mode — all changes require a note before saving."
- All editable fields switch to a visually distinct input style (e.g. light blue background, blue border) so staff can clearly see what is active and editable vs. read-only.
- "Send to vendor" in the Actions sidebar becomes disabled (greyed out) while edit mode is active. Staff must either save or cancel before sending.
- "Edit order" button in the sidebar is hidden while edit mode is active.

### Cancel button

A "Cancel" button appears at the bottom of the vendor order details card while in edit mode. Clicking it discards all unsaved changes and returns the order to view mode. No confirmation prompt needed — edits are not persisted until saved.

### Change note requirement

The moment a staff user modifies anything (any field, any item row, adding a row, deleting a row), a required change note box slides into view above the Save button at the bottom of the vendor order details card. It must include:

- A label: "Why are you making this change? (required)"
- A subline in smaller muted text: "Logged with your name and a timestamp."
- A textarea for the staff user to type their note
- An inline validation message below the textarea that appears if staff tries to save without filling it in: "A change note is required before saving."

The "Save changes" button must remain disabled until the change note textarea contains at least one character of non-whitespace text.

### Save behavior

When staff clicks "Save changes" and the change note is filled in:

- All edits are persisted to the vendor order
- The change note is logged to the order's edit history with: timestamp, staff user name/ID, and the full text of the note
- The order returns to view mode
- The edit history / send history section at the bottom of the order detail screen must display this logged entry. Use a consistent format with the existing send history entries so the two types of events sit naturally in the same timeline.

### PO document — pricing rules

When the PO document is generated (for Print PO or Send to vendor), the following pricing rules apply:

- Display the cost value per line item if cost data exists for that product
- Do NOT display unit price, sale price, or any customer-facing pricing on the PO document under any circumstances
- If no cost data exists for a line item, simply omit that field from the PO for that line — do not show a blank, a zero, or an error. The rest of the PO generates normally.
- These rules apply to all PO generation, not just after an edit.

---

## What must not change

- The vendor order status progression (pending, sent, acknowledged, fulfilled, received, cancelled) — no changes to this logic
- The existing send history display — extend it, do not replace it
- The "Print PO" action — pricing rules above apply here too, but no other changes to this button
- The customer order link and timeline display in the right sidebar
- Any other part of the admin portal outside the vendor order detail screen

---

## Check in with Karen

After completing this step, show Karen the result before starting anything else. Do not proceed to Step 2 until Karen confirms this is working correctly.
