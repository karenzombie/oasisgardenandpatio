# Vendor order edit — Step 2: sent orders and resend button clarity

For: Replit Agent
From: Karen / Claude
Date: July 2026

> IMPORTANT: Do not make any assumptions during this build. If anything is unclear, ambiguous, or could be interpreted more than one way, stop and ask Karen before proceeding.
> This step builds on Step 1. Do not start this step until Karen has confirmed Step 1 is complete and working.

---

## Overview

This step covers two things:

1. Editing a vendor order that has already been sent to the vendor
2. Clarifying the Actions sidebar so staff can clearly distinguish between "resend with no changes" and "edit and resend with corrections"

---

## Part A — Edit mode for sent orders

### New "Edit order" button (sent orders)

Add an "Edit order" button to the Actions sidebar on sent vendor orders. This is the same button introduced in Step 1 but now also appears on orders with sent status.

Position it in the Actions sidebar directly below "Resend (no changes)" (see Part B for the rename). The button should be visually distinct enough that it does not get confused with the resend button — use a secondary/outline style rather than a filled button.

### Edit mode behavior

Edit mode for a sent order works identically to Step 1 (same editable fields, same blue banner, same change note requirement, same cancel behavior). The only differences are at the point of saving.

### Save behavior — sent orders

When staff clicks "Save changes" on a sent order and the change note is filled in, do NOT save and close immediately. Instead, display an inline prompt directly below the change note box (within the same card, not a modal) with the following:

- A heading: "This order was already sent to the vendor."
- A subline: "Choose how to proceed:"
- Two clearly separated options:

**Option A — Resend to vendor**

A filled/prominent button labeled "Save and resend to vendor".

Clicking this:
1. Saves all edits
2. Logs the change note to edit history (timestamp, staff user, note text)
3. Opens the vendor email confirmation prompt (same flow as the existing "Send to vendor" — defaults to the vendor email address on file, staff can edit it before confirming)
4. After email is confirmed, presents the PO correction note option: a checkbox labeled "Include a correction note at the top of the PO" with a tooltip/subline hint reading: 'Example: "Updated PO, disregard previously sent PO"'. When checked, a text entry field appears. If the checkbox is checked but the field is left empty, block the resend with a validation message.
5. Sends the updated PO to the vendor
6. Logs the resend event to edit history/send history with: timestamp, staff user, whether a PO correction note was included, and if so the full text of that note
7. Returns the order to view mode

**Option B — Save without resending**

A secondary/outline button labeled "Save without resending".

Clicking this:
1. Saves all edits
2. Logs the change note to edit history (timestamp, staff user, note text, and a note that no resend was performed)
3. Returns the order to view mode
4. Does NOT contact the vendor

Both options must be clearly labeled. Staff should be able to read them and immediately understand which is which without having to think about it.

---

## Part B — Resend button rename and sidebar clarity

The existing "Resend to vendor" button on sent orders must be renamed and given supporting subline text so it is clearly distinguished from the new "Edit order" path.

### Rename

Change "Resend to vendor" to: **"Resend (no changes)"**

### Add subline text

Directly below the button label, add a short muted subline in smaller text:
"Vendor didn't receive it? Resend the original PO as-is."

### "Edit order" button subline

Similarly, add a subline beneath the "Edit order" button:
"Need to correct something? Edit the order and resend an updated PO."

### Actions sidebar order for sent orders

The full Actions sidebar for a sent order should read top to bottom:

1. Print PO
2. Resend (no changes) — with subline
3. Edit order — with subline
4. Mark acknowledged
5. Mark fulfilled
6. Mark received
7. Cancel vendor order

### "Resend (no changes)" behavior — no change

The "Resend (no changes)" button flow stays exactly as it currently works: clicking it triggers the vendor email confirmation prompt (defaults to vendor email on file, editable), then resends the original PO without any edits. No change note is required for this path since nothing is being changed. The resend event should continue to be logged in send history as it is today.

---

## Edit history display

All events across both steps must appear in a unified chronological timeline at the bottom of the vendor order detail screen, alongside the existing send history. Each entry should display:

- Event type (e.g. "Edited", "Sent", "Resent", "Resent with correction note")
- Staff user name
- Timestamp
- Change note text (for edit events)
- PO correction note text if one was included (for resend events)

Use a consistent visual format for all entry types so the timeline is easy to scan.

---

## PO document — pricing rules (reminder)

As established in Step 1, these rules apply to all PO generation including resends:

- Show cost per line item if available
- Do not show unit price, sale price, or any customer-facing pricing
- If no cost data exists for a line item, omit that field silently — no blank, no zero, no error

---

## What must not change

- The vendor order status progression
- Any behavior of the "Resend (no changes)" button beyond the rename and subline addition
- The customer order link and timeline in the right sidebar
- Any other part of the admin portal outside the vendor order detail screen

---

## Check in with Karen

After completing this step, show Karen the result before starting anything else.
