import { logger } from "./logger";
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
  const kindLabel =
    args.orderKind === "custom" ? "custom cushion" : "replacement cushion";
  const body = `
    <p style="margin:0 0 12px 0;">Hi ${escapeHtml(args.customerName)},</p>
    <p style="margin:0 0 12px 0;">
      Thank you for your ${kindLabel} order with Oasis Garden &amp; Patio.
      We have received your request and will reach out to confirm details and pricing.
    </p>
    <p style="margin:0 0 12px 0;">
      <strong>Order number:</strong> ${escapeHtml(args.orderNumber)}<br/>
      <strong>Items:</strong> ${escapeHtml(args.itemSummary)}
    </p>
    <p style="margin:16px 0 0 0;">
      If you have questions, reply to this email or call (661) 255-9909.
    </p>
  `;
  try {
    await sendEmail({
      to: args.to,
      subject: `Cushion order received — ${args.orderNumber}`,
      title: "Cushion order received",
      bodyHtml: body,
    });
  } catch (err) {
    logger.error({ err, orderNumber: args.orderNumber }, "Cushion customer email failed");
  }
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
    <p style="margin:0 0 12px 0;">A new ${args.orderKind} cushion order has been submitted.</p>
    <p style="margin:0 0 12px 0;">
      <strong>Order:</strong> ${escapeHtml(args.orderNumber)}<br/>
      <strong>Customer:</strong> ${escapeHtml(args.customerName)}<br/>
      <strong>Items:</strong> ${escapeHtml(args.itemSummary)}
    </p>
    <p style="margin:0;">
      <a href="${escapeHtml(args.detailUrl)}">View in admin dashboard</a>
    </p>
  `;
  try {
    await sendEmail({
      to: args.to,
      subject: `New cushion order — ${args.orderNumber}`,
      title: "New cushion order received",
      bodyHtml: body,
    });
  } catch (err) {
    logger.error({ err, orderNumber: args.orderNumber }, "Cushion admin email failed");
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
