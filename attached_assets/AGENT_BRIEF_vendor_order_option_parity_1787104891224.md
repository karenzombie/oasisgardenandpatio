# Agent Brief: bring manual vendor order options to parity with the order UI

RECON FIRST. This brief is Step 0 only. No code, no schema, no UI edits until
Karen confirms scope and the fabric-vendor-split question below.

Verified against GitHub HEAD `ead724a` (current `main`). DEV ONLY.

Note on unpushed state: the vendor order EDIT screen
(`artifacts/web/src/staff/pages/admin/VendorOrderDetail.tsx`) has local changes
that are NOT on GitHub yet: the Step 3 product picker from the vendor order edit
lockdown, plus a directed visual change that turned the mandatory change-note
field red. Both are expected and accepted. Read that file from the live
workspace, not from `main`, and report its current `file:line` when asked.

Addendum working rules are in force: targeted edits only when we get to edits,
no whole-file rewrites, paste every diff and command output as literal text,
behavior audit whenever you touch a shared file, report anything out of scope
rather than fixing it, and verify or ask rather than assume. If a rule blocks
the direct path, STOP and ask Karen.

## Critical boundary (read first)

This work touches STAFF vendor-order code only. Do NOT touch the customer
storefront, the customer checkout, or the customer-order creation flow. Those
already capture and display finish and fabric correctly and must remain exactly
as they are. If a change appears to require touching customer-facing code, STOP
and report it rather than proceeding.

## Why / end goal

A vendor order generated FROM a customer order already carries the full option
selection (finish, and the specific fabric with its name, item number, and
grade) onto the on-screen PO, the printed PO, and the vendor email. A MANUAL
(standalone) vendor order, and any manual edit that adds a line, does not. Its
picker captures only variant, a grade tier, and a finish, and even those are not
fully snapshotted, so the picks disappear on save and never reach the PO.

Goal: manual vendor orders (create and edit) must let staff pick the same
options as the order UI and have those picks saved, shown on screen, printed,
and emailed, exactly like a vendor order generated from a customer order.

Real scenario driving this: a customer changes a fabric after the order is
placed. Staff decide there is no price change and no need to touch the original
customer order, but they must update the vendor order to reflect the new fabric.
They need the same pickers the order UI has to make that change.

## What is true today (for orientation, confirm in Step 0)

- The order UI picker lives in
  `artifacts/web/src/staff/pages/agent/NewOrder.tsx`. Its `onApply` returns a
  rich option set: variant, fabric (`CatalogFabricOption`), finish
  (`CatalogFinishOption`), finial (`CatalogFinialOption`), stem, cover, plus a
  grade label and prices.
- The vendor picker in `VendorOrderNew.tsx` (`ProductPickerDialog`) is described
  in its own comment as a simplified version of the NewOrder picker. It captures
  only variant, a grade tier, and a finish id. It does NOT let staff pick a
  specific fabric, finial, stem, or cover.
- `order_items` already has snapshot columns for every option: finish
  (`finishId`, `finishNameSnapshot`, `finishCodeSnapshot`), finial (`finialId`,
  `finialNameSnapshot`, `finialCodeSnapshot`), and fabric (`fabricId`,
  `fabricNameSnapshot`, `fabricItemNumberSnapshot`, `fabricGradeSnapshot`,
  `fabricVendorId`, `fabricVendorOrderId`).
- The vendor PO PDF (`artifacts/api-server/src/lib/vendorOrderPdf.tsx`,
  `itemOptions`) renders variant, finish, finial, and fabric (with grade) from
  those snapshots. So once a line carries the snapshots, the printed PO shows
  them with no change to that file.
- The vendor email (`artifacts/api-server/src/lib/vendorOrderEmail.ts`) attaches
  that PDF, so the full option detail reaches the vendor in the attachment. But
  the email HTML body itself lists only description, variant, and fabric name. It
  does NOT list finish or finial. So finish and finial reach the vendor through
  the attached PDF, not the email body. Whether the email body should also show
  finish and finial is a question for Karen, not something to change in this
  brief.
