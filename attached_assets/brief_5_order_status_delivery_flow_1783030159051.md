# Agent Brief 5 of 5 -- Order Status and Delivery Flow Overhaul
Oasis Garden and Patio | From: Karen / Claude | July 2026

This is the most complex brief in this series. It covers new order statuses, a redesigned Add Shipment modal, new email templates for delivery notifications, and new shipment-level item and quantity tracking. Read this brief in full before writing any code. If anything is unclear, stop and ask Karen before proceeding.

---

## IMPORTANT RULES FOR THIS BRIEF

- Do not make assumptions. If any requirement below could be interpreted more than one way, stop and ask Karen.
- Build and test one section at a time. Check in with Karen between each section.
- Do not remove or rename the existing "ready_for_delivery" or "out_for_delivery" status values from the database until Karen explicitly confirms it is safe to do so and all dependencies have been checked.
- No pricing must appear on any customer-facing delivery email.
- Check in with Karen after each section below before moving to the next.

---

## Overview of Changes

The current "ready for delivery" and "out for delivery" order statuses are being replaced or supplemented with more specific statuses that eliminate ambiguity between store-delivered and carrier-shipped orders. The Add Shipment modal is being redesigned to support item and quantity assignment per shipment. New email templates are being added for each delivery scenario.

---

## Section 1 -- New and Renamed Order Statuses

### Status 1: "Ready for Store Delivery"

- This status replaces the existing "ready_for_delivery" status for store-delivered orders.
- When staff selects this status, it fires the "Ready for Store Delivery" email (see Section 3A) and saves the status change normally.
- No modal is required beyond the existing optional note field.
- Database value: confirm with Karen what slug to use (e.g. `ready_for_store_delivery`) before writing any migration.

### Status 2: "Carrier Delivery Update"

- This is a new status for orders being shipped via an external carrier (FedEx, UPS, R+L Carriers, Local Delivery, etc.).
- When staff selects this status, the Add Shipment modal (see Section 2) opens automatically before the status change is saved.
- The status change is only saved and the email only fires after the staff member successfully saves a shipment with at least one item assigned and a tracking number entered.
- If staff cancels out of the Add Shipment modal without saving, the status reverts to its previous value. No status change is recorded. No email is sent.
- This status can apply multiple times to the same order. Each time a new shipment is added via the +Add button in the Shipments and Tracking panel (whether or not the status is changing), the Carrier Delivery Update email fires for that shipment. The status does not need to change for subsequent shipments -- only the first shipment triggers the status change.
- Database value: confirm with Karen what slug to use (e.g. `carrier_delivery_update`) before writing any migration.

### Status 3: "Out for Local Delivery"

- This status is for store-delivered orders that are actively out for delivery on the day of delivery.
- It applies only to store deliveries, never to carrier-shipped orders.
- When staff selects this status, it fires the "Out for Local Delivery" email (see Section 3C).
- The email pulls Scheduled Delivery Date and Scheduled Delivery Time from the order record (see Section 2B for how these fields are added).
- Database value: confirm with Karen what slug to use (e.g. `out_for_local_delivery`) before writing any migration.

### Existing statuses to keep unchanged
- pending
- confirmed
- in_production
- delivered
- completed
- canceled
- refunded

### Before writing any migration
Report to Karen the exact current database values for "ready_for_delivery" and "out_for_delivery" and confirm whether any existing orders are using those statuses before making any changes.

---

## Section 2 -- Add Shipment Modal Redesign

### 2A -- Item and Quantity Assignment

The Add Shipment modal currently collects: Carrier, Tracking Number, Shipped At, Delivered At, and Notes.

The following changes must be made to the modal:

#### Remove these fields
- Shipped At (date/time)
- Delivered At (date/time)

These fields are being removed from the modal and from the shipment record entirely. Confirm there are no other parts of the codebase reading these fields before removing them from the database schema. Report to Karen before dropping any columns.

#### Add these fields (for carrier shipments only)
The modal must display a list of all line items on the order with their quantities. For each line item, staff must be able to enter how many units of that item are included in this shipment.

Rules:
- Each line item shows: product name, variant/finish/fabric if applicable, total quantity on order, and quantity already assigned to previous shipments
- The quantity field for this shipment defaults to the remaining unassigned quantity for that item (total ordered minus already assigned to other shipments)
- Staff can adjust the quantity down but cannot enter more than the remaining unassigned quantity
- At least one item must have a quantity greater than zero before the shipment can be saved
- Tracking number is required before the shipment can be saved
- Carrier is required before the shipment can be saved

#### Data to store per shipment
Each shipment record must store:
- Carrier
- Tracking number
- Notes (optional, internal only)
- A list of assigned items: each item reference (order item ID) and the quantity assigned to this shipment

#### Remaining quantity tracking
The system must track, for each order line item, how many units have been assigned to a shipment and how many remain unassigned. This is used to:
1. Pre-fill the quantity field in the Add Shipment modal for subsequent shipments
2. Determine whether to include a "Items still to be shipped" section in the carrier delivery email (see Section 3B)

### 2B -- Scheduled Delivery Fields (for store deliveries)

Add two new fields to the order detail panel. These fields must be visible on ALL orders regardless of delivery method -- staff will fill them in only when relevant for store deliveries:

- Scheduled Delivery Date (date picker)
- Scheduled Delivery Time (time picker or free-text field)

