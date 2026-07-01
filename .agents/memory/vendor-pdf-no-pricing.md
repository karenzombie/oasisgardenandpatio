---
name: Vendor documents no-pricing rule
description: Client hard-rule that NO vendor-facing output (PDF or email) may ever show pricing — SKU/description/qty only.
---

# No pricing on ANY vendor-facing document

**Rule:** Every document that goes to a vendor — the PO PDF, the cancellation
PDF, and the HTML bodies of the PO / cancellation emails (`vendorOrderPdf.tsx`,
`vendorOrderEmail.ts`) — must show **SKU / description / quantity only. NEVER
any pricing, totals, or currency formatting.** Cost-per-line appears ONLY on
the staff portal UI.

**Why:** Client (Karen) hard rule, re-confirmed: "the vendor knows their cost
to us, and there may be times when we don't want that validated on a document
TO them" — applies to emailed, PDF, or any other delivery method.

**How to apply:** When adding or changing any vendor-facing output, never
introduce `fmtMoney`, unit price, or total columns. Item interfaces still carry
`unitPrice`/`amount` as data (callers pass them) — that is fine as long as they
are never rendered. Cushion emails go to customer/admin only, not vendors.
Grep vendor modules for `fmtMoney|Unit|Total|\$` before shipping.