- The manual vendor CREATE and EDIT add-line inserts live in
  `artifacts/api-server/src/routes/adminVendorOrders.ts`. They set variant and
  weight snapshots and resolve cost, but they do NOT set the finish, finial, or
  fabric snapshots. Cost is resolved on the server (`resolveLineCost`); the
  lockdown forbids client-sent prices, and that stays true here.
- Fabric can carry a `fabricVendorId` that differs from the product's vendor. In
  the order flow this drives a separate fabric-only PO grouped by
  `fabricVendorId` (`fabricVendorOrderId` on the line). Whether a standalone
  vendor order should represent that split is an open question for Karen.

## Step 0, RECON only. No edits. STOP.

Report all of the following as literal text, then STOP.

1. Order UI picker (`NewOrder.tsx`): the complete list of options it can capture
   for a product (variant, fabric, finish, finial, stem, cover, pole, grade),
   the exact `onApply` signature, and for each option which hook or endpoint
   loads the choices for the picked product. For each option, state whether
   `onApply` passes back an id or a full object.

2. Current vendor CREATE picker (`VendorOrderNew.tsx` `ProductPickerDialog`):
   the exact options it captures today and what `onApply` returns. Confirm it
   captures no specific fabric, finial, stem, or cover.

3. Current vendor EDIT picker (`VendorOrderDetail.tsx`, live workspace copy,
   with the unpushed Step 3 picker and red-box change): what it captures today
   and how it builds the edit payload. Report the relevant `file:line`, since
   this file is not on GitHub.

4. Vendor CREATE and EDIT add-line inserts (`adminVendorOrders.ts`): the exact
   `file:line` of each insert, and for each, list which snapshot columns it sets
   and which it leaves null. Confirm finish, finial, and fabric snapshots are
   currently not set on either path.

5. Snapshot readers: report exactly what each surface renders from the option
   snapshots, with `file:line`, keeping these three separate:
   (a) the vendor PO detail response and the on-screen PO,
   (b) the printed PO (`vendorOrderPdf.tsx`, `itemOptions`),
   (c) the vendor email (`vendorOrderEmail.ts`), and within it, separate what
       the email HTML BODY renders from what the ATTACHED PDF renders.
   Confirm the printed PO needs no change once the line carries the snapshots.
   For the email, confirm the PDF is attached, and report whether the email body
   would need a change to show finish and finial, since it currently lists only
   description, variant, and fabric name.

6. Vendor CREATE and EDIT schemas in `lib/api-spec/openapi.yaml`
   (`CreateStandaloneVendorOrderItem`, `EditVendorOrderItem`): the current
   fields on each, and exactly what fields would need adding to carry a specific
   fabric selection (fabric id, and whatever else the order flow sends), finial,
   and any other option, so both paths can accept them. Do not change anything
   yet, just report.

7. THE FABRIC-VENDOR SPLIT (most important recon item): explain, from the code,
   how the order flow handles a fabric whose `fabricVendorId` differs from the
   product's vendor: where the split into a separate fabric-only PO is decided,
   how `fabricVendorId` and `fabricVendorOrderId` are set, and where the fabric
   line ends up. Then report whether a standalone (manual) vendor order today
   has any path to represent a split fabric, or whether a manual vendor order is
   strictly one PO to one vendor. Do NOT design or build anything for this.
   Report how it works and where the decision lives, so Karen can decide.

8. `resolveLineCost`: confirm what inputs it already uses (grade, finish,
   variant) and whether a specific fabric selection changes the resolved cost or
   not.

STOP. Wait for Karen to decide (a) which options the manual vendor picker should
support, and (b) the fabric-vendor-split question, before any schema, server, or
UI edit. Karen will test all UI herself; the agent cannot screenshot.