Place these fields in the Delivery Method section of the order detail panel, directly below the existing Delivery Method free-text field.

These fields are used by the "Out for Local Delivery" email (Section 3C) to tell the customer when to expect their delivery. They are optional -- if left blank they have no effect on any other part of the system.

These fields should be stored on the order record. Confirm the best column names with Karen before writing any migration.

---

## Section 3 -- New and Updated Email Templates

### 3A -- Ready for Store Delivery Email

#### Trigger
Fires when staff moves an order to "Ready for Store Delivery" status.

#### Subject
`Your order is ready for delivery! (${orderNumber})`

#### Email title
`Your order is ready for delivery`

#### Body

```
Hi [name],

Great news! Your order is complete and ready for delivery. We will be in touch shortly to schedule a delivery date and time that works for you.

If you have a preferred time window or any special instructions, feel free to reply to this email or call us at (661) 255-9909.

We can't wait for you to enjoy your new pieces!

Warm regards,
The Oasis Garden & Patio Team
```

---

### 3B -- Carrier Delivery Update Email

#### Trigger
Fires every time a shipment is successfully saved in the Add Shipment modal, whether triggered by:
- Staff selecting "Carrier Delivery Update" status for the first time (status change + shipment save), or
- Staff clicking +Add in the Shipments and Tracking panel on an order already in "Carrier Delivery Update" status (no status change, just a new shipment added)

This means one order can generate multiple Carrier Delivery Update emails -- one per shipment added.

#### Subject
`Your order is on its way! (${orderNumber})`

#### Email title
`Your order is on its way`

#### Body

The body must be built dynamically based on the shipment data just saved and the remaining unassigned item quantities.

```
Hi [name],

Great news! Your order is on its way. Your shipment details are below.

Carrier: [carrierName]
Tracking number: [trackingNumber -- hyperlinked using the carrier's tracking URL template from the carriers table]

Items in this shipment:
[Render as HTML <ul><li> list. For each item assigned to this shipment:]
- [Product name][variant/finish/fabric if applicable] -- Qty [quantity]

[If any order line items have remaining unassigned quantity after this shipment:]
Items still to be shipped:
[Render as HTML <ul><li> list. For each item with remaining unassigned quantity:]
- [Product name][variant/finish/fabric if applicable] -- Qty [remaining quantity]

[If all items are fully assigned -- omit the "Items still to be shipped" section entirely]

If you have any questions, feel free to reply to this email or call us at (661) 255-9909.

We can't wait for you to enjoy your new pieces!

Warm regards,
The Oasis Garden & Patio Team
```

Implementation notes:
- The tracking number must be a hyperlink when the carrier has a tracking_url_template in the carriers table. Substitute the tracking number into the {trackingNumber} placeholder to build the URL. This already exists in the carriers table.
- IMPORTANT: Some carriers (e.g. Local Delivery, id 6) have no tracking_url_template (value is null). If the carrier has no tracking URL template, display the tracking number as plain unlinked text rather than a hyperlink. Never attempt to build a link from a null template. The email must render correctly regardless of which carrier is selected.
- The "Items still to be shipped" section must only appear if at least one order line item has remaining unassigned quantity after this shipment is saved. If all items are fully covered, omit this section entirely.
- No pricing on any line items.
- Add-on items (e.g. Marella privacy walls) should be listed as sub-items under their parent line item if applicable.

---

### 3C -- Out for Local Delivery Email

#### Trigger
Fires when staff moves an order to "Out for Local Delivery" status.

#### Subject
`Your order is out for delivery! (${orderNumber})`

#### Email title
`Your order is out for delivery`

#### Body

```
Hi [name],

Great news! Your order is out for delivery today and is scheduled to arrive between [scheduledDeliveryTime].

Please ensure someone is available at your delivery address to receive it. If you have any last minute questions or need to reach us urgently, please reply to this email or call us at (661) 255-9909.

We can't wait for you to enjoy your new pieces!

Warm regards,
The Oasis Garden & Patio Team
```

Implementation notes:
- [scheduledDeliveryTime] is pulled from the Scheduled Delivery Time field added to the order record in Section 2B
- If no Scheduled Delivery Time has been entered on the order, omit that phrase and use: "Your order is out for delivery today."
- [scheduledDeliveryDate] is not included in the email body -- the email firing on the day of delivery implies the date

---

## Section 4 -- Check In Points

This brief must be completed in the following order. Stop and check in with Karen after each step:

1. Report current database values for existing delivery-related statuses and confirm no orders are using them before any migration
2. Report the existing shipment data model (what columns currently exist on the shipments table) so Karen can confirm what is safe to remove and add
3. Build the Add Shipment modal redesign (item/quantity assignment, remove shipped at/delivered at fields, add scheduled delivery fields)
4. Confirm with Karen that the modal works correctly before proceeding
5. Add the new order statuses
6. Wire the "Carrier Delivery Update" status to auto-open the Add Shipment modal
7. Confirm status change and modal cancel behavior works correctly before proceeding
8. Build the three new email templates
9. Wire email triggers to their correct events
10. Full end-to-end test of all three delivery scenarios and report results to Karen

---

| Do not batch multiple steps. Complete one step, check in with Karen, then proceed. This brief touches core order management and customer communication -- a wrong assumption here could affect real customer orders at launch. |
