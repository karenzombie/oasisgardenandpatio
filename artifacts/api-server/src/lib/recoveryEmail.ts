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
