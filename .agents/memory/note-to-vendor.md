---
name: Note to Vendor field
description: vendor_orders.note_to_vendor — a customer-visible vendor message, separate from internal notes, printed at top of the PO PDF.
---

# Note to Vendor

`vendor_orders.note_to_vendor` (nullable text) is a message addressed TO the
manufacturer/vendor — distinct from `notes`, which are internal staff notes never
shown to the vendor. Do not conflate the two.

**Behavior:**
- Settable on standalone vendor-order create and editable on any vendor order
  while it is still pending (disabled once the PO reaches a terminal status).
- Auto-generated POs (the `autoGenerateVendorOrders` helper, fired on every
  customer order) default it to `null` — staff add the note afterward.
- Rendered **bold, ALL-CAPS, at the very TOP** of the vendor PO PDF
  (`vendorOrderPdf.tsx`), above the header.

**Producers/consumers to keep in sync** (a missed one drops the field silently):
contract carries `noteToVendor` on the detail entity + create body + update body;
api-server create + PATCH + detail serializer + both PDF call sites; web create
form + detail/edit page.

**Prod:** the `note_to_vendor` column must be added to the prod DB before any
publish/sync (dev was applied via psql; prod handled at publish time per the
readiness audit).
