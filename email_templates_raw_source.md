# Email Templates — Full Raw Source Export

Read-only export. No files were modified. Each section below contains the complete, unmodified source of one file.

---

## 1. `artifacts/api-server/src/lib/email.ts`

```typescript
import { Resend } from "resend";
import { logger } from "./logger";

interface ResendCredentials {
  apiKey: string;
  fromEmail: string;
}

const DEFAULT_FROM_EMAIL = "onboarding@resend.dev";

async function getResendCredentials(): Promise<ResendCredentials> {
  const directApiKey =
    process.env["Resend_API"] ??
    process.env["RESEND_API"] ??
    process.env["RESEND_API_KEY"];

  if (directApiKey) {
    return {
      apiKey: directApiKey,
      fromEmail: process.env["RESEND_FROM_EMAIL"] ?? DEFAULT_FROM_EMAIL,
    };
  }

  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Resend not configured: set Resend_API secret or connect the Resend integration",
    );
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
    apiKey: data.settings.api_key,
    fromEmail: data.settings.from_email ?? DEFAULT_FROM_EMAIL,
  };
}

async function getResendClient(): Promise<{ client: Resend; from: string }> {
  const { apiKey, fromEmail } = await getResendCredentials();
  return { client: new Resend(apiKey), from: fromEmail };
}

const BRAND_NAME = "Oasis Garden & Patio";

export function getSiteBaseUrl(): string | null {
  const domains = process.env["REPLIT_DOMAINS"];
  if (!domains) return null;
  const first = domains.split(",")[0]?.trim();
  return first ? `https://${first}` : null;
}

