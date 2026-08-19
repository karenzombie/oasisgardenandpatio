# Addendum 1 to: bring manual vendor order options to parity with the order UI

Step 0 recon is complete and confirmed. This addendum defines the build. Verified
against GitHub HEAD `ead724a` (current `main`). DEV ONLY.

Unpushed state reminder: the vendor order EDIT screen
(`VendorOrderDetail.tsx`) carries the Step 3 picker and the red change-note field,
neither on GitHub. Its picker is a verbatim copy of the CREATE picker in
`VendorOrderNew.tsx`. Apply every picker and display change to BOTH copies. Read
the EDIT file from the workspace and report its `file:line` as you go.

Addendum working rules are in force: targeted edits only, no whole-file rewrites,
paste every diff and command output as literal text, behavior audit whenever you
touch a shared file, report anything out of scope rather than fixing it, verify
or ask rather than assume. If a rule blocks the direct path, STOP and ask Karen.

## Scope (Karen has decided this, do not re-open it)

Manual vendor orders (the CREATE screen and the EDIT add-line path) must capture
and snapshot the same options as the order UI (the `NewOrder.tsx` picker), so a
manual line carries the full finish, finial, and fabric detail onto the saved
line, the on-screen PO, and the printed PO, exactly like a vendor order generated
from a customer order.

Specifically:

- Fabric: staff pick the specific fabric, scoped to that product's own fabrics
  (the picker's `fabricOptions` already come from `product_fabric_options` for the
  product, so "O.W. Lee item shows only O.W. Lee fabrics" happens automatically).
  The line stores the fabric name, item number, brand, and grade snapshots.
- Finial: staff pick the finial; the line stores finial name and code snapshots.
- Finish: `finishId` is already captured for cost; now also store the finish name
  and code snapshots so the finish prints and displays.
- Grade for pricing derives from the selected fabric, mirroring the customer
  picker. For a fabric-priced product, picking the fabric supplies the grade key,
  so the fabric selector replaces the current bare "Grade A/B/C" dropdown for
  those products. Confirm this exact interaction against the customer picker as
  you build it, and match it.

## Out of scope (do not build, do not touch)

- The fabric-vendor split. Manual POs stay strictly single vendor. Do NOT set
  `fabricVendorId` or `fabricVendorOrderId` on manual lines, do NOT add a fabric
  vendor selector, and do NOT create a second fabric-only PO. The client is not
  using this. If anything pulls you toward it, STOP and report.
- The customer storefront, customer checkout, and the customer-order creation
  flow. They already work. Do NOT touch them.

## The pattern to mirror

The customer order flow already does exactly this in
`artifacts/api-server/src/routes/adminOrders.ts` (around lines 1180 to 1300):
given `finishId` / `finialId` / `fabricId` on a line, it looks each up and writes
the snapshot columns, then resolves cost. Mirror that pattern on the vendor side.
The source tables differ per option, so use the correct one:

- Finish: `finishesTable` by `finishId`, take item number (code) and name.
- Finial: `productFinialOptionsTable` by `finialId`, take code and name.
- Fabric: `fabricsTable` by `fabricId` (join `manufacturers` for the brand), take
  item number, name, brand, and grade.
- Cost: `resolveLineCost(tx, { productId, variantId, grade })`. Grade priority is
  the line's grade, else `String(finishId)`, else null, unchanged from today. The
  line's grade for a fabric line is the selected fabric's grade.

## Step 1, schema. STOP.

In `lib/api-spec/openapi.yaml`:

- Add `fabricId` (integer, nullable) and `finialId` (integer, nullable) to BOTH
  `CreateStandaloneVendorOrderItem` and `EditVendorOrderItem`. `finishId` and
  `grade` are already present on both.
