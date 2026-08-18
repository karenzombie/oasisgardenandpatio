# Agent Brief: lock vendor order editing to product-linked lines only

Verified against GitHub HEAD `a0e80df` (current dev). DEV ONLY. (The two
commits after `2b0e0f5` touched none of the files below; every line reference
here still holds.)

Addendum working rules are in force: targeted edits only, no whole-file
rewrites, paste every diff and command output as literal text, behavior audit
whenever you touch a shared file, report anything out of scope rather than
fixing it, and verify or ask rather than assume. If a rule blocks the direct
path, STOP and ask Karen.

## Why

Vendor orders are purchase orders that get sent to manufacturers. Right now the
EDIT screen for a vendor order lets staff type free text into SKU, description,
and sub-description, and add brand-new lines with no product behind them. That
means a real product SKU could be hand-edited into something that does not
exist and sent to a vendor. That must be impossible.

The CREATE vendor order screen is already correct: it forces every line to come
from a product picker, and derives the SKU, description, and cost from the real
product. The EDIT screen must be brought to the same standard.

## The rule (exact, do not add to it)

On a vendor order edit, staff may do only three things to lines, and nothing
else:

1. Change a line's quantity.
2. Add a line by picking a real product (same picker as the create screen). SKU,
   description, and cost come from the product, never typed.
3. Remove a line.

There are NO free-typed or editable SKU, description, sub-description, or price
fields anywhere in vendor order editing, on new lines or existing lines. Adding
and removing lines stays. Editing quantity stays. Everything else about a line
is read-only.

The mandatory change-note ("why are you making this change?") and the edit audit
trail stay exactly as they are.

## What is true today (confirmed in the repo, for your orientation)

- Vendor order lines are rows in `order_items` tied to the PO by
  `vendorOrderId` (or `fabricVendorOrderId`). The table `po_items` is not the
  one in play here.
- Create endpoint `POST /admin/vendor-orders`
  (`artifacts/api-server/src/routes/adminVendorOrders.ts`, around lines 177 to
  345) validates each `productId`, enforces that every product belongs to the
  PO's manufacturer, builds the description from the product name (plus variant),
  resolves cost with `resolveLineCost`, and inserts a product-linked snapshot
  row. This is the pattern to reuse.
- Create request schema in `lib/api-spec/openapi.yaml` is
  `CreateStandaloneVendorOrderRequest`, with per-line items
  `CreateStandaloneVendorOrderItem` carrying `productId`, `variantId`,
  `quantity`, `notes`, `grade`, `finishId` (required `[productId, quantity]`).
  This generates into the zod schema `AdminCreateStandaloneVendorOrderBody`.
- Edit endpoint `POST /admin/vendor-orders/:id/edit` (same file, around 1002 to
  1170) currently, for an added line (no `id`), inserts an `order_items` row with
  `productId: null`, the typed `sku`/`description`/`subDescription` as the
  snapshot, the typed `unitPrice` (and `amount = unitPrice * quantity`), and
  `unitCostSnapshot: null`. For an existing line it writes text overrides
  `poSku`, `poDescription`, `poSubDescription` from typed input, plus
  `poQuantity` for quantity.
- IMPORTANT shared code inside the item loop, both branches depend on it: at the
  top of the loop the endpoint destructures `sku`, `description`,
  `subDescription`, `quantity`, `unitPrice` off each item; and the existing-line
  branch computes `effSku`/`effDescription`/`effSubDescription`/`effQuantity` and
  compares them to decide whether the line `changed`. Both of these read the
  fields Step 1 removes, so both must be reworked, not just the two branch
  bodies. If you only fix the branches, this shared block will fail to compile.
- Edit request schema in `lib/api-spec/openapi.yaml` is
  `EditVendorOrderRequest`, with per-line items `EditVendorOrderItem` currently
  carrying `id`, `sku`, `description`, `subDescription`, `quantity`,
  `unitPrice`, `removed` (item-level required `[description, quantity]`). This
  generates into the zod schema `AdminEditVendorOrderBody` in
  `lib/api-zod/src/generated/api.ts` and the web client. Edit the yaml block,
  never the generated files.
- The override columns live on `order_items`
  (`lib/db/src/schema/orders.ts:242-245`): `poSku`, `poDescription`,
  `poSubDescription`, `poQuantity`.
- The only place the override columns feed output is a helper around
  `adminVendorOrders.ts:106-111` that computes effective values
  (`effSku = poSku ?? variantSkuSnapshot ?? productSkuSnapshot`,
  `effDescription = poDescription ?? description`,
  `effSubDescription = poSubDescription ?? variantNameSnapshot`,
  `effQuantity = poQuantity ?? quantity`). Whatever renders the PO (detail
  response, printed copy, vendor email) reads these effective values.
- `poQuantity` is how an allowed quantity edit is stored, so it STAYS. Only the
  three text overrides `poSku`, `poDescription`, `poSubDescription` are the
  illegitimate ones.
- The edit UI is `artifacts/web/src/staff/pages/admin/VendorOrderDetail.tsx`
  (free-text inputs and a blank "Add line item"). The picker to reuse is in
  `artifacts/web/src/staff/pages/admin/VendorOrderNew.tsx` (`ProductPickerDialog`,
  "Add product").

