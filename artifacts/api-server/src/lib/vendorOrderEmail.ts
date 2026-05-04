import { sendEmail } from "./email";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

interface VendorOrderItem {
  productSkuSnapshot: string | null;
  variantSkuSnapshot: string | null;
  variantNameSnapshot: string | null;
  fabricNameSnapshot: string | null;
  description: string | null;
  quantity: number;
  unitPrice: number;
  amount: number;
  notes: string | null;
}

export interface SendVendorOrderEmailArgs {
  to: string;
  vendorOrderNumber: string;
  customerOrderNumber: string | null;
  manufacturerName: string | null;
  notes: string | null;
  items: VendorOrderItem[];
}

export async function sendVendorOrderEmail(
  args: SendVendorOrderEmailArgs,
): Promise<void> {
  const { to, vendorOrderNumber, customerOrderNumber, manufacturerName, notes, items } = args;

  const itemRows = items
    .map((it) => {
      const sku = [it.variantSkuSnapshot ?? it.productSkuSnapshot]
        .filter(Boolean)
        .join("");
      const desc = [it.description, it.variantNameSnapshot, it.fabricNameSnapshot]
        .filter(Boolean)
        .join(" — ");
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;">${escapeHtml(sku)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;">${escapeHtml(desc || "—")}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;text-align:center;">${it.quantity}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;text-align:right;">${fmtMoney(it.unitPrice)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;text-align:right;">${fmtMoney(it.amount)}</td>
        </tr>
        ${it.notes ? `<tr><td colspan="5" style="padding:0 10px 8px 10px;font-size:12px;color:#666;border-bottom:1px solid #e8e2d6;font-style:italic;">Note: ${escapeHtml(it.notes)}</td></tr>` : ""}
      `;
    })
    .join("");

  const total = items.reduce((sum, it) => sum + it.amount, 0);

  const vendorLine = manufacturerName
    ? `<p style="margin:0 0 8px 0;"><strong>Vendor:</strong> ${escapeHtml(manufacturerName)}</p>`
    : "";
  const customerOrderLine = customerOrderNumber
    ? `<p style="margin:0 0 8px 0;"><strong>Customer order:</strong> ${escapeHtml(customerOrderNumber)}</p>`
    : "";
  const notesBlock = notes
    ? `<p style="margin:16px 0 0 0;"><strong>Notes:</strong><br/>${escapeHtml(notes)}</p>`
    : "";

  const body = `
    <p style="margin:0 0 16px 0;">Please see the purchase order details below. Kindly acknowledge receipt and provide an estimated delivery date.</p>
    <div style="margin-bottom:16px;">
      <p style="margin:0 0 8px 0;"><strong>PO number:</strong> ${escapeHtml(vendorOrderNumber)}</p>
      ${customerOrderLine}
      ${vendorLine}
    </div>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="background:#f5f3ee;">
          <th style="padding:8px 10px;text-align:left;font-size:12px;color:#666;border-bottom:2px solid #e8e2d6;">SKU</th>
          <th style="padding:8px 10px;text-align:left;font-size:12px;color:#666;border-bottom:2px solid #e8e2d6;">Description</th>
          <th style="padding:8px 10px;text-align:center;font-size:12px;color:#666;border-bottom:2px solid #e8e2d6;">Qty</th>
          <th style="padding:8px 10px;text-align:right;font-size:12px;color:#666;border-bottom:2px solid #e8e2d6;">Unit</th>
          <th style="padding:8px 10px;text-align:right;font-size:12px;color:#666;border-bottom:2px solid #e8e2d6;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
        <tr>
          <td colspan="4" style="padding:10px;text-align:right;font-weight:bold;font-size:13px;">Order total:</td>
          <td style="padding:10px;text-align:right;font-weight:bold;font-size:13px;">${fmtMoney(total)}</td>
        </tr>
      </tbody>
    </table>
    ${notesBlock}
    <p style="margin:20px 0 0 0;font-size:13px;color:#666;">
      Please reply to this email to acknowledge or with any questions.<br/>
      You can also reach us at (661) 255-9909 or <a href="mailto:sales@oasisgardenandpatio.com">sales@oasisgardenandpatio.com</a>.
    </p>
  `;

  await sendEmail({
    to,
    subject: `Purchase Order ${vendorOrderNumber} — Oasis Garden & Patio`,
    title: `Purchase Order ${vendorOrderNumber}`,
    bodyHtml: body,
  });
}
