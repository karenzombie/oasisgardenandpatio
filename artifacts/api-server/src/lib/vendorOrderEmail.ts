import { Resend } from "resend";
import { logger } from "./logger";
import { emailLayout } from "./email";

async function getResendClient(): Promise<{ client: Resend; from: string }> {
  const directApiKey =
    process.env["Resend_API"] ??
    process.env["RESEND_API"] ??
    process.env["RESEND_API_KEY"];

  if (directApiKey) {
    return {
      client: new Resend(directApiKey),
      from: process.env["RESEND_FROM_EMAIL"] ?? "onboarding@resend.dev",
    };
  }

  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error("Resend not configured");
  }

  const url = `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=resend`;
  const response = await fetch(url, {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
  });
  const payload = (await response.json()) as {
    items?: Array<{ settings?: { api_key?: string; from_email?: string } }>;
  };
  const data = payload.items?.[0];
  if (!data || !data.settings?.api_key) {
    throw new Error("Resend not connected");
  }
  return {
    client: new Resend(data.settings.api_key),
    from: data.settings.from_email ?? "onboarding@resend.dev",
  };
}

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
  pdfBuffer?: Buffer;
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

  const subject = `Purchase Order ${vendorOrderNumber} — Oasis Garden & Patio`;

  const { client, from } = await getResendClient();
  const result = await client.emails.send({
    from,
    to,
    subject,
    html: emailLayout(`Purchase Order ${vendorOrderNumber}`, body),
    ...(args.pdfBuffer
      ? {
          attachments: [
            {
              filename: `PO-${vendorOrderNumber}.pdf`,
              content: args.pdfBuffer,
            },
          ],
        }
      : {}),
  });

  if (result.error) {
    logger.error(
      { err: result.error, to, subject },
      "Failed to send vendor order email",
    );
    throw new Error(`Failed to send vendor order email: ${result.error.message}`);
  }
}

export interface SendVendorOrderCancellationEmailArgs {
  to: string;
  vendorOrderNumber: string;
  manufacturerName: string | null;
  scope: "full" | "partial";
  reason: string | null;
  cancelledItems: VendorOrderItem[];
  remainingItems: VendorOrderItem[];
  pdfBuffer?: Buffer;
}

