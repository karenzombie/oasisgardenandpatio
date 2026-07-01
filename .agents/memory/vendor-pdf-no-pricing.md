---
name: Vendor PDF no-pricing rule
description: Client hard-rule that vendor-facing PDFs must never show pricing, plus a known gap in the cancellation document.
---

# Vendor PDF must never show pricing

**Rule:** The printed/emailed vendor Purchase Order (`VendorOrderDocument` /
`generateVendorOrderPdf` in `vendorOrderPdf.tsx`) must show **SKU / description /
quantity only — NEVER any pricing of any kind**. Cost-per-line shows ONLY on the
staff portal UI.

**Why:** Client (Karen) re-confirmed this as a hard rule multiple times. Vendors
must not see Oasis's line costs on the PO they receive.

**How to apply:** When touching vendor PDF code, never add unit price / total /
`fmtMoney` to `VendorOrderDocument`. The main PO already complies.

## Known gap (pending client decision — do NOT fix unprompted)

`VendorOrderCancellationDocument` still renders pricing via the shared
`ItemsTable` (Unit Price / Total / `fmtMoney`). This is a *different*,
pre-existing vendor-facing document. Whether cancellation notices should also be
price-free is a separate policy call — it may be intentional for credit/refund
reconciliation. Surface to the client; never strip it silently.
