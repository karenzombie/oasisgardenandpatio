import { eq } from "drizzle-orm";
import {
  db,
  ordersTable,
  customersTable,
  type Order,
} from "@workspace/db";
import { sendEmail } from "./email";
import { logger } from "./logger";

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

/**
 * Per-status customer-facing copy for order status change emails.
 *
 * Triggered from the staff portal when an agent moves an order to a new
 * status (POST /admin/orders/:id/status). Skipping a stage naturally
 * means no email is sent for it, so agents stay in control.
 *
 * Subject + body content was supplied by Oasis. Branding (logo, footer,
 * colors) comes from the shared `emailLayout` in `email.ts`.
 */
type StatusCopy = {
  subject: (orderNumber: string) => string;
  title: string;
  body: (greetingHtml: string) => string;
};

const SIGNOFF = `
  <p style="margin-top:24px;">Warm regards,<br/>The Oasis Garden &amp; Patio Team</p>
`;

const TEMPLATES: Record<string, StatusCopy> = {
  pending: {
    subject: (n) => `We received your order! (${n})`,
    title: "Order received",
    body: (greeting) => `
      ${greeting}
      <p>Thank you for your order with Oasis Garden &amp; Patio! We've received your order and it's currently being reviewed by our team.</p>
      <p>If you have any questions in the meantime, feel free to reply to this email.</p>
      ${SIGNOFF}
    `,
  },
  confirmed: {
    subject: (n) => `Your order is confirmed! (${n})`,
    title: "Order confirmed",
    body: (greeting) => `
      ${greeting}
      <p>Great news! Your order has been confirmed and has been submitted to the manufacturer.</p>
      <p>Here is what you can expect next:</p>
      <ul style="margin:0 0 16px 0;padding-left:20px;font-size:14px;">
        <li style="margin-bottom:8px;">The manufacturer will provide an estimated completion date. Please keep in mind that estimated dates are not guaranteed &mdash; we will keep you informed along the way.</li>
        <li>Once your order is ready, we will follow up with delivery details so you know exactly when to expect it.</li>
      </ul>
      <p>As always, if you have any questions in the meantime feel free to reply to this email or call us at (661) 255-9909.</p>
      <p>Thank you for choosing Oasis Garden &amp; Patio!</p>
      ${SIGNOFF}
    `,
  },
  in_production: {
    subject: (n) => `Your order is being made! (${n})`,
    title: "Your order is being made",
    body: (greeting) => `
      ${greeting}
      <p>Your order is now in production with the manufacturer. We will keep you posted as it progresses.</p>
      <p>As always, if you have any questions feel free to reply to this email or call us at (661) 255-9909.</p>
      <p>Thank you for your patience!</p>
      ${SIGNOFF}
    `,
  },
  delivered: {
    subject: (n) => `Your order has been delivered! (${n})`,
    title: "Delivered",
    body: (greeting) => `
      ${greeting}
      <p>Your order has been delivered! We hope everything arrived in perfect condition.</p>
      <p>If you have any concerns about your delivery, please do not hesitate to reach out. We are always happy to help.</p>
      <p>If you are loving your new pieces, we would really appreciate it if you took a moment to share your experience. It means a lot to a small business like ours!</p>
      <p>Leave us a review on <a href="https://www.yelp.com/biz/oasis-garden-and-patio-santa-clarita" style="color:#1a3c5e;">Yelp</a></p>
      <p>Thank you so much for shopping with Oasis Garden &amp; Patio. We hope to see you again!</p>
      ${SIGNOFF}
    `,
  },
  completed: {
    subject: (n) => `Your order is complete! (${n})`,
    title: "Order complete",
    body: (greeting) => `
      ${greeting}
      <p>Your order is now complete and we hope you are absolutely loving your new pieces from Oasis Garden &amp; Patio. We truly appreciate your business!</p>
      <p>If you ever need anything in the future, we are always here to help.</p>
      <p>We would love to see your new space! Share a photo and tag us on <a href="https://www.facebook.com/people/Oasis-Garden-Patio/100057549515695/" style="color:#1a3c5e;">Facebook</a> or <a href="https://www.instagram.com/oasisgardenandpatio/" style="color:#1a3c5e;">Instagram</a>.</p>
      <p>Leave us a review on <a href="https://www.yelp.com/biz/oasis-garden-and-patio-santa-clarita" style="color:#1a3c5e;">Yelp</a></p>
      <p>Thank you again for choosing Oasis Garden &amp; Patio. We hope to see you again soon!</p>
      ${SIGNOFF}
    `,
  },
  canceled: {
    subject: (n) => `Your order has been canceled (${n})`,
    title: "Order canceled",
    body: (greeting) => `
      ${greeting}
      <p>We're writing to let you know that your order has been canceled. If you did not request this cancellation or have any questions, please reach out to us right away.</p>
      <p>If a payment was made, any applicable refund will be processed within 5 to 7 business days.</p>
      <p>We hope to have the opportunity to serve you again in the future.</p>
      ${SIGNOFF}
    `,
  },
};

function nameOf(first: string | null, last: string | null): string | null {
  const v = [first, last].filter(Boolean).join(" ").trim();
  return v.length === 0 ? null : v;
}

/**
 * Escape user-controlled text for safe interpolation into the email
 * HTML body. Customer names come from sign-up / walk-in capture and
 * could legitimately contain `&`, `<`, etc.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Resolve the recipient (email + display name) for an order. Prefers the
 * linked customer record; falls back to walk-in fields captured on the
 * order itself for in-store orders without a customer row.
 */
