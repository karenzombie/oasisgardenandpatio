# Addendum 2 to: bring manual vendor order options to parity with the order UI

Two bugs surfaced in Karen's testing, both in the vendor PO PDF generator. This
addendum fixes them. Verified against GitHub HEAD `462a810` (current `main`).
DEV ONLY.

Addendum working rules are in force: targeted edits only, no whole-file rewrites,
paste every diff and command output as literal text, behavior audit whenever you
touch a shared file, report anything out of scope rather than fixing it, verify or
ask rather than assume. If a rule blocks the direct path, STOP and ask Karen.

## Boundary

Both fixes are in `artifacts/api-server/src/lib/vendorOrderPdf.tsx` only. Do NOT
touch the customer storefront, customer checkout, customer-order flow, or the
on-screen vendor order display (the screen is already correct). This is the
vendor PO PDF, which is staff and vendor facing, not customer facing.

## Why

1. Weight is printing on the PO. It was never asked for and should not appear on
   a vendor PO at all. It shows on any line that renders the full option list.
2. An edited or picker-added line shows only a plain sub-line on the PO and is
   missing its finish, finial, and fabric, even though the screen shows them
   correctly. The PDF has old logic that, for an edited line, prints the line's
   override sub-description instead of the real option list. That logic predates
   the option-snapshot work. Edited lines now carry real finish/finial/fabric
   snapshots, so this short-circuit hides them (and also skips weight, which is
   why weight vanished specifically on the edited line).

## The fix (both in `vendorOrderPdf.tsx`)

### Fix A, remove weight from the PO

- In `itemOptions` (around line 388), remove the `weightOption(it),` entry so the
  option list no longer includes a weight line.
- The `weightOption` function (around lines 374 to 380) becomes unused after that.
  Remove it too. This is part of the same change, not out of scope.
- Leave the `weightSnapshot` field on the `PdfVendorOrderItem` type and anywhere
  it is populated. Only the rendering is being removed, not the data.
- This removes weight from every vendor PO document (the main PO and the
  cancellation/revision documents both build their option lines through
  `itemOptions`).

### Fix B, edited lines must show their real options

- In the main PO item rendering (around lines 590 to 593), there is a branch:
  `it.edited && it.subDescription ? [it.subDescription] : itemOptions(it)`.
  Remove that edited-line short-circuit so a non-fabric line always renders
  `itemOptions(it)`, the same as an unedited line, the same as the screen, and
  the same as the cancellation/revision renderer (which already uses
  `itemOptions` directly with no such branch).
- Do NOT change the `isFabric` branch above it. Fabric-only lines keep their
  existing "for <product>" rendering.
- Footprint note: the short-circuit was a stand-in from before the picker
  lockdown, when a staff-edited line could carry a free-typed sub-description
  override. The lockdown recon found zero rows with a `po_sub_description`
  override, so no existing line depends on this branch. Before editing, run a
  read-only count of vendor-order `order_items` rows where `po_sub_description`
  is non-null and report it. If it is zero, proceed. If it is not zero, STOP and
  report to Karen rather than proceeding, since those lines would change how they
  print.

## Behavior audit (paste as literal text)

Confirm on the PO PDF, for a manual vendor order that has both an original line
and a picker-added edited line:

- Neither line shows a weight line anymore.
- Both lines show their finish, finial, and fabric options (whichever the product
  carries), matching the on-screen display.
- The fabric-only line rendering (if any) is unchanged.

Paste every diff. The api-server must be rebuilt and restarted in dev before
Karen tests. Karen will reprint the PO herself and confirm both lines show the
options and no weight. STOP.
