import { createHmac, timingSafeEqual } from "node:crypto";

// Signed opt-out tokens for the wishlist disclosure email (Brief 7, Step 4).
// Reuses SESSION_SECRET (already required at boot by lib/session.ts) rather
// than introducing a second secret. No JWT library is in this project's
// dependency tree, so this implements the minimal equivalent: a base64url
// JSON payload + HMAC-SHA256 signature, with a 30-day expiry as required by
// CAN-SPAM (opt-out mechanisms must remain functional for >=30 days).
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface OptOutTokenPayload {
  customerId: number;
  exp: number;
}

function getSecret(): string {
  const secret = process.env["SESSION_SECRET"];
  if (!secret) {
    throw new Error("SESSION_SECRET environment variable is required");
  }
  return secret;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string {
  return Buffer.from(input, "base64url").toString("utf8");
}

function sign(payloadEncoded: string): string {
  return createHmac("sha256", getSecret()).update(payloadEncoded).digest("base64url");
}

export function signOptOutToken(customerId: number): string {
  const payload: OptOutTokenPayload = {
    customerId,
    exp: Date.now() + TOKEN_TTL_MS,
  };
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(payloadEncoded);
  return `${payloadEncoded}.${signature}`;
}

export function verifyOptOutToken(token: string): { customerId: number } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadEncoded, signature] = parts;
  if (!payloadEncoded || !signature) return null;

  const expectedSignature = sign(payloadEncoded);
  const expectedBuf = Buffer.from(expectedSignature);
  const actualBuf = Buffer.from(signature);
  if (
    expectedBuf.length !== actualBuf.length ||
    !timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return null;
  }

  let payload: OptOutTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecode(payloadEncoded)) as OptOutTokenPayload;
  } catch {
    return null;
  }

  if (
    typeof payload.customerId !== "number" ||
    typeof payload.exp !== "number" ||
    payload.exp < Date.now()
  ) {
    return null;
  }

  return { customerId: payload.customerId };
}