- Extend the response item `AdminVendorOrderItem` so the on-screen view can read
  the option snapshots it currently cannot see. Today it exposes only
  `fabricNameSnapshot`. Add: `finishNameSnapshot`, `finishCodeSnapshot`,
  `finialNameSnapshot`, `finialCodeSnapshot`, `fabricItemNumberSnapshot`,
  `fabricBrandSnapshot`, `fabricGradeSnapshot` (all string, nullable). Confirm
  `itemToPayload` in `adminVendorOrders.ts` already passes these through from the
  DB row; if any is not passed through, report it rather than guessing.

Regenerate zod and web client types with `cd lib/api-spec && pnpm codegen`. Do not
hand-edit generated files. Paste the schema diff and the codegen output. STOP.

## Step 2, server insert. STOP.

In `adminVendorOrders.ts`, in BOTH the CREATE add-line insert and the EDIT
add-line insert, mirror the customer-flow resolution above:

- If `finishId` is present: look up `finishesTable`, set `finishId`,
  `finishNameSnapshot`, `finishCodeSnapshot`.
- If `finialId` is present: look up `productFinialOptionsTable`, set `finialId`,
  `finialNameSnapshot`, `finialCodeSnapshot`.
- If `fabricId` is present: look up `fabricsTable` (join manufacturers for brand),
  set `fabricId`, `fabricNameSnapshot`, `fabricItemNumberSnapshot`,
  `fabricBrandSnapshot`, `fabricGradeSnapshot`. Use the fabric's grade as the
  grade for cost resolution, matching the customer flow.
- Keep cost server-resolved via `resolveLineCost`. Do NOT accept or use any
  client-sent price (the lockdown rule stands).
- Do NOT set `fabricVendorId` or `fabricVendorOrderId`.

Validate each id belongs to the product / is valid, the same way the create
endpoint already validates `productId` against the PO manufacturer, and throw a
clear error if not. Behavior audit: confirm a line with a fabric saves all four
fabric snapshots, a finial line saves finial snapshots, a finish line saves finish
snapshots, quantity-only edits and removals still work, and cost still resolves.
Paste every diff. STOP.

## Step 3, picker UI. STOP.

In the vendor picker, in BOTH `VendorOrderNew.tsx` (CREATE) and the copy appended
to `VendorOrderDetail.tsx` (EDIT):

- Add a fabric selector and a finial selector, sourced from the same
  `GET /admin/products/:id/picker` response the customer picker uses
  (`fabricOptions`, `finialOptions`), mirroring `NewOrder.tsx`. Fabric options are
  already product-scoped by that endpoint, so no vendor filter is needed.
- For fabric-priced products, the fabric selection supplies the grade (mirror the
  customer picker's fabric-to-grade behavior). Match whatever the customer picker
  does for a grade-priced product that has no fabric options; report that case if
  you find it.
- The picker sends `fabricId`, `finialId`, and the existing `finishId` (plus the
  derived `grade`) to the server. It sends NO price. Update the payload builders
  (the CREATE picker's apply, and `handlePickerApply` / `buildEditData` on the
  EDIT screen) accordingly.

Behavior audit: no free-typed option fields, picker-only. Paste every diff. Karen
tests the picker herself (add a product with a fabric, a finial, and a finish,
confirm each is required where the customer picker requires it). The api-server
must be rebuilt and restarted in dev before she tests. STOP.

## Step 4, on-screen display. STOP.

On the vendor order detail line (`VendorOrderDetail.tsx`), show finish, finial, and
the full fabric (name, item number, grade) on the saved line, matching how a
customer-order-generated vendor order presents, using the fields now exposed by
Step 1. Paste every diff. Karen tests the on-screen result herself. STOP.

## Print and email (no change needed, stated so you do not touch them)

- The printed PO (`vendorOrderPdf.tsx`, `itemOptions`) already renders variant,
  finish, finial, and fabric with grade from the snapshots. Once the line carries
  them, the PDF shows them with no code change. Do NOT edit the PDF.
- The vendor email body lists description, variant, and fabric name, and attaches
  the full PDF. This is exactly what a customer-order-generated PO produces today,
  so it already matches. Do NOT change the email.
