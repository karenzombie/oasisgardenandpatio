# Brief 07B -- Wishlist Selective Reach-Out and Status History

For: Replit Agent
From: Karen / Claude
Date: July 2026

| IMPORTANT: Do not make any assumptions during this build. If anything is unclear, ambiguous, or could be interpreted more than one way, stop and ask Karen before proceeding. |
|---|

---

## Overview

This brief extends the wishlist feature built in Brief 7 with two improvements:

1. Selective item reach-out -- staff can check one or more items on a wishlist and send a reach-out email covering only those items, rather than the full wishlist every time. Each item tracks its own reach-out history so staff can see at a glance what has already been covered.

2. Status history log on the wishlist detail page -- mirrors the status history section already present on the order detail page, showing a chronological audit trail of wishlist activity including saves, reach-out sends (with which items were included), and opt-out status changes.

---

## Step 1 -- Research and report back (no code yet)

Before writing any code, investigate the following and report back to Karen. Do not proceed past Step 1 until Karen confirms. Stop after completing all seven items below and wait for Karen to sign off before reading or acting on any later steps.

1. How is the `wishlist_outreach_log` table currently structured? Paste the full schema.
2. How does the order detail status history section work? What table or tables does it read from, and what is the schema for those tables? Paste the relevant schema.
3. Is there a shared status history / audit log pattern used elsewhere in the codebase (for orders or other entities) that this wishlist status history should follow? If yes, describe the pattern and how it would apply here.
4. How does the existing "Send Reach-Out Email" button and modal currently work end to end -- what API endpoint does it call, what does it write to `wishlist_outreach_log`, and what does it render in the email? Paste the relevant code or describe it clearly.
5. Confirm the exact column names on `wishlist_items` -- specifically confirm whether the date the item was added is stored as `added_at`, `created_at`, or something else.
6. Based on the `wishlist_outreach_log` schema found in question 1 and the patterns used elsewhere in the codebase, propose a name and schema for the per-item companion table described in Step 2A. Include column names, types, foreign keys, and any indexes you would add.
7. Based on the order status history pattern found in question 2, recommend whether the wishlist status history should reuse or extend that pattern, or require a separate table. Propose the table name and schema if a new table is needed.

---

## Step 2 -- Schema changes

Based on the Step 1 report and Karen's confirmation, make the following schema changes.

### 2A. Per-item reach-out tracking

Create a companion table to `wishlist_outreach_log` that records which specific wishlist items were included in each send event. Follow the same conventions (naming, column types, indexing) used by the existing `wishlist_outreach_log` table and other similar tables in the codebase. Do not invent a new pattern.

The table must support the following queries:
- Given a `wishlist_item` ID, find the most recent send event that included it (for the "Reach-out status" badge and last sent date on the item row).
- Given a `wishlist_outreach_log` entry ID, find all items that were included in that send (for the status history detail).

Propose the table name and schema in the Step 1 report. Karen will confirm before it is created.

### 2B. Status history for wishlists

Investigate whether the existing order status history pattern can be reused or extended for wishlists, or whether a separate `wishlist_status_history` table is needed. Report the recommendation in the Step 1 report. Karen will confirm the approach before anything is created.

The wishlist status history must capture the following event types:

| Event type | Triggered by | Notes |
|---|---|---|
| `item_added` | Customer saves a new item to their wishlist | Record which product was added |
| `reach_out_sent` | Staff sends a reach-out email | Record which items were included, which staff member sent it, and whether a personal note was included (not the note text itself) |
| `opt_out` | Customer opts out of marketing contact | |
| `opt_in` | Customer opts back in to marketing contact | |

Each history entry must record: event type, timestamp, and the staff user ID if the event was staff-triggered (null for customer-triggered events).

---

## Step 3 -- Wishlist detail page UI changes

After Karen confirms the schema from Step 2, update the wishlist detail page.

### 3A. Items table changes

Add the following to the items table on the wishlist detail page:

**Checkbox column (leftmost):**
- One checkbox per item row, plus a select-all checkbox in the table header.
- Note: the checkbox column must only be shown for customers who are OK to contact (`marketing_opt_out = false`). For opted-out customers, hide the checkbox column and the select-all header entirely. See Step 3B for full details on the opted-out state.
- Selecting a row highlights it with a subtle green tint (matching the site green already used in the staff portal for positive states).
- The select-all checkbox in the header behaves as follows: unchecked when none are selected, checked when all are selected, indeterminate when some are selected.

**Added column:**
- Show the date the item was saved to the wishlist (use the column confirmed in Step 1).
- Format: M/D/YYYY, Pacific Time.
- Place this column between SKU and Reach-out status.

