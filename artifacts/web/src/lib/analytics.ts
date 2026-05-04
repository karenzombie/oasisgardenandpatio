/**
 * Lightweight visitor analytics tracker.
 *
 * Sends events to POST /api/analytics/track. Failures are silent — analytics
 * must never break the user's experience.
 *
 * The anonymous ID is generated once per browser and persisted in
 * localStorage so we can match an `auth_prompt` event to a later
 * `signup_completed` / `login_completed` (or its absence = abandonment).
 */

const ANON_ID_KEY = "oasis_anon_id";
const VISIT_FLAG_KEY = "oasis_visit_tracked";

export type AnalyticsEventType =
  | "visit"
  | "auth_prompt"
  | "signup_completed"
  | "login_completed";

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Fallback: timestamp + random hex (good enough for dedupe; not crypto-grade)
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getAnonymousId(): string {
  try {
    let id = localStorage.getItem(ANON_ID_KEY);
    if (!id) {
      id = uuid();
      localStorage.setItem(ANON_ID_KEY, id);
    }
    return id;
  } catch {
    // localStorage unavailable (private mode, etc.) — fall back to per-call id
    return uuid();
  }
}

export interface TrackOptions {
  reason?: string;
  path?: string;
}

export function trackEvent(
  eventType: AnalyticsEventType,
  opts: TrackOptions = {},
): void {
  const body = {
    eventType,
    anonymousId: getAnonymousId(),
    path: opts.path ?? (typeof location !== "undefined" ? location.pathname : null),
    reason: opts.reason ?? null,
    referrer:
      typeof document !== "undefined" && document.referrer
        ? document.referrer
        : null,
  };
  try {
    void fetch("/api/analytics/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      keepalive: true,
      body: JSON.stringify(body),
    }).catch(() => {
      /* swallow */
    });
  } catch {
    /* swallow */
  }
}

/**
 * Fire a `visit` event once per browser session. Safe to call on every page
 * load — the sessionStorage flag dedupes within a tab session.
 */
export function trackVisitOnce(): void {
  try {
    if (sessionStorage.getItem(VISIT_FLAG_KEY)) return;
    sessionStorage.setItem(VISIT_FLAG_KEY, "1");
  } catch {
    // sessionStorage unavailable — best-effort fire anyway
  }
  trackEvent("visit");
}
