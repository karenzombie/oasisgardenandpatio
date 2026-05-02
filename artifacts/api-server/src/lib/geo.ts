import type { Request } from "express";

const ALLOWED_COUNTRY_TOKENS = new Set([
  "US",
  "USA",
  "U.S.",
  "U.S.A.",
  "UNITED STATES",
  "UNITED STATES OF AMERICA",
]);

export function normalizeCountry(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase();
}

export function isUSCountry(input: string | null | undefined): boolean {
  const norm = normalizeCountry(input);
  if (!norm) return false;
  return ALLOWED_COUNTRY_TOKENS.has(norm);
}

function headerString(v: string | string[] | undefined): string | null {
  if (!v) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

/**
 * Best-effort country detection from common edge/CDN headers.
 *
 * Recognized headers (in order):
 *  - x-geo-country         (custom override; useful for tests + admin tools)
 *  - cf-ipcountry          (Cloudflare)
 *  - x-vercel-ip-country   (Vercel)
 *  - x-appengine-country   (Google App Engine)
 *
 * Returns ISO-3166 alpha-2 (e.g. "US", "GB"), or null when unknown.
 * Returning null is treated as "do not block" — IP geo is a polite gate, not
 * the hard enforcement layer (address validation is).
 */
export function getRequestCountry(req: Request): string | null {
  const candidates = [
    headerString(req.headers["x-geo-country"]),
    headerString(req.headers["cf-ipcountry"]),
    headerString(req.headers["x-vercel-ip-country"]),
    headerString(req.headers["x-appengine-country"]),
  ];
  for (const c of candidates) {
    if (!c) continue;
    const trimmed = c.trim().toUpperCase();
    if (!trimmed || trimmed === "XX" || trimmed === "T1") continue;
    return trimmed;
  }
  return null;
}

export const US_ONLY_MESSAGE =
  "Thank you for your interest. At this time, Oasis Garden & Patio ships to US customer locations.";