**Reach-out status column:**
- Show one of two states per item:
  - Blue "Sent MM/DD/YYYY" badge -- shown when this item has been included in at least one reach-out send. The date shown is the most recent send date for that item.
  - Gray "Not sent" badge -- shown when this item has never been included in a reach-out send.
- Place this column to the right of the Added column.

### 3B. Send Reach-Out Email button changes

- The button must be disabled when no items are checked. Label when disabled: "Send reach-out email (0 selected)".
- When one or more items are checked, the button becomes enabled. Label updates to: "Send reach-out email (N item selected)" or "Send reach-out email (N items selected)" for plural.
- The button must only be enabled for customers with `marketing_opt_out = false`. For opted-out customers, the button remains disabled with the existing "Opted out -- cannot send" label regardless of checkbox state. Do not add checkboxes for opted-out customers -- there is no reason to select items if the email cannot be sent. Hide the checkbox column and select-all header for opted-out customers.
- Below the items table, show a small muted hint line: "Select items to send a reach-out email about specific products." Hide this hint once at least one item is selected.

### 3C. Reach-out email modal changes

The existing modal (To, Subject, Personal note, Preview, Cancel, Send Email) needs the following changes:

- The preview must show only the items that were checked when the button was clicked, not the full wishlist.
- Add a read-only summary line above the preview showing which items are included: "Sending about: [product name 1], [product name 2]" -- truncate with "and N more" if there are more than 3 items.
- No other changes to the modal layout or behavior.

### 3D. Send action changes

When staff clicks "Send Email" in the modal:

- Send the reach-out email with only the selected items in the body. The email template and copy are unchanged from Brief 7 -- only the item list is scoped to the selection.
- Write a new row to `wishlist_outreach_log` as before (one row per send event).
- Write one row to the per-item companion table (from Step 2A) for each item that was included in this send.
- After a successful send, update the "Reach-out status" badge on each sent item to show the new sent date without requiring a full page reload.
- Write a `reach_out_sent` entry to the wishlist status history (Step 2B) recording the items included and the staff user.
- Do not block resends. Staff can send a reach-out about the same item multiple times. Each send is logged and the badge updates to the most recent date.

---

## Step 4 -- Status history section on wishlist detail page

Add a status history section to the wishlist detail page, below the items table and subtotal. Match the visual layout, typography, and styling of the status history section on the order detail page exactly -- use the same component or pattern confirmed in Step 1.

Each entry displays:
- Event description (see table below)
- Timestamp (Pacific Time, same format as order status history)
- Triggered by: staff email address for staff-triggered events, "Customer" for customer-triggered events

| Event type | Display text |
|---|---|
| `item_added` | "[Product name] added to wishlist" |
| `reach_out_sent` | "Reach-out email sent (N item)" for exactly 1 item, "Reach-out email sent (N items)" for 2 or more, followed by a colon and the product names: "[product name 1], [product name 2]..." -- truncate at 3 with "and N more" |
| `opt_out` | "Customer opted out of marketing contact" |
| `opt_in` | "Customer opted back in to marketing contact" |

The status history section is read-only. No editing or deletion.

Show entries in reverse chronological order (most recent first), matching the order detail page behavior.

---

## Step 5 -- Backfill existing reach-out log entries

Existing rows in `wishlist_outreach_log` were written before per-item tracking existed. They cover the full wishlist at the time of send.

For each existing log entry, write a backfill migration that creates a per-item companion row for every item that existed on the wishlist at the time of the send (use the `added_at` / `created_at` timestamp on `wishlist_items` to determine which items existed at the time of the send -- include any item where the add date is on or before the send timestamp).

Also backfill `item_added` status history entries for all existing `wishlist_items` rows, using their `added_at` / `created_at` timestamp as the event timestamp and null for `staff_user_id` (customer-triggered).

Run the backfill as a dry run first and report the row counts to Karen before committing.

---

## Check-in gates

| Gate | Condition |
|---|---|
| After Step 1 | Agent reports all seven lookups and schema recommendations. Karen confirms before any code is written. |
| After Step 2 | Karen reviews proposed schema and confirms before any migrations run. |
| After Step 3 | Karen logs in and reviews the updated wishlist detail page -- checkboxes, badges, button states, modal preview scoping -- before Step 4 begins. |
| After Step 4 | Karen reviews the status history section before Step 5 begins. |
| After Step 5 dry run | Agent reports backfill row counts. Karen confirms before committing. |

---

## What must not change

- The existing reach-out email template and copy from Brief 7.
- The wishlist disclosure email (Step 4 of Brief 7) -- that fires on first save and is not affected by this brief.
- The `wishlist_outreach_log` table structure -- only add to it, do not alter existing columns.
- Any other part of the wishlist detail page not explicitly mentioned in this brief.
- Any other part of the staff portal not mentioned in this brief.
