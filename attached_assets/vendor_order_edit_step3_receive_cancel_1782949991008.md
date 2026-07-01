# Vendor order actions — Step 3: partial receive, remove fulfilled, cancel pending

For: Replit Agent
From: Karen / Claude
Date: July 2026

> IMPORTANT: Do not make any assumptions during this build. If anything is unclear, ambiguous, or could be interpreted more than one way, stop and ask Karen before proceeding.
> This step is independent of Steps 1 and 2 but should not be started until Karen gives the go-ahead.

---

## Overview

This step covers three changes to vendor order actions:

1. Remove "Mark fulfilled" entirely
2. Replace the single-click "Mark received" with a partial receive flow
3. Add a cancel option for pending (unsent) vendor orders

---

## Part A — Remove "Mark fulfilled"

Remove the "Mark fulfilled" button from the Actions sidebar on all vendor orders regardless of status.

- Remove from the UI only
- If there is a `fulfilled` status or `fulfilled_at` timestamp in the database, do not remove those columns -- just stop exposing the button. Flag to Karen if any other part of the system reads or writes the fulfilled state before touching anything in the database.
- The Actions sidebar order for sent orders after this change should read:

1. Print PO
2. Resend (no changes)
3. Edit order
4. Mark acknowledged
5. Mark received
6. Cancel vendor order

---

## Part B — Partial receive flow

### Current behavior

Clicking "Mark received" currently marks the entire vendor order as received in one click and updates inventory for all line items at their full ordered quantities.

### New behavior

Clicking "Mark received" must open a modal. Do not auto-receive anything on click -- always open the modal first.

### Modal — "Receive items"

The modal should follow the same general visual style as the existing "Cancel vendor order" modal.

**Header:** "Receive items"

**Intro text:** "Enter the quantities you are receiving now. You can do a partial receive if not everything has arrived. The PO stays open until all quantities are fully received."

**Line items table inside the modal:**

Show one row per line item on the vendor order. Columns:

| SKU | Description | Ordered | Previously received | Receiving now |
|---|---|---|---|---|

- SKU and Description: read-only, pulled from the PO line items
- Ordered: read-only, the original ordered quantity
- Previously received: read-only, the cumulative quantity received across all prior partial receives for this line item (0 if this is the first receive event)
- Receiving now: an editable number input, minimum 0, maximum is (Ordered minus Previously received) for that row. Default to the remaining outstanding quantity as a convenience but staff can change it. Do not allow a value that would exceed the remaining outstanding quantity.

**Notes field:**

An optional text field below the table labeled "Notes (optional)" with placeholder text "e.g. Partial shipment received, 1 chair still outstanding". This is for internal reference only, not sent to the vendor.

**Validation:**

- At least one "Receiving now" field must contain a value greater than 0 before the confirm button is enabled.
- If all "Receiving now" values are 0, show an inline message: "Enter a quantity greater than 0 for at least one item."

**Action buttons:**

- "Cancel" -- closes the modal, nothing is saved
- "Confirm receive" -- saves the receive event

### On confirm

- Update inventory quantities for each line item based on the "Receiving now" values entered
- Log a receive event to the order's edit/send history with: timestamp, staff user, a per-item breakdown of quantities received in this event, and the notes field text if provided
- Evaluate the PO status:
  - If all line items are now fully received (Ordered = total Previously received + just received): mark the order status as "received"
  - If any line items still have outstanding quantity remaining: mark the order status as "partially received" (this is a new status -- see note below)
- Return to the order detail view

### New "partially received" status

This requires a new status value in the vendor order status progression. The full progression becomes:

pending → sent → (acknowledged) → partially received → received → cancelled

"Acknowledged" remains optional as it is today. "Partially received" is only applied when at least one receive event has occurred but outstanding quantities remain. It sits between acknowledged and received.

Add "partially received" as a status pill/label wherever order status is displayed (vendor order detail screen, vendor orders list, and anywhere else order status currently appears). Use an amber color treatment to distinguish it from the green "received" status.

The Actions sidebar for a partially received order should show "Mark received" again so staff can continue receiving against the remaining outstanding quantities.

---

## Part C — Cancel for pending (unsent) orders

### Current state

There is currently no cancel option for pending (unsent) vendor orders. The cancel flow that exists today is only surfaced on sent orders and includes vendor notification logic that does not apply to unsent orders.

### New behavior

Add a "Cancel order" button to the Actions sidebar for pending vendor orders. Position it at the bottom of the sidebar, consistent with where "Cancel vendor order" sits on sent orders.

Clicking it opens a modal. The modal follows the same visual structure as the existing "Cancel vendor order" modal but with the following differences:

**Header:** "Cancel order"

**Intro text:** "Choose whether to cancel the entire order or only specific line items. Cancelled items will be un-assigned from this PO so they can be regrouped onto a different vendor order. The cancellation is logged with your name and the time."

Do not include any mention of vendor notification, vendor email, or PO PDF generation -- the vendor has not received this order so none of that applies.

**Cancel scope options (same structure as existing modal):**

- "Cancel entire order" -- all line items are un-assigned and the PO status moves to cancelled
- "Cancel specific items" -- staff selects which line items to remove. The remaining items stay on the PO. Requires at least 2 line items on the order to be available (same logic as existing modal).

**Reason field:**

Optional text field labeled "Reason (optional)" with placeholder "e.g. Customer changed their mind, item no longer needed". For internal reference only.

**Action buttons:**

- "Keep" -- closes the modal, nothing changes
- "Cancel entire order" or "Cancel selected items" depending on which scope option is selected -- executes the cancellation

### On confirm

- Un-assign the relevant line items from the PO
- If cancelling the entire order, move PO status to cancelled
- If cancelling specific items, the PO remains in pending status with the remaining items
- Log the cancellation to order history with: timestamp, staff user, which items were cancelled, and the reason text if provided
- No vendor communication of any kind is triggered

---

## Edit/send history — reminder

All events from all parts of this step (receive events, cancellations) must appear in the unified chronological history at the bottom of the vendor order detail screen, consistent with the format established in Steps 1 and 2.

---

## What must not change

- "Mark acknowledged" behavior -- no changes
- The existing "Cancel vendor order" flow for sent orders -- no changes beyond what is already specified in Steps 1 and 2
- Any other part of the admin portal outside the vendor order detail screen
- Inventory logic outside of what is explicitly described in Part B above

---

## Check in with Karen

After completing this step, show Karen the result before starting anything else.
