import { eq } from "drizzle-orm";
import {
  db,
  ordersTable,
  customersTable,
  type Order,
} from "@workspace/db";
import { sendEmail } from "./email";
import { logger } from "./logger";

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
      <p>Great news! Your order has been confirmed and is now in our system. Our team will begin working on it soon.</p>
      <p>Thank you for choosing Oasis Garden &amp; Patio!</p>
      ${SIGNOFF}
    `,
  },
  in_production: {
    subject: (n) => `Your order is being made! (${n})`,
    title: "Your order is being made",
    body: (greeting) => `
      ${greeting}
      <p>Your order is now in production! Our team is hard at work crafting your items.</p>
      <p>Thank you for your patience!</p>
      ${SIGNOFF}
    `,
  },
  ready_for_delivery: {
    subject: (n) => `Your order is ready! (${n})`,
    title: "Ready for delivery",
    body: (greeting) => `
      ${greeting}
      <p>Your order is complete and ready for delivery! Our team will be in touch shortly to coordinate a delivery time that works for you.</p>
      <p>If you have a preferred time window or any special instructions, feel free to reply to this email.</p>
      <p>We can't wait for you to enjoy your new pieces!</p>
      ${SIGNOFF}
    `,
  },
  out_for_delivery: {
    subject: (n) => `Your order is on its way! (${n})`,
    title: "Out for delivery",
    body: (greeting) => `
      ${greeting}
      <p>Exciting news! Your order is out for delivery today. Please ensure someone is available to receive it at your delivery address.</p>
      <p>If you have any questions or need to reach us urgently, please reply to this email or call us directly.</p>
      <p>We hope you love your new items!</p>
      ${SIGNOFF}
    `,
  },
  delivered: {
    subject: (n) => `Your order has been delivered! (${n})`,
    title: "Delivered",
    body: (greeting) => `
      ${greeting}
      <p>Your order has been delivered! We hope everything arrived in perfect condition.</p>
      <p>If you have any concerns about your delivery or would like to share feedback, please don't hesitate to reach out. We'd love to hear from you!</p>
      <p>Thank you for shopping with Oasis Garden &amp; Patio.</p>
      ${SIGNOFF}
    `,
  },
  completed: {
    subject: (n) => `Your order is complete! (${n})`,
    title: "Order complete",
    body: (greeting) => `
      ${greeting}
      <p>Your order is now marked as complete. We truly appreciate your business and hope you're enjoying your new pieces from Oasis Garden &amp; Patio.</p>
      <p>If you ever need anything in the future, we're always here to help. We'd also love it if you shared a photo of your space!</p>
      <p>Thank you again for choosing us.</p>
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
  refunded: {
    subject: (n) => `Your refund has been processed (${n})`,
    title: "Refund processed",
    body: (greeting) => `
      ${greeting}
      <p>Your refund has been processed. Depending on your bank or payment provider, it may take 5 to 7 business days for the funds to appear in your account.</p>
      <p>If you have any questions about your refund or would like to discuss your order further, please don't hesitate to contact us.</p>
      <p>Thank you for your understanding, and we hope to serve you again.</p>
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
