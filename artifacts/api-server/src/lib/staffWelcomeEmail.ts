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
      <table style="width:100%;border-collapse:collapse;font-size:15px;margin:20px 0;background:#f9f7f4;border-radius:4px;">
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
      <div style="background:#fff8e1;border:1px solid #ffe082;border-radius:4px;padding:12px 16px;font-size:15px;color:#7a5c00;margin:16px 0;">
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
