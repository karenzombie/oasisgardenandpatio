---
name: Vendor order edit — po_* overlay model
description: How pending vendor-PO edits are isolated from the customer order, and the shared-row limitation.
---

# Vendor order edit (Step 1) — isolation via overlay

Pending vendor POs are edited in an audited edit mode that NEVER mutates the original
customer order. Edits live as `po_*` overlay columns on `order_items`
(po_edited/po_removed/po_sku/po_description/po_sub_description/po_quantity/po_unit_price)
plus a `vendor_order_edits` audit table (one row per save, mandatory change note).
Effective value = `po_x ?? original_x`. Added lines are fresh `order_items` with
`orderId = null`.

**Why:** the customer order and the vendor PO must diverge without corrupting each other;
staff need an auditable trail of who changed a PO and why.

**How to apply:**
- All pending-PO mutations must go through `POST /admin/vendor-orders/:id/edit` (txn +
  FOR UPDATE, pending-only). The legacy `PATCH /admin/vendor-orders/:id` now rejects
  pending POs (409) precisely so the change-note requirement can't be bypassed.
- The printed/sent vendor PO must NOT show cost or any pricing (unit/total/order-total).
  Cost is staff-UI only. This overrode a contradictory written brief that asked for cost
  on the PO — confirm with the user before ever putting pricing back on the PO.

**Known limitation (not solved in Step 1):** `po_edited`/`po_removed` are on the shared
`order_items` row, not scoped per-PO. If one row belongs to BOTH a product PO
(`vendor_order_id`) and a fabric PO (`fabric_vendor_order_id`), editing/removing it in one
PO affects the other PO's view. Fixing requires PO-scoped overlay semantics.
