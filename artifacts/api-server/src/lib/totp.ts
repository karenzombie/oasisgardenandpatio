import {
  generateSecret as otpGenerateSecret,
  generateURI,
  verify as otpVerify,
} from "otplib";
import qrcode from "qrcode";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

const ISSUER = "Oasis Garden & Patio";
const RECOVERY_CODE_COUNT = 10;
const BCRYPT_ROUNDS = 12;
const TOTP_PERIOD = 30;
const TOTP_TOLERANCE_SECONDS = 30;

export function generateTotpSecret(): string {
  return otpGenerateSecret();
}

export function buildOtpAuthUrl(email: string, secret: string): string {
  return generateURI({ issuer: ISSUER, label: email, secret });
}

export async function buildQrDataUrl(otpAuthUrl: string): Promise<string> {
  return qrcode.toDataURL(otpAuthUrl, { margin: 1, width: 240 });
}

export async function verifyTotpCode(
  secret: string,
  code: string,
): Promise<boolean> {
  const cleaned = code.replace(/\s+/g, "");
  if (!/^\d{6}$/.test(cleaned)) return false;
  try {
    const result = await otpVerify({
      token: cleaned,
      secret,
      epochTolerance: TOTP_TOLERANCE_SECONDS,
      period: TOTP_PERIOD,
    });
    return Boolean(result.valid);
  } catch {
    return false;
  }
}

export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    const buf = randomBytes(5).toString("hex").toUpperCase();
    codes.push(`${buf.slice(0, 5)}-${buf.slice(5, 10)}`);
  }
  return codes;
}

export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(c.toUpperCase(), BCRYPT_ROUNDS)));
}

export async function consumeRecoveryCode(
  storedHashes: string[],
  submitted: string,
): Promise<{ matched: boolean; remaining: string[] }> {
  const cleaned = submitted.replace(/\s+/g, "").toUpperCase();
  for (let i = 0; i < storedHashes.length; i++) {
    const ok = await bcrypt.compare(cleaned, storedHashes[i]!);
    if (ok) {
      const remaining = storedHashes.filter((_, idx) => idx !== i);
      return { matched: true, remaining };
    }
  }
  return { matched: false, remaining: storedHashes };
}

export function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