async function resolveRecipient(order: Order): Promise<{
  email: string;
  name: string;
} | null> {
  if (order.customerId != null) {
    const [c] = await db
      .select({
        email: customersTable.email,
        firstName: customersTable.firstName,
        lastName: customersTable.lastName,
      })
      .from(customersTable)
      .where(eq(customersTable.id, order.customerId))
      .limit(1);
    if (c?.email) {
      return {
        email: c.email,
        name: nameOf(c.firstName, c.lastName) ?? "there",
      };
    }
  }
  if (order.walkInEmail) {
    return {
      email: order.walkInEmail,
      name: order.walkInName?.trim() || "there",
    };
  }
  return null;
}

/**
 * Send a refund notification email with optional restocking fee details.
 *
 * Called from the POST /admin/orders/:id/refund endpoint so the email can
 * include the exact amounts and a restocking-policy note when applicable.
 */
export async function sendOrderRefundEmail(
  orderId: number,
  opts: {
    grossRefundAmount: number;
    restockingFee: number | null;
    restockingFeeType: string | null;
    netRefundAmount: number;
  },
): Promise<void> {
  try {
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    if (!order) {
      logger.warn({ orderId }, "Order not found for refund email");
      return;
    }
    if (order.isInternalRestock) return;

    const recipient = await resolveRecipient(order);
    if (!recipient) {
      logger.info({ orderId }, "Skipping refund email: no email on file");
      return;
    }

    const greeting = `<p>Hi ${escapeHtml(recipient.name)},</p>`;

    let restockingNote = "";
    if (opts.restockingFee != null && opts.restockingFee > 0) {
      restockingNote = `
        <p style="background:#fff8e1;border:1px solid #ffe082;border-radius:4px;padding:12px 16px;font-size:14px;margin:16px 0;">
          <strong>Note:</strong> Your refund has been reduced by
          <strong>${fmtMoney(opts.restockingFee)}</strong> per our refund &amp;
          restocking policy. The net refund of
          <strong>${fmtMoney(opts.netRefundAmount)}</strong> will be returned to
          your original payment method.
        </p>
      `;
    }

    const bodyHtml = `
      ${greeting}
      <p>Your refund for order <strong>${escapeHtml(order.orderNumber)}</strong> has been processed.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:16px 0;">
        <tr>
          <td style="padding:6px 0;color:#555;">Gross refund amount</td>
          <td style="padding:6px 0;text-align:right;">${fmtMoney(opts.grossRefundAmount)}</td>
        </tr>
        ${
          opts.restockingFee != null && opts.restockingFee > 0
            ? `<tr>
          <td style="padding:6px 0;color:#555;">Restocking fee</td>
          <td style="padding:6px 0;text-align:right;">− ${fmtMoney(opts.restockingFee)}</td>
        </tr>
        <tr style="font-weight:bold;border-top:1px solid #e0e0e0;">
          <td style="padding:8px 0;">Net refund</td>
          <td style="padding:8px 0;text-align:right;">${fmtMoney(opts.netRefundAmount)}</td>
        </tr>`
            : ""
        }
      </table>
      ${restockingNote}
      <p>Please allow 5 to 7 business days for the funds to appear in your account.</p>
      <p>If you have any questions, please don't hesitate to contact us.</p>
      <p>Thank you for your understanding, and we hope to serve you again.</p>
      ${SIGNOFF}
      <p style="font-size:13px;color:#666;margin-top:24px;">Order reference: <strong>${escapeHtml(order.orderNumber)}</strong></p>
    `;

    await sendEmail({
      to: recipient.email,
      subject: `Your refund has been processed (${order.orderNumber})`,
      title: "Refund processed",
      bodyHtml,
    });
    logger.info(
      { orderId, orderNumber: order.orderNumber, to: recipient.email },
      "Sent order refund email",
    );
  } catch (err) {
    logger.error({ err, orderId }, "Failed to send order refund email");
  }
}

/**
 * Send a status-change email for an order. Looks up the recipient from
 * the order's linked customer (or walk-in fields). No-op + warn log if:
 *
 *   - the new status has no template (forward-compat for new statuses),
 *   - the order has no email on file (e.g. cash-only walk-in),
 *   - or this is an internal restock order (no customer involved).
 *
 * Errors are logged but never thrown — a transient email outage must not
 * fail the status-update API request.
 */
export async function sendOrderStatusEmail(
  orderId: number,
  toStatus: string,
): Promise<void> {
  try {
    const [order] = await db
      .select()
      .from(ordersTable)
      .where(eq(ordersTable.id, orderId))
      .limit(1);
    if (!order) {
      logger.warn({ orderId, toStatus }, "Order not found for status email");
      return;
    }
    if (order.isInternalRestock) {
      // Internal restocks are not customer-facing.
      return;
    }
    const tpl = TEMPLATES[toStatus];
    if (!tpl) {
      logger.warn(
        { orderId, toStatus },
        "No status email template for this status",
      );
      return;
    }
    const recipient = await resolveRecipient(order);
    if (!recipient) {
      logger.info(
        { orderId, toStatus },
        "Skipping status email: no email on file",
      );
      return;
    }
    const greeting = `<p>Hi ${escapeHtml(recipient.name)},</p>`;
    await sendEmail({
      to: recipient.email,
      subject: tpl.subject(order.orderNumber),
      title: tpl.title,
      bodyHtml: `
        ${tpl.body(greeting)}
        <p style="font-size:13px;color:#666;margin-top:24px;">Order reference: <strong>${order.orderNumber}</strong></p>
      `,
    });
    logger.info(
      { orderId, orderNumber: order.orderNumber, toStatus, to: recipient.email },
      "Sent order status email",
    );
  } catch (err) {
    logger.error(
      { err, orderId, toStatus },
      "Failed to send order status email",
    );
  }
}
