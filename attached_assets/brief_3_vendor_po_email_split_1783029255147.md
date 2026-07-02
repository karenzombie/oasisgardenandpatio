# Agent Brief 3 of 5 -- Vendor PO Email Split
Oasis Garden and Patio | From: Karen / Claude | July 2026

This brief covers splitting the existing vendor cancellation/revision email into two fully separate email templates with distinct triggers. It also documents the correct trigger for each.

---

## IMPORTANT RULES FOR THIS BRIEF

- CRITICAL: Do NOT modify sendVendorOrderEmail under any circumstances. That function was already updated in Brief 1 (item 9). Do not touch it again here.
- The two new templates in this brief must be completely independent of each other with no shared conditional logic between them.
- No pricing must appear on any vendor document. This is a hard rule.
- Check in with Karen after completing this brief before proceeding to Brief 4.

---

## Background

The current sendVendorOrderCancellationEmail function handles both full cancellations and partial cancellations/revisions using a single template with conditional blocks. This is being replaced with two completely separate email templates because:

1. A full cancellation and a revised PO are fundamentally different communications.
2. A revised PO can be triggered by many scenarios beyond item cancellations: quantity changes, finish corrections, address corrections, item additions, item reductions. None of these should use cancellation language.
3. Using a single template with conditionals risks the wrong language appearing in the wrong context.

---

## Template 1 -- Full Cancellation Email

### Function name
`sendVendorOrderCancellationEmail`

Note: The old combined cancellation/revision function used this same name. Replace its body in place with the new implementation below. Do not rename the function -- existing call sites that trigger full cancellations will continue to work without changes.

### Trigger
Fires when an entire vendor PO is cancelled with no remaining items. Staff initiates this action from the vendor order detail in the staff portal.

### Subject
`CANCELLED: Purchase Order ${vendorOrderNumber} -- Oasis Garden & Patio`

### Email title (passed to emailLayout)
`Purchase Order ${vendorOrderNumber} -- CANCELLED`

### Title color
Red (#b91c1c) -- existing behavior, keep as-is

### Body

```
Please be advised that the following purchase order has been cancelled in full. Please do not ship these items.

PO number: [vendorOrderNumber]
Vendor: [manufacturerName] (if present)

[Cancellation reason box if reason is provided -- existing red-bordered box style, keep as-is]

CANCELLED ITEMS ([count])
[Table: SKU / Description / Qty -- all rows struck through with color #888]

A copy of the cancelled purchase order is attached for your records.

Please reply to this email to confirm the cancellation, or reach us at (661) 255-9909 or sales@oasisgardenandpatio.com with any questions.
```

Implementation notes:
- "Please do not ship these items" must appear in the intro paragraph only
- Attachment filename: `PO-${vendorOrderNumber}-CANCELLED.pdf`
- No "remaining items" section -- this is a full cancellation, nothing remains
- No pricing on any line items -- hard rule

---

## Template 2 -- Revised PO Email

### Function name
`sendVendorOrderRevisionEmail`

### Trigger
Fires whenever a vendor PO is edited and resent by staff. This covers ALL of the following scenarios:
- Quantity changes (increase or decrease)
- Finish or fabric corrections
- Ship-to address corrections
- Item additions
- Item reductions (partial -- note: if ALL items are removed, use the Full Cancellation email instead)
- Any other modification to an existing PO

This email must contain NO cancellation language, NO struck-through rows, and NO "do not ship" warning under any circumstances.

### Subject
`REVISED: Purchase Order ${vendorOrderNumber} -- Oasis Garden & Patio`

### Email title (passed to emailLayout)
`Purchase Order ${vendorOrderNumber} -- Revised`

### Title color
Navy (#1a3c5e) -- standard color, not red

### Body

```
A revised purchase order is attached. Please review it in full as changes have been made, and confirm receipt at your earliest convenience.

PO number: [vendorOrderNumber]
Vendor: [manufacturerName] (if present)

[Table: SKU / Description / Qty -- all rows normal, no strikethrough]

Please reply to this email to confirm receipt of the revised PO, or reach us at (661) 255-9909 or sales@oasisgardenandpatio.com with any questions.
```

Implementation notes:
- No struck-through rows
- No cancellation reason box
- No "do not ship" language anywhere in this template
- No "remaining items" vs "cancelled items" sections -- just a clean SKU/Description/Qty table of the full revised PO contents
- Attachment filename: `PO-${vendorOrderNumber}-REVISED.pdf`
- No pricing on any line items -- hard rule

---

## Cleanup

Once both new templates are confirmed working:
- The old sendVendorOrderCancellationEmail function with its full/partial conditional logic can be removed from the codebase
- Confirm with Karen before removing

---

| Check in with Karen after completing both templates and confirming triggers are correctly wired. Do not proceed to Brief 4 until Karen gives the go-ahead. |
