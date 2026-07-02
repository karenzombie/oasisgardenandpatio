import { sendEmail } from "./email";

interface CushionItemSummary {
  cushionType: string | null;
  productName: string | null;
  quantity: number;
}

const TYPE_LABELS: Record<string, string> = {
  hinged_chaise: "Hinged Chaise / Chair",
  club_chair: "Club Chair (Seat & Back)",
  trapezoid: "Trapezoid Seat",
  bench: "Bench",
  ottoman: "Ottoman",
  dining_chair: "Dining Chair (Seat or Back)",
};

export function summarizeItems(items: CushionItemSummary[]): string {
  if (items.length === 0) return "(no items)";
  return items
    .map((it) => {
      const name = it.cushionType
        ? (TYPE_LABELS[it.cushionType] ?? it.cushionType)
        : (it.productName ?? "Item");
      return it.quantity > 1 ? `${name} x${it.quantity}` : name;
    })
    .join(", ");
}

interface CustomerConfirmationArgs {
  to: string;
  customerName: string;
  orderNumber: string;
  itemSummary: string;
  orderKind: "custom" | "stock";
}

export async function sendCustomerConfirmationEmail(
  args: CustomerConfirmationArgs,
): Promise<void> {
  const body = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(args.customerName)},</p>
    <p style="margin:0 0 12px 0;">
      Thank you for your cushion order with Oasis Garden &amp; Patio! We have received your request and will be in touch shortly to confirm details and pricing.
    </p>
    <p style="margin:0 0 12px 0;">
      <strong>Order number:</strong> ${escapeHtml(args.orderNumber)}
    </p>
    <p style="margin:0 0 12px 0;">
      <strong>Items:</strong> ${escapeHtml(args.itemSummary)}
    </p>
    <p style="margin:0 0 12px 0;">
      If you have any questions in the meantime, feel free to reply to this email or call us at (661) 255-9909.
    </p>
    <p style="margin-top:24px;">Warm regards,<br/>The Oasis Garden &amp; Patio Team</p>
  `;
  // Intentionally do NOT swallow errors here — callers (the public submit
  // path uses `void` to fire-and-forget; the staff resend path awaits and
  // needs the rejection to propagate so it can return a truthful 5xx).
  await sendEmail({
    to: args.to,
    subject: `Cushion order received — ${args.orderNumber}`,
    title: "Cushion order received",
    bodyHtml: body,
  });
}

interface AdminAlertArgs {
  to: string;
  orderNumber: string;
  customerName: string;
  itemSummary: string;
  detailUrl: string;
  orderKind: "custom" | "stock";
}

export async function sendAdminAlertEmail(args: AdminAlertArgs): Promise<void> {
  const body = `
    <p style="margin:0 0 12px 0;">A new cushion order has been submitted.</p>
    <p style="margin:0 0 12px 0;">
      <strong>Order:</strong> ${escapeHtml(args.orderNumber)}<br/>
      <strong>Customer:</strong> ${escapeHtml(args.customerName)}<br/>
      <strong>Items:</strong> ${escapeHtml(args.itemSummary)}
    </p>
    <p style="text-align:center;margin:28px 0;">
      <a href="${escapeHtml(args.detailUrl)}" style="display:inline-block;background:#1a3c5e;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;letter-spacing:1px;">View in Admin Dashboard</a>
    </p>
  `;
  // Same rationale as customer email — let the caller decide what to do
  // with delivery failures.
  await sendEmail({
    to: args.to,
    subject: `New cushion order — ${args.orderNumber}`,
    title: "New cushion order received",
    bodyHtml: body,
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
