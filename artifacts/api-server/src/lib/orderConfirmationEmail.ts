import { eq, inArray } from "drizzle-orm";
import {
  db,
  ordersTable,
  orderItemsTable,
  orderItemAddonsTable,
  type Customer,
} from "@workspace/db";
import { sendEmail, getSiteBaseUrl } from "./email";
import { logger } from "./logger";

const SIGNOFF = `<p style="margin-top:24px;">Warm regards,<br/>The Oasis Garden &amp; Patio Team</p>`;

function fmtMoney(dollars: string | number | null | undefined): string {
  const n = Number(dollars ?? 0);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface OrderEmailData {
  orderNumber: string;
  subtotal: string;
  deliveryAmount: string;
  taxAmount: string;
  total: string;
  items: Array<{
    description: string;
    variantNameSnapshot: string | null;
    finishNameSnapshot: string | null;
    fabricNameSnapshot: string | null;
    quantity: number;
    unitPrice: string;
    amount: string;
    addons: Array<{
      addonNameSnapshot: string;
      quantity: number;
      amount: string;
    }>;
  }>;
}

async function loadOrderData(orderNumber: string): Promise<OrderEmailData | null> {
  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.orderNumber, orderNumber))
    .limit(1);
  if (!order) return null;

  const items = await db
    .select()
    .from(orderItemsTable)
    .where(eq(orderItemsTable.orderId, order.id));

  const addonsByItem = new Map<
    number,
    Array<{ addonNameSnapshot: string; quantity: number; amount: string }>
  >();

  const itemIds = items.map((i) => i.id);
  if (itemIds.length > 0) {
    const allAddons = await db
      .select()
      .from(orderItemAddonsTable)
      .where(inArray(orderItemAddonsTable.orderItemId, itemIds));
    for (const a of allAddons) {
      const list = addonsByItem.get(a.orderItemId) ?? [];
      list.push({
        addonNameSnapshot: a.addonNameSnapshot,
        quantity: a.quantity,
        amount: String(a.amount),
      });
      addonsByItem.set(a.orderItemId, list);
    }
  }

  return {
    orderNumber: order.orderNumber,
    subtotal: String(order.subtotal),
    deliveryAmount: String(order.deliveryAmount),
    taxAmount: String(order.taxAmount),
    total: String(order.total),
    items: items
      .filter((i) => i.parentOrderItemId == null)
      .map((i) => ({
        description: i.description,
        variantNameSnapshot: i.variantNameSnapshot,
        finishNameSnapshot: i.finishNameSnapshot,
        fabricNameSnapshot: i.fabricNameSnapshot,
        quantity: i.quantity,
        unitPrice: String(i.unitPrice),
        amount: String(i.amount),
        addons: addonsByItem.get(i.id) ?? [],
      })),
  };
}

