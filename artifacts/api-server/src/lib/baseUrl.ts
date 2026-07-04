// Shared helper for building absolute customer-facing links in transactional
// emails (opt-out links, account settings links, etc). Requires BASE_URL to
// be set — we never fall back to a guessed host for links that get emailed
// out, since a wrong domain would break the link for the recipient.
export function getBaseUrl(): string {
  const baseUrl = process.env["BASE_URL"];
  if (!baseUrl) {
    throw new Error("BASE_URL environment variable is required");
  }
  return baseUrl.replace(/\/$/, "");
}