function renderItemRows(items: VendorOrderItem[], struck: boolean): string {
  return items
    .map((it) => {
      const sku = [it.variantSkuSnapshot ?? it.productSkuSnapshot]
        .filter(Boolean)
        .join("");
      const desc = [it.description, it.variantNameSnapshot, it.fabricNameSnapshot]
        .filter(Boolean)
        .join(" — ");
      const cellStyle = struck
        ? "text-decoration:line-through;color:#888;"
        : "";
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;${cellStyle}">${escapeHtml(sku)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;${cellStyle}">${escapeHtml(desc || "—")}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;text-align:center;${cellStyle}">${it.quantity}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;text-align:right;${cellStyle}">${fmtMoney(it.unitPrice)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;text-align:right;${cellStyle}">${fmtMoney(it.amount)}</td>
        </tr>
      `;
    })
    .join("");
}

export async function sendVendorOrderCancellationEmail(
  args: SendVendorOrderCancellationEmailArgs,
): Promise<void> {
  const {
    to,
    vendorOrderNumber,
    manufacturerName,
    scope,
    reason,
    cancelledItems,
    remainingItems,
  } = args;

  const headline =
    scope === "full"
      ? `Purchase Order ${vendorOrderNumber} has been CANCELLED`
      : `Purchase Order ${vendorOrderNumber} has been REVISED — partial cancellation`;

  const intro =
    scope === "full"
      ? `<p style="margin:0 0 16px 0;">Please be advised that the following purchase order has been <strong style="color:#b91c1c;">cancelled in full</strong>. Please do not ship these items.</p>`
      : `<p style="margin:0 0 16px 0;">Please be advised that the items listed below have been <strong style="color:#b91c1c;">cancelled</strong> from purchase order ${escapeHtml(vendorOrderNumber)}. The remaining items on this PO still apply — please ship those as originally agreed.</p>`;

  const vendorLine = manufacturerName
    ? `<p style="margin:0 0 8px 0;"><strong>Vendor:</strong> ${escapeHtml(manufacturerName)}</p>`
    : "";

  const reasonBlock = reason
    ? `<div style="border:1px solid #f1d4d4;background:#fff5f5;padding:10px 12px;margin:0 0 16px 0;border-radius:3px;">
         <div style="font-size:11px;text-transform:uppercase;color:#b91c1c;font-weight:bold;margin-bottom:4px;">Cancellation reason</div>
         <div style="font-size:13px;color:#3a3a3a;">${escapeHtml(reason)}</div>
       </div>`
    : "";

  const tableHead = `
    <thead>
      <tr style="background:#f5f3ee;">
        <th style="padding:8px 10px;text-align:left;font-size:12px;color:#666;border-bottom:2px solid #e8e2d6;">SKU</th>
        <th style="padding:8px 10px;text-align:left;font-size:12px;color:#666;border-bottom:2px solid #e8e2d6;">Description</th>
        <th style="padding:8px 10px;text-align:center;font-size:12px;color:#666;border-bottom:2px solid #e8e2d6;">Qty</th>
        <th style="padding:8px 10px;text-align:right;font-size:12px;color:#666;border-bottom:2px solid #e8e2d6;">Unit</th>
        <th style="padding:8px 10px;text-align:right;font-size:12px;color:#666;border-bottom:2px solid #e8e2d6;">Total</th>
      </tr>
    </thead>`;

  const cancelledTotal = cancelledItems.reduce((s, it) => s + it.amount, 0);
  const remainingTotal = remainingItems.reduce((s, it) => s + it.amount, 0);

  const cancelledTable = `
    <h2 style="font-size:14px;color:#b91c1c;margin:20px 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;">Cancelled items (${cancelledItems.length})</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      ${tableHead}
      <tbody>
        ${renderItemRows(cancelledItems, true)}
        <tr>
          <td colspan="4" style="padding:10px;text-align:right;font-weight:bold;font-size:13px;">Cancelled total:</td>
          <td style="padding:10px;text-align:right;font-weight:bold;font-size:13px;">${fmtMoney(cancelledTotal)}</td>
        </tr>
      </tbody>
    </table>`;

  const remainingTable =
    scope === "partial" && remainingItems.length > 0
      ? `
    <h2 style="font-size:14px;color:#1a3c5e;margin:20px 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;">Remaining items still on this PO (${remainingItems.length})</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      ${tableHead}
      <tbody>
        ${renderItemRows(remainingItems, false)}
        <tr>
          <td colspan="4" style="padding:10px;text-align:right;font-weight:bold;font-size:13px;">Remaining total:</td>
          <td style="padding:10px;text-align:right;font-weight:bold;font-size:13px;">${fmtMoney(remainingTotal)}</td>
        </tr>
      </tbody>
    </table>`
      : "";

  const body = `
    ${intro}
    <div style="margin-bottom:16px;">
      <p style="margin:0 0 8px 0;"><strong>PO number:</strong> ${escapeHtml(vendorOrderNumber)}</p>
      ${vendorLine}
    </div>
    ${reasonBlock}
    ${cancelledTable}
    ${remainingTable}
    <p style="margin:20px 0 0 0;font-size:13px;color:#666;">
      A revised purchase order PDF is attached for your records. Please reply to this email to confirm the cancellation, or reach us at (661) 255-9909 or <a href="mailto:sales@oasisgardenandpatio.com">sales@oasisgardenandpatio.com</a> with any questions.
    </p>
  `;

  const subject =
    scope === "full"
      ? `CANCELLED: Purchase Order ${vendorOrderNumber} — Oasis Garden & Patio`
      : `REVISED: Purchase Order ${vendorOrderNumber} — Oasis Garden & Patio`;

  const html = emailLayout(escapeHtml(headline), body, "#b91c1c");

  const filename =
    scope === "full"
      ? `PO-${vendorOrderNumber}-CANCELLED.pdf`
      : `PO-${vendorOrderNumber}-REVISED.pdf`;

  const { client, from } = await getResendClient();
  const result = await client.emails.send({
    from,
    to,
    subject,
    html,
    ...(args.pdfBuffer
      ? {
          attachments: [{ filename, content: args.pdfBuffer }],
        }
      : {}),
  });

  if (result.error) {
    logger.error(
      { err: result.error, to, subject },
      "Failed to send vendor cancellation email",
    );
    throw new Error(
      `Failed to send vendor cancellation email: ${result.error.message}`,
    );
  }
}