export function emailLayout(title: string, body: string, titleColor = "#1a3c5e"): string {
  const baseUrl = getSiteBaseUrl();
  const logoHtml = baseUrl
    ? `<img src="${baseUrl}/logo.png" alt="Oasis Garden &amp; Patio" style="height:64px;width:auto;display:block;margin:0 auto;" />`
    : `<div style="font-size:28px;letter-spacing:2px;font-weight:bold;color:#1a3c5e;">OASIS</div>
        <div style="font-size:14px;font-style:italic;color:#5b8a72;">Garden &amp; Patio</div>`;
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f3ee;font-family:Georgia,'Times New Roman',serif;color:#3a3a3a;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:32px;">
        ${logoHtml}
      </div>
      <div style="background:#ffffff;padding:32px 28px;border-radius:4px;border:1px solid #e8e2d6;">
        <h1 style="font-size:22px;color:${titleColor};margin:0 0 16px 0;">${title}</h1>
        ${body}
      </div>
      <div style="text-align:center;margin-top:24px;font-size:12px;color:#8a8a8a;">
        <p style="margin:4px 0;">${BRAND_NAME}</p>
        <p style="margin:4px 0;">21182 Centre Pointe Pkwy #100, Santa Clarita, CA 91350</p>
        <p style="margin:4px 0;">(661) 255-9909 &middot; sales@oasisgardenandpatio.com</p>
      </div>
    </div>
  </body>
</html>`;
}

function buttonLink(url: string, label: string): string {
  return `<p style="text-align:center;margin:28px 0;">
    <a href="${url}" style="display:inline-block;background:#5b8a72;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;letter-spacing:1px;">${label}</a>
  </p>`;
}

export interface SendEmailArgs {
  to: string;
  subject: string;
  title: string;
  bodyHtml: string;
}

export async function sendEmail({
  to,
  subject,
  title,
  bodyHtml,
}: SendEmailArgs): Promise<void> {
  const { client, from } = await getResendClient();

  // Test-mode redirect: while Resend is unverified it can only deliver to the
  // account owner. If EMAIL_TEST_REDIRECT_TO is set, route every email there
  // so all transactional emails are demonstrable from a single inbox. The
  // original intended recipient is preserved in the subject + a banner so the
  // routing stays obvious. Remove this env var once a sender domain is
  // verified and emails should reach real recipients.
  const redirectTo = process.env["EMAIL_TEST_REDIRECT_TO"]?.trim();
  const effectiveTo = redirectTo && redirectTo.length > 0 ? redirectTo : to;
  const effectiveSubject =
    effectiveTo === to ? subject : `[→ ${to}] ${subject}`;
  const redirectBanner =
    effectiveTo === to
      ? ""
      : `<div style="background:#fff8e1;border:1px solid #ffe082;border-radius:4px;padding:10px 14px;font-size:13px;color:#7a5c00;margin-bottom:16px;font-family:Arial,sans-serif;">
          <strong>Test mode:</strong> This email was intended for <strong>${to}</strong> but was redirected here because the sending domain is not yet verified.
        </div>`;

  const result = await client.emails.send({
    from,
    to: effectiveTo,
    subject: effectiveSubject,
    html: emailLayout(title, `${redirectBanner}${bodyHtml}`),
  });
  if (result.error) {
    logger.error(
      { err: result.error, to: effectiveTo, subject: effectiveSubject },
      "Failed to send email",
    );
    throw new Error(`Failed to send email: ${result.error.message}`);
  }
}

export interface SendVerificationEmailArgs {
  to: string;
  firstName: string | null;
  verificationUrl: string;
}

export async function sendVerificationEmail({
  to,
  firstName,
  verificationUrl,
}: SendVerificationEmailArgs): Promise<void> {
  const { client, from } = await getResendClient();
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";
  const body = `
    <p>${greeting}</p>
    <p>Welcome to ${BRAND_NAME}. Please confirm your email address to complete your account setup.</p>
    ${buttonLink(verificationUrl, "Verify Email")}
    <p style="font-size:13px;color:#666;">This link expires in 24 hours. If you did not create an account, you can safely ignore this email.</p>
  `;

  const result = await client.emails.send({
    from,
    to,
    subject: `Verify your ${BRAND_NAME} account`,
    html: emailLayout("Confirm your email", body),
  });

  if (result.error) {
    logger.error({ err: result.error, to }, "Failed to send verification email");
    throw new Error(`Failed to send verification email: ${result.error.message}`);
  }
}

export interface SendEmailChangeCodeArgs {
  to: string;
  firstName: string | null;
  code: string;
}

export async function sendEmailChangeCode({
  to,
  firstName,
  code,
}: SendEmailChangeCodeArgs): Promise<void> {
  const { client, from } = await getResendClient();
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";
  const body = `
    <p>${greeting}</p>
    <p>We received a request to change the email address on your ${BRAND_NAME} account to this one. Enter the code below to confirm the change.</p>
    <p style="font-size:32px;font-weight:700;letter-spacing:8px;text-align:center;margin:24px 0;color:#1a3c5e;">${code}</p>
    <p style="font-size:13px;color:#666;">This code expires in 30 minutes. If you did not request this change, you can safely ignore this email and your account will be unchanged.</p>
  `;

  const result = await client.emails.send({
    from,
    to,
    subject: `Confirm your new ${BRAND_NAME} email address`,
    html: emailLayout("Confirm your new email", body),
  });

  if (result.error) {
    logger.error({ err: result.error, to }, "Failed to send email change code");
    throw new Error(`Failed to send email change code: ${result.error.message}`);
  }
}

export interface SendPasswordResetEmailArgs {
  to: string;
  firstName: string | null;
  resetUrl: string;
}

export async function sendPasswordResetEmail({
  to,
  firstName,
  resetUrl,
}: SendPasswordResetEmailArgs): Promise<void> {
  const { client, from } = await getResendClient();
  const greeting = firstName ? `Hi ${firstName},` : "Hello,";
  const body = `
    <p>${greeting}</p>
    <p>We received a request to reset the password for your ${BRAND_NAME} account.</p>
    ${buttonLink(resetUrl, "Reset Password")}
    <p style="font-size:13px;color:#666;">This link expires in 1 hour. If you did not request a password reset, no action is needed and your password will remain unchanged.</p>
  `;

  const result = await client.emails.send({
    from,
    to,
    subject: `Reset your ${BRAND_NAME} password`,
    html: emailLayout("Reset your password", body),
  });

  if (result.error) {
    logger.error({ err: result.error, to }, "Failed to send password reset email");
    throw new Error(`Failed to send password reset email: ${result.error.message}`);
  }
}
```

---

## 2. `artifacts/api-server/src/lib/orderConfirmationEmail.ts`

```typescript
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
      <p>Thank you for your order with Oasis Garden &amp; Patio! We've received it and our team will be in touch soon to confirm details and schedule delivery.</p>
      <h2 style="font-size:16px;color:#1a3c5e;margin:24px 0 8px;">Order ${escapeHtml(orderNumber)}</h2>
      ${buildItemsTable(data.items)}
      ${buildTotalsTable(data)}
      <p style="font-size:13px;color:#555;">Questions? Reply to this email or call us at (661) 255-9909.</p>
      ${orderUrl ? `<p style="text-align:center;margin:28px 0;"><a href="${orderUrl}" style="display:inline-block;background:#5b8a72;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;letter-spacing:1px;">View Order</a></p>` : ""}
      ${SIGNOFF}
    `;

    await sendEmail({
      to: customer.email,
      subject: `Your order has been placed! (${orderNumber})`,
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
```

---

## 3. `artifacts/api-server/src/lib/orderStatusEmail.ts`

```typescript
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
```

---

## 4. `artifacts/api-server/src/lib/cushionEmail.ts`

```typescript
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
```

---

## 5. `artifacts/api-server/src/lib/vendorOrderEmail.ts`

```typescript
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
  // Add-on snapshots (e.g. Marella privacy walls) ordered alongside the
  // parent line. Rendered as indented SKU/name/qty sub-rows — NEVER with
  // pricing (hard client rule: no pricing on vendor documents).
  addons?: Array<{ sku: string | null; name: string; quantity: number }>;
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
      const addonRows = (it.addons ?? [])
        .map(
          (ad) => `
        <tr>
          <td style="padding:8px 10px 8px 24px;border-bottom:1px solid #e8e2d6;font-size:13px;">${escapeHtml(ad.sku ?? "")}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;">Add-on: ${escapeHtml(ad.name)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;text-align:center;">${ad.quantity}</td>
        </tr>`,
        )
        .join("");
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;">${escapeHtml(sku)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;">${escapeHtml(desc || "—")}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;text-align:center;">${it.quantity}</td>
        </tr>
        ${addonRows}
        ${it.notes ? `<tr><td colspan="3" style="padding:0 10px 8px 10px;font-size:12px;color:#666;border-bottom:1px solid #e8e2d6;font-style:italic;">Note: ${escapeHtml(it.notes)}</td></tr>` : ""}
      `;
    })
    .join("");

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
        </tr>
      </thead>
      <tbody>
        ${itemRows}
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
      const addonRows = (it.addons ?? [])
        .map(
          (ad) => `
        <tr>
          <td style="padding:8px 10px 8px 24px;border-bottom:1px solid #e8e2d6;font-size:13px;${cellStyle}">${escapeHtml(ad.sku ?? "")}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;${cellStyle}">Add-on: ${escapeHtml(ad.name)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;text-align:center;${cellStyle}">${ad.quantity}</td>
        </tr>`,
        )
        .join("");
      return `
        <tr>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;${cellStyle}">${escapeHtml(sku)}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;${cellStyle}">${escapeHtml(desc || "—")}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e8e2d6;font-size:13px;text-align:center;${cellStyle}">${it.quantity}</td>
        </tr>
        ${addonRows}
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
      </tr>
    </thead>`;

  const cancelledTable = `
    <h2 style="font-size:14px;color:#b91c1c;margin:20px 0 8px 0;text-transform:uppercase;letter-spacing:0.5px;">Cancelled items (${cancelledItems.length})</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      ${tableHead}
      <tbody>
        ${renderItemRows(cancelledItems, true)}
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
```

---

## 6. `artifacts/api-server/src/lib/staffWelcomeEmail.ts`

```typescript
import { sendEmail, getSiteBaseUrl } from "./email";
import { logger } from "./logger";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Send a welcome / credential email to a newly created staff user.
 * Contains their login email, temporary password, and a link to the
 * staff portal. They are prompted to change their password on first sign-in.
 *
 * Fires-and-forgets — a transient email failure must never fail the
 * user-creation API response.
 */
export async function sendStaffWelcomeEmail(opts: {
  email: string;
  firstName: string | null;
  lastName: string | null;
  temporaryPassword: string;
  role: string;
}): Promise<void> {
  try {
    const name = [opts.firstName, opts.lastName]
      .filter(Boolean)
      .join(" ")
      .trim();
    const greeting = name
      ? `<p>Hi ${escapeHtml(name)},</p>`
      : `<p>Hi there,</p>`;

    const baseUrl = getSiteBaseUrl();
    const loginUrl = baseUrl ? `${baseUrl}/staff` : null;
    const roleLabel =
      opts.role === "admin"
        ? "Administrator"
        : opts.role === "agent"
          ? "Sales Agent"
          : opts.role.charAt(0).toUpperCase() + opts.role.slice(1);

    const bodyHtml = `
      ${greeting}
      <p>A staff account has been created for you on the Oasis Garden &amp; Patio portal. Your login credentials are below.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin:20px 0;background:#f9f7f4;border-radius:4px;">
        <tr>
          <td style="padding:10px 14px;color:#555;width:160px;border-bottom:1px solid #e8e2d6;">Email</td>
          <td style="padding:10px 14px;font-weight:bold;border-bottom:1px solid #e8e2d6;">${escapeHtml(opts.email)}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#555;border-bottom:1px solid #e8e2d6;">Temporary password</td>
          <td style="padding:10px 14px;font-family:monospace;font-size:16px;letter-spacing:1px;font-weight:bold;border-bottom:1px solid #e8e2d6;">${escapeHtml(opts.temporaryPassword)}</td>
        </tr>
        <tr>
          <td style="padding:10px 14px;color:#555;">Role</td>
          <td style="padding:10px 14px;">${escapeHtml(roleLabel)}</td>
        </tr>
      </table>
      <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:4px;padding:12px 16px;font-size:14px;color:#7a5c00;margin:16px 0;">
        <strong>Action required:</strong> You will be prompted to set a new password the first time you sign in. Please keep this email secure and do not share your credentials.
      </div>
      ${loginUrl ? `<p style="text-align:center;margin:28px 0;"><a href="${loginUrl}" style="display:inline-block;background:#1a3c5e;color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;letter-spacing:1px;">Sign in to Staff Portal</a></p>` : ""}
      <p>If you have any questions, please contact your administrator.</p>
      <p style="margin-top:24px;">Warm regards,<br/>The Oasis Garden &amp; Patio Team</p>
    `;

    await sendEmail({
      to: opts.email,
      subject: "Your Oasis Garden & Patio staff account is ready",
      title: "Welcome to the staff portal",
      bodyHtml,
    });
    logger.info(
      { to: opts.email, role: opts.role },
      "Sent staff welcome email",
    );
  } catch (err) {
    logger.error({ err, to: opts.email }, "Failed to send staff welcome email");
  }
}
```

---

## 7. `artifacts/api-server/src/lib/recoveryEmail.ts`

```typescript
import { Resend } from "resend";
import { logger } from "./logger";

interface ResendCredentials {
  apiKey: string;
  fromEmail: string;
}

const DEFAULT_FROM_EMAIL = "onboarding@resend.dev";
const BRAND_NAME = "Oasis Garden & Patio";

async function getResendCredentials(): Promise<ResendCredentials> {
  const directApiKey =
    process.env["Resend_API"] ??
    process.env["RESEND_API"] ??
    process.env["RESEND_API_KEY"];

  if (directApiKey) {
    return {
      apiKey: directApiKey,
      fromEmail: process.env["RESEND_FROM_EMAIL"] ?? DEFAULT_FROM_EMAIL,
    };
  }

  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Resend not configured: set Resend_API secret or connect the Resend integration",
    );
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
    apiKey: data.settings.api_key,
    fromEmail: data.settings.from_email ?? DEFAULT_FROM_EMAIL,
  };
}

async function getResendClient(): Promise<{ client: Resend; from: string }> {
  const { apiKey, fromEmail } = await getResendCredentials();
  return { client: new Resend(apiKey), from: fromEmail };
}

function getSiteBaseUrl(): string | null {
  const domains = process.env["REPLIT_DOMAINS"];
  if (!domains) return null;
  const first = domains.split(",")[0]?.trim();
  return first ? `https://${first}` : null;
}

function emailLayout(title: string, body: string): string {
  const baseUrl = getSiteBaseUrl();
  const logoHtml = baseUrl
    ? `<img src="${baseUrl}/logo.png" alt="Oasis Garden &amp; Patio" style="height:64px;width:auto;display:block;margin:0 auto;" />`
    : `<div style="font-size:28px;letter-spacing:2px;font-weight:bold;color:#1a3c5e;">OASIS</div>
        <div style="font-size:14px;font-style:italic;color:#5b8a72;">Garden &amp; Patio</div>`;
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f3ee;font-family:Georgia,'Times New Roman',serif;color:#3a3a3a;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:32px;">
        ${logoHtml}
      </div>
      <div style="background:#ffffff;padding:32px 28px;border-radius:4px;border:1px solid #e8e2d6;">
        <h1 style="font-size:22px;color:#1a3c5e;margin:0 0 16px 0;">${title}</h1>
        ${body}
      </div>
      <div style="text-align:center;margin-top:24px;font-size:12px;color:#8a8a8a;">
        <p style="margin:4px 0;">${BRAND_NAME} &middot; staff security notice</p>
      </div>
    </div>
  </body>
</html>`;
}

function buttonLink(url: string, label: string, color = "#5b8a72"): string {
  return `<p style="text-align:center;margin:28px 0;">
    <a href="${url}" style="display:inline-block;background:${color};color:#ffffff;text-decoration:none;padding:12px 28px;border-radius:4px;font-family:Arial,sans-serif;font-size:14px;letter-spacing:1px;">${label}</a>
  </p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(d: Date): string {
  return d.toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export interface RecoveryRequestedArgs {
  to: string;
  recoveryUrl: string;
  availableAt: Date;
  expiresAt: Date;
  requestIp: string | null;
  requestUserAgent: string | null;
}

export async function sendRecoveryRequestedEmail(
  args: RecoveryRequestedArgs,
): Promise<void> {
  const { client, from } = await getResendClient();
  const body = `
    <p>A staff account recovery was requested for this email address.</p>
    <p>For security, the link below will <strong>not work until ${fmt(args.availableAt)} (Pacific)</strong> — about one hour from now. After that it remains usable until ${fmt(args.expiresAt)}.</p>
    ${buttonLink(args.recoveryUrl, "Open recovery link")}
    <p style="font-size:13px;color:#666;">
      Request details:<br>
      &nbsp;&nbsp;IP: ${escapeHtml(args.requestIp ?? "unknown")}<br>
      &nbsp;&nbsp;Browser: ${escapeHtml((args.requestUserAgent ?? "unknown").slice(0, 200))}
    </p>
    <p style="font-size:13px;color:#a33;">
      <strong>If you did not request this</strong>, ignore this email and notify another administrator immediately so they can cancel the request from the admin portal.
    </p>
  `;
  const result = await client.emails.send({
    from,
    to: args.to,
    subject: `Staff account recovery requested — ${BRAND_NAME}`,
    html: emailLayout("Staff account recovery requested", body),
  });
  if (result.error) {
    logger.error(
      { err: result.error, to: args.to },
      "Failed to send staff recovery requested email",
    );
    throw new Error(
      `Failed to send recovery requested email: ${result.error.message}`,
    );
  }
}

export interface RecoveryAlertArgs {
  to: string;
  targetEmail: string;
  cancelUrl: string;
  availableAt: Date;
  requestIp: string | null;
  requestUserAgent: string | null;
}

export async function sendRecoveryAlertEmail(
  args: RecoveryAlertArgs,
): Promise<void> {
  const { client, from } = await getResendClient();
  const body = `
    <p>A staff account recovery was just requested for <strong>${args.targetEmail}</strong>.</p>
    <p>If this is legitimate (the user is locked out), no action is needed — the link they received will become usable at <strong>${fmt(args.availableAt)} (Pacific)</strong>.</p>
    <p>If this looks suspicious, cancel it now from the admin portal:</p>
    ${buttonLink(args.cancelUrl, "Review recovery requests", "#a33")}
    <p style="font-size:13px;color:#666;">
      Request details:<br>
      &nbsp;&nbsp;IP: ${escapeHtml(args.requestIp ?? "unknown")}<br>
      &nbsp;&nbsp;Browser: ${escapeHtml((args.requestUserAgent ?? "unknown").slice(0, 200))}
    </p>
  `;
  const result = await client.emails.send({
    from,
    to: args.to,
    subject: `[Action may be needed] Recovery requested for ${args.targetEmail}`,
    html: emailLayout("Staff recovery request — review", body),
  });
  if (result.error) {
    logger.error(
      { err: result.error, to: args.to },
      "Failed to send staff recovery alert email",
    );
    throw new Error(
      `Failed to send recovery alert email: ${result.error.message}`,
    );
  }
}

export interface RecoveryFinalizedArgs {
  to: string;
  reason: "completed" | "cancelled";
  cancelledByEmail?: string | null;
}

export async function sendRecoveryFinalizedEmail(
  args: RecoveryFinalizedArgs,
): Promise<void> {
  const { client, from } = await getResendClient();
  const isCompleted = args.reason === "completed";
  const title = isCompleted
    ? "Your staff account was reset"
    : "Your recovery request was cancelled";
  const body = isCompleted
    ? `
      <p>The recovery link for your staff account was just used to set a new password and reset two-factor authentication.</p>
      <p>If this was you, you're all set — sign in at the staff portal and you'll be walked through enrolling a new authenticator app.</p>
      <p style="font-size:13px;color:#a33;"><strong>If this was NOT you</strong>, contact another administrator immediately.</p>
    `
    : `
      <p>The recovery request you made for your staff account was cancelled${args.cancelledByEmail ? ` by <strong>${args.cancelledByEmail}</strong>` : ""}.</p>
      <p>If you are genuinely locked out, please contact another administrator or submit a new recovery request.</p>
    `;
  const result = await client.emails.send({
    from,
    to: args.to,
    subject: isCompleted
      ? `Your ${BRAND_NAME} staff account was reset`
      : `Your ${BRAND_NAME} recovery request was cancelled`,
    html: emailLayout(title, body),
  });
  if (result.error) {
    logger.error(
      { err: result.error, to: args.to },
      "Failed to send staff recovery finalized email",
    );
    throw new Error(
      `Failed to send recovery finalized email: ${result.error.message}`,
    );
  }
}

export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const head = local.slice(0, 2);
  const dotIdx = domain.lastIndexOf(".");
  const tld = dotIdx >= 0 ? domain.slice(dotIdx) : "";
  const domainHead = dotIdx >= 0 ? domain.slice(0, 1) : domain.slice(0, 1);
  return `${head}***@${domainHead}***${tld}`;
}
```