function buildItemsTable(items: OrderEmailData["items"]): string {
  const rows = items
    .map((item) => {
      const specs = [
        item.variantNameSnapshot,
        item.finishNameSnapshot,
        item.fabricNameSnapshot,
      ]
        .filter(Boolean)
        .join(" · ");
      const addonRows = item.addons
        .map(
          (a) => `
          <tr>
            <td style="padding:4px 0 4px 16px;font-size:13px;color:#555;">
              + ${escapeHtml(a.addonNameSnapshot)}${a.quantity > 1 ? ` ×${a.quantity}` : ""}
            </td>
            <td style="padding:4px 0;text-align:right;font-size:13px;color:#555;">${fmtMoney(a.amount)}</td>
          </tr>`,
        )
        .join("");

      return `
        <tr style="border-top:1px solid #e8e2d6;">
          <td style="padding:10px 0;vertical-align:top;">
            <div style="font-weight:bold;">${escapeHtml(item.description)}</div>
            ${specs ? `<div style="font-size:12px;color:#666;margin-top:2px;">${escapeHtml(specs)}</div>` : ""}
            <div style="font-size:12px;color:#666;">Qty ${item.quantity} × ${fmtMoney(item.unitPrice)}</div>
          </td>
          <td style="padding:10px 0;text-align:right;vertical-align:top;white-space:nowrap;">${fmtMoney(item.amount)}</td>
        </tr>
        ${addonRows}`;
    })
    .join("");

  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
      ${rows}
    </table>`;
}

function buildTotalsTable(data: OrderEmailData): string {
  const shippingNum = Number(data.deliveryAmount);
  const taxNum = Number(data.taxAmount);
  return `
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
      <tr>
        <td style="padding:5px 0;color:#555;">Subtotal</td>
        <td style="padding:5px 0;text-align:right;">${fmtMoney(data.subtotal)}</td>
      </tr>
      <tr>
        <td style="padding:5px 0;color:#555;">Shipping</td>
        <td style="padding:5px 0;text-align:right;">${shippingNum === 0 ? "Free" : fmtMoney(data.deliveryAmount)}</td>
      </tr>
      ${
        taxNum > 0
          ? `<tr>
        <td style="padding:5px 0;color:#555;">Tax</td>
        <td style="padding:5px 0;text-align:right;">${fmtMoney(data.taxAmount)}</td>
      </tr>`
          : ""
      }
      <tr style="border-top:2px solid #1a3c5e;">
        <td style="padding:10px 0;font-weight:bold;font-size:16px;">Total</td>
        <td style="padding:10px 0;text-align:right;font-weight:bold;font-size:16px;">${fmtMoney(data.total)}</td>
      </tr>
    </table>`;
}

/**
 * Send an order confirmation email to the customer immediately after checkout.
 * Includes a full itemised receipt and a link to their order page.
 * Fires-and-forgets (errors are logged, never thrown).
 */
export async function sendOrderConfirmationEmail(
  customer: Pick<Customer, "email" | "firstName" | "lastName">,
  orderNumber: string,
): Promise<void> {
  try {
    const data = await loadOrderData(orderNumber);
    if (!data) {
      logger.warn({ orderNumber }, "Order not found for confirmation email");
      return;
    }

    const name = [customer.firstName, customer.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || "there";

    const baseUrl = getSiteBaseUrl();
    const orderUrl = baseUrl
      ? `${baseUrl}/order-confirmation/${encodeURIComponent(orderNumber)}`
      : null;

    const bodyHtml = `
      <p>Hi ${escapeHtml(name)},</p>
      <p>Thank you for your order with Oasis Garden &amp; Patio! We have received it and will be in touch if we have any questions before it goes into production.</p>
      <p>Please take a moment to review our <a href="${baseUrl ?? ""}/shipping-returns.pdf" style="color:#1a3c5e;">Shipping, Returns and Cancellation Policy</a> for information about your order.</p>
      <h2 style="font-size:16px;color:#1a3c5e;margin:24px 0 8px;">Order ${escapeHtml(orderNumber)}</h2>
      ${buildItemsTable(data.items)}
      ${buildTotalsTable(data)}
      <p style="font-size:13px;color:#555;">Questions? Reply to this email or call us at (661) 255-9909.</p>
      ${orderUrl ? `<p style="text-align:center;margin:28px 0;"><a href="${orderUrl}" style="display:inline-block;background:#5b8a72;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;letter-spacing:1px;">View Order</a></p>` : ""}
      ${SIGNOFF}
    `;

    await sendEmail({
      to: customer.email,
      subject: `Your order has been received! (${orderNumber})`,
      title: "Order received",
      bodyHtml,
    });
    logger.info({ orderNumber, to: customer.email }, "Sent order confirmation email");
  } catch (err) {
    logger.error({ err, orderNumber }, "Failed to send order confirmation email");
  }
}

/**
 * Notify the store (ADMIN_EMAIL env var) that a new customer order was placed.
 * Includes customer info, a full item list, and a direct link to the staff order detail.
 * Fires-and-forgets (errors are logged, never thrown).
 */
export async function sendStoreNewOrderNotification(
  customer: Pick<Customer, "email" | "firstName" | "lastName">,
  orderNumber: string,
): Promise<void> {
  const adminEmail = process.env["ADMIN_EMAIL"];
  if (!adminEmail) {
    logger.warn(
      { orderNumber },
      "ADMIN_EMAIL not set; skipping store new-order notification",
    );
    return;
  }

  try {
    const data = await loadOrderData(orderNumber);
    if (!data) {
      logger.warn({ orderNumber }, "Order not found for store notification");
      return;
    }

    const customerName = [customer.firstName, customer.lastName]
      .filter(Boolean)
      .join(" ")
      .trim() || "(no name)";

    const baseUrl = getSiteBaseUrl();
    const staffUrl = baseUrl
      ? `${baseUrl}/staff/orders/${encodeURIComponent(orderNumber)}`
      : null;

    const bodyHtml = `
      <p>A new customer order has been placed on the website.</p>
      <p>Please complete the following steps to process this order:</p>
      <ol style="margin:0 0 16px 0;padding-left:20px;font-size:14px;">
        <li style="margin-bottom:4px;">Review the order for accuracy (items, address, and pricing)</li>
        <li style="margin-bottom:4px;">Update the order status to Pending</li>
        <li>Review and send the purchase order to the vendor</li>
      </ol>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;background:#f9f7f4;border-radius:4px;padding:12px;">
        <tr><td style="padding:5px 8px;color:#555;width:140px;">Order number</td><td style="padding:5px 8px;font-weight:bold;">${escapeHtml(orderNumber)}</td></tr>
        <tr><td style="padding:5px 8px;color:#555;">Customer name</td><td style="padding:5px 8px;">${escapeHtml(customerName)}</td></tr>
        <tr><td style="padding:5px 8px;color:#555;">Customer email</td><td style="padding:5px 8px;">${escapeHtml(customer.email)}</td></tr>
        <tr><td style="padding:5px 8px;color:#555;">Order total</td><td style="padding:5px 8px;font-weight:bold;">${fmtMoney(data.total)}</td></tr>
      </table>
      <h2 style="font-size:16px;color:#1a3c5e;margin:24px 0 8px;">Items ordered</h2>
      ${buildItemsTable(data.items)}
      ${buildTotalsTable(data)}
      ${staffUrl ? `<p style="text-align:center;margin:28px 0;"><a href="${staffUrl}" style="display:inline-block;background:#1a3c5e;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;letter-spacing:1px;">View Order in Staff Portal</a></p>` : ""}
    `;

    await sendEmail({
      to: adminEmail,
      subject: `New online order: ${orderNumber}`,
      title: "New customer order",
      bodyHtml,
    });
    logger.info({ orderNumber, to: adminEmail }, "Sent store new-order notification");
  } catch (err) {
    logger.error({ err, orderNumber }, "Failed to send store new-order notification");
  }
}