## Step 0, RECON only. No edits. STOP.

Report all of the following as literal text, then STOP:

1. The edit UI: the exact `file:line` of every free-text line input (SKU,
   description, sub-description) and the blank "Add line item" control in
   `VendorOrderDetail.tsx`, and the exact code that builds the edit request
   payload it sends.
2. The picker: confirm whether `ProductPickerDialog` in `VendorOrderNew.tsx` can
   be reused as-is for the edit screen, or whether it is local to that file and
   what it returns when a product is applied (product, variant, grade, finish).
   Do not move or refactor it yet, just report.
3. The edit endpoint: the exact `file:line` of the added-line insert (the
   `productId: null` branch) and the existing-line override writes (`poSku`,
   `poDescription`, `poSubDescription`, `poQuantity`).
4. The schema source: the exact block in `lib/api-spec/openapi.yaml` that defines
   the edit body items, and the command this repo uses to regenerate the zod and
   web client types from it. Confirm the generated files are produced by that
   command and are not meant to be hand-edited.
5. Every reader of `poSku`, `poDescription`, `poSubDescription`: list each
   `file:line`. Confirm the printed PO copy and the vendor email read through the
   effective-value helper (around 106-111) and not the raw override columns
   directly. If any surface reads a raw override column directly, report it.
6. A read-only count: how many existing `order_items` rows that belong to a
   vendor order have a non-null `poSku`, `poDescription`, or `poSubDescription`.
   This tells Karen whether any historical text overrides already exist. Report
   the number. Do not change any data.

STOP. Wait for Karen to confirm before any edit.

## Step 1, schema. STOP.

In `lib/api-spec/openapi.yaml`, change the `EditVendorOrderItem` shape (inside
`EditVendorOrderRequest`) so that:

- An existing line (has `id`) accepts only `id`, `quantity`, and `removed`.
- An added line (no `id`) accepts `productId`, `variantId`, `grade`, `finishId`,
  `quantity`, and `notes`, mirroring `CreateStandaloneVendorOrderItem`.
- `sku`, `description`, `subDescription`, and `unitPrice` are no longer accepted
  on any edit line.
- Fix the item-level `required`: it is currently `[description, quantity]`, and
  `description` is being removed, so it must not stay in `required`. The
  existing-line vs added-line split (id present vs `productId` present) is not
  worth encoding as a strict either/or in the yaml; keep the per-line fields
  optional with `quantity` as the only required field, and let the endpoint
  enforce the rule (Step 2 already requires `productId` on an added line and
  ignores unknown `id`s). Report the final `required` you land on.

Regenerate the zod and web client types with the repo's generation command. Do
not hand-edit generated files. Paste the schema diff and the generation command
output.

STOP.

## Step 2, server endpoint. STOP.

In `POST /admin/vendor-orders/:id/edit`:

- Existing line: apply only a quantity change (via `poQuantity`) and removal.
  Stop writing `poSku`, `poDescription`, `poSubDescription` entirely.
- Rework the shared code that no longer type-checks once Step 1 lands: the
  per-item destructuring at the top of the loop must stop reading `sku`,
  `description`, `subDescription`, `unitPrice`, and the existing-line `changed`
  check must compare on quantity only (against `effQuantity`), since those are
  the only editable value on an existing line now. Do not leave dead references
  to the removed fields anywhere in the loop.
- Added line: require `productId`. Validate the product exists and belongs to
  this PO's manufacturer, and validate any variant, reusing the exact validation
  and cost resolution the create endpoint already uses (`resolveLineCost`, the
  product name plus variant description, the product-linked snapshot insert). No
  typed description, no typed cost.
- Keep the change-note requirement, the `vendorOrderEditsTable` insert, and
  `recordAudit` / `recordHistory` exactly as they are.

Behavior audit: confirm quantity edit still works, removal still works, added
lines are now product-linked with resolved cost, and no code path writes a text
override anymore. Paste every diff.

STOP.

## Step 3, edit UI. STOP.

In `VendorOrderDetail.tsx`:

- Remove the free-text SKU, description, and sub-description inputs. Show those
  values read-only on existing lines.
- Replace the blank "Add line item" with the product picker (reuse the create
  screen's picker per the recon). A new line is added only by picking a product.
- Keep the quantity field editable and keep the remove control.
- Update the payload builder to send the new shape: existing lines send id,
  quantity, removed; added lines send the picked product fields.

Behavior audit: no free-text line field remains anywhere on the screen. Paste
every diff.

Karen will test the screen herself (add via picker, change a quantity, remove a
line, confirm no field is free-typable, confirm the PO still prints correctly).
The api-server must be rebuilt and restarted in dev before she tests, since this
touches the server.

STOP.

## Historical text overrides (data)

The Step 0 count tells us whether any existing vendor orders already carry
`poSku` / `poDescription` / `poSubDescription` text overrides. If any exist,
they will keep displaying and printing through the effective-value helper even
after the write path is closed. What to do about those existing values is
Karen's decision, handled as a separate read-only-first data step after the code
lockdown lands. Do not modify any existing data in this brief.
