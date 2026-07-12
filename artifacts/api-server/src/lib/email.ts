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
  <body style="margin:0;padding:0;background-color:#aec4ba;background:#aec4ba;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#3a3a3a;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:32px;">
        ${logoHtml}
      </div>
      <div style="background:#ffffff;padding:32px 28px;border-radius:4px;border:1px solid #e8e2d6;">
        <h1 style="font-size:22px;color:${titleColor};margin:0 0 16px 0;">${title}</h1>
        ${body}
      </div>
      <div style="text-align:center;margin-top:24px;font-size:14px;color:#000000;">
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

export interface SendWishlistDisclosureEmailArgs {
  to: string;
  firstName: string | null;
  productName: string;
  optOutUrl: string;
  accountSettingsUrl: string;
}

export async function sendWishlistDisclosureEmail({
  to,
  firstName,
  productName,
  optOutUrl,
  accountSettingsUrl,
}: SendWishlistDisclosureEmailArgs): Promise<void> {
  const { client, from } = await getResendClient();
  const greeting = firstName ? `Hi ${firstName}!` : "Hi there!";
  const body = `
    <p>${greeting}</p>
    <p>Great choice! You just saved ${productName} to your wishlist, and we are so glad you did.</p>
    <p>At Oasis Garden &amp; Patio, we take a personal approach to helping customers create their perfect outdoor space. Because you saved this item while signed in to your account, one of our team members may reach out to share more details, answer questions, or let you know about promotions and events we think you will love.</p>
    <p><strong>You are in control of this preference.</strong> If you would prefer that we not contact you about your wishlist or send you promotional emails, just click the link below to opt out. You can also update this preference any time in your account settings -- it takes just a second.</p>
    ${buttonLink(optOutUrl, "Opt Out of Marketing Contact")}
    <p style="font-size:13px;color:#666;"><strong>Please note:</strong> Wishlist prices reflect current pricing and are not guaranteed. Product availability is subject to change at the manufacturer's discretion. For a firm price quote, contact us -- quotes are honored for 30 days from the date of issue.</p>
    <p style="font-size:13px;color:#666;">The marketing contact preference above applies to wishlist follow-ups and promotional emails only. It does not affect your order confirmations, shipping updates, delivery notifications, or any other emails related to a purchase you have placed. Those will always reach you no matter what.</p>
    <p>Questions? We would love to hear from you!</p>
    <p>Phone: (661) 255-9909<br />Email: sales@oasisgardenandpatio.com</p>
    <p>Thanks for shopping with us!</p>
    <p style="font-size:13px;color:#666;">To manage your contact preferences, visit your <a href="${accountSettingsUrl}">account settings</a> at any time. To opt out of marketing contact, click the opt-out link in this email.</p>
  `;

  const result = await client.emails.send({
    from,
    to,
    subject: `You saved something you love at ${BRAND_NAME}!`,
    html: emailLayout("You saved something you love!", body),
  });

  if (result.error) {
    logger.error(
      { err: result.error, to },
      "Failed to send wishlist disclosure email",
    );
    throw new Error(
      `Failed to send wishlist disclosure email: ${result.error.message}`,
    );
  }
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export interface WishlistReachOutItem {
  name: string;
  variantLabel: string | null;
  // Live sale-or-MSRP price, already gated on show_price_online = true by the
  // caller. Null items never render a price (inquiry/call-for-pricing mode).
  price: number | null;
}

export interface WishlistReachOutEmailBodyArgs {
  firstName: string | null;
  items: WishlistReachOutItem[];
  personalNote: string | null;
  accountSettingsUrl: string;
}

// Shared by both the staff preview endpoint and the actual send, so what
// staff preview is exactly what gets emailed (Brief 7, Step 6).
export function renderWishlistReachOutEmailBody({
  firstName,
  items,
  personalNote,
  accountSettingsUrl,
}: WishlistReachOutEmailBodyArgs): string {
  const greeting = firstName ? `Hi ${escapeHtml(firstName)},` : "Hi there,";

  const itemsHtml = items
    .map((item) => {
      const variantHtml = item.variantLabel
        ? `<div style="font-size:13px;color:#666;">${escapeHtml(item.variantLabel)}</div>`
        : "";
      const priceHtml =
        item.price !== null
          ? ` &mdash; ${formatUsd(item.price)}`
          : "";
      return `<li style="margin-bottom:12px;"><strong>${escapeHtml(item.name)}</strong>${priceHtml}${variantHtml}</li>`;
    })
    .join("");

  const trimmedNote = personalNote?.trim() ?? "";
  const noteHtml = trimmedNote
    ? `
    <hr style="border:none;border-top:1px solid #e8e2d6;margin:24px 0;" />
    <p><strong>A note from our team:</strong></p>
    <p>${escapeHtml(trimmedNote).replace(/\n/g, "<br />")}</p>
  `
    : "";

  return `
    <p>${greeting}</p>
    <p>Your outdoor space is about to get a whole lot better! We noticed you have been saving some beautiful pieces to your wishlist at ${BRAND_NAME}, and we could not wait to reach out.</p>
    <p>Here is what you have been eyeing:</p>
    <ul style="padding-left:20px;margin:16px 0;">${itemsHtml}</ul>
    <p>Great taste! Whether you want to see any of these pieces in person at our showroom, have questions about options and customization, or are ready to make it happen, we are here and excited to help you bring it all together.</p>
    <p>Phone: (661) 255-9909<br />Email: sales@oasisgardenandpatio.com</p>
    ${noteHtml}
    <hr style="border:none;border-top:1px solid #e8e2d6;margin:24px 0;" />
    <p style="font-size:13px;color:#666;">Please note that wishlist prices reflect current pricing and are not guaranteed. Product availability is subject to change at the manufacturer's discretion. For a firm price quote, contact us -- quotes are honored for 30 days from the date of issue.</p>
    <p style="font-size:13px;color:#666;">If you would prefer not to receive messages like this, you can update your marketing contact preference at any time in your <a href="${accountSettingsUrl}">account settings</a>.</p>
  `;
}

export interface SendWishlistReachOutEmailArgs
  extends WishlistReachOutEmailBodyArgs {
  to: string;
}

export async function sendWishlistReachOutEmail({
  to,
  ...bodyArgs
}: SendWishlistReachOutEmailArgs): Promise<void> {
  await sendEmail({
    to,
    subject: `Your ${BRAND_NAME} Wishlist`,
    title: "Your Wishlist",
    bodyHtml: renderWishlistReachOutEmailBody(bodyArgs),
  });
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
