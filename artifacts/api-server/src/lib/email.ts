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

function emailLayout(title: string, body: string): string {
  return `<!DOCTYPE html>
<html>
  <body style="margin:0;padding:0;background:#f5f3ee;font-family:Georgia,'Times New Roman',serif;color:#3a3a3a;">
    <div style="max-width:560px;margin:0 auto;padding:32px 24px;">
      <div style="text-align:center;margin-bottom:32px;">
        <div style="font-size:28px;letter-spacing:2px;font-weight:bold;color:#1a3c5e;">OASIS</div>
        <div style="font-size:14px;font-style:italic;color:#5b8a72;">Garden &amp; Patio</div>
      </div>
      <div style="background:#ffffff;padding:32px 28px;border-radius:4px;border:1px solid #e8e2d6;">
        <h1 style="font-size:22px;color:#1a3c5e;margin:0 0 16px 0;">${title}</h1>
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
  const result = await client.emails.send({
    from,
    to,
    subject,
    html: emailLayout(title, bodyHtml),
  });
  if (result.error) {
    logger.error({ err: result.error, to, subject }, "Failed to send email");
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
