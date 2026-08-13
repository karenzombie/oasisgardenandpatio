# Agent Brief: show MSRP alongside the charged price on customer order displays

Verified against GitHub HEAD `2b0e0f5` (current dev). DEV ONLY.

Addendum working rules are in force: targeted edits only, no whole-file rewrites,
paste every diff and command output as literal text, behavior audit whenever you
touch a shared file, report anything out of scope rather than fixing it, and
verify or ask rather than assume. If a rule blocks the direct path, STOP and ask
Karen.

## Why

When a customer order line has both an MSRP and a sale price, the staff and the
printed/emailed order should show the MSRP struck through next to the active
charged price, so a sales agent can show the customer the full price and what
they saved.

## The display rule (this is exact, do not add to it)

Decide purely on which fields have data. Do NOT compare the two prices to each
other. There is no greater-than or less-than logic anywhere in this.

- MSRP present AND a sale/charged price present: show the MSRP struck through,
  and the charged price active.
- MSRP present, no sale: show the MSRP only, no strikethrough.
- Charged price present, no MSRP (MSRP is null): show the charged price only, no
  MSRP line.
- Never show cost, on any surface, ever.

The "active" price is always the price the customer was actually charged
(`unit_price`, which is the sale price, or an agent override if one was set), not
a recomputed value.

You may mirror the customer product page's visual presentation (the MSRP label
and strikethrough styling) for consistency, but drive the decision on field
presence per the rule above, NOT on the product page's price comparison.

## What this is and is NOT

- The MSRP is already stored on each order line (`unit_msrp_snapshot`) and
  populated at order creation, and the charged price is `unit_price`. So this is
  NOT a schema change and NOT an order-creation change.
- But the stored MSRP is not currently carried to any render layer. So each
  surface needs the field routed to where it renders, then displayed. This is
  not pure markup, see the per-surface notes.
- NOT a change to what is charged. `unit_price` stays the charged amount.
- The delivery manifest PDF is OUT of scope. Do not touch it.

## Surfaces (five)

1. Create New Order builder: `artifacts/web/src/staff/pages/agent/NewOrder.tsx`.
   The `LineItem` state has `unitPrice` but no `msrp`. Add an `msrp` field to the
   line state, fill it from the picked product (`picked.msrp` on the
   `AdminProduct` type) when a line is applied, and show the MSRP as a reference
   next to the unit price. The unit price field stays editable and unchanged.
2. Saved order detail, admin: `artifacts/web/src/staff/pages/admin/OrderDetail.tsx`.
3. Saved order detail, agent: `artifacts/web/src/staff/pages/agent/OrderDetail.tsx`.
   For both order details, the order API response already includes
   `unitMsrpSnapshot` on each line (confirmed in `adminOrders.ts`); the web line
   type just does not read it. Map the field from the response into the line
   type and display it. No server change here.
4. Printed order copies: `artifacts/api-server/src/lib/customerOrderPdf.tsx`
   (customer/store/delivery copies). Its line data carries only `unitPrice`. The
   server code that builds the PDF line objects needs to pass
   `unitMsrpSnapshot` in, then the PDF displays it. Active price stays the
   charged amount.
5. Order confirmation email: `artifacts/api-server/src/lib/orderConfirmationEmail.ts`.
   Its line data carries only `unitPrice`. Pass `unitMsrpSnapshot` into the
   email line objects, then display it.

## Step 0, RECON only. No edits. STOP.

For each of the five surfaces, paste:
- The exact `file:line` where the line price renders today.
- Whether the MSRP is already available at that render point, and if not, exactly
  what needs routing to get it there (the builder line state, the web line type
  mapping, or the PDF/email line data). Do not add it yet, just report it.
- Confirm no surface currently shows cost and none will after your change.

STOP. Wait for Karen to confirm before any edit.

## Step 1, web (builder + both order details). STOP.

Add the MSRP display to the three web surfaces per the display rule. Unit price
stays the charged amount; on the builder it stays editable.

Paste every diff. Behavior audit of each file: the charged price and every other
column unchanged, only the MSRP display added.

Karen test list:
- Create New Order, add a product with both MSRP and a sale price (e.g. AKZ13
  Rolling Base: MSRP 1380, sale 1035). The MSRP (1380) shows next to the unit
  price (1035).
- Add a product with an MSRP but no sale price: MSRP shows, no strikethrough.
- Add a product with a price but no MSRP: single price, no MSRP line.
- Open a saved order in the admin view and the agent view with a discounted
  line: MSRP struck through, charged price active.
- Confirm cost appears nowhere on these screens.

STOP.

## Step 2, printed copies + email. STOP.

Route `unitMsrpSnapshot` into the customer order PDF line data and the order
email line data, then display it per the display rule. Never show cost.

Paste every diff. Behavior audit of each file: totals and every other field
unchanged, only the MSRP display added.

Karen test list:
- Print a customer copy, a store copy, and a delivery copy of an order with a
  discounted line. Each shows the MSRP struck through and the charged price
  active.
- Confirm cost does not appear on any copy.
- Preview an order confirmation email for a discounted order: the line shows the
  MSRP and the charged price.

STOP. End of brief.
