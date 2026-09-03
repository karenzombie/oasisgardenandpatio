/**
 * Guest wishlist identity + bootstrap.
 *
 * Guests are identified by a UUID `device_token` persisted in localStorage
 * under `oasis_device_token`. Every guest wishlist read/write carries this
 * token so the server can store real `wishlist_items` rows (user_id NULL)
 * instead of a localStorage-only copy. On login the guest's rows are merged
 * into the account (see `useWishlistBootstrap`).
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  addWishlistItem,
  useGetWishlist,
  getGetWishlistQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "./auth";

const TOKEN_KEY = "oasis_device_token";
const LEGACY_KEY = "oasis-pending-wishlist";

// Base cache key. The actual query key is scoped by identity (see
// `wishlistKeyFor`) so a guest can never read a previously signed-in user's
// cached wishlist — and switching accounts can't show the prior user's data.
// Use this base for broad invalidation (partial-match invalidates every
// scoped variant).
export const WISHLIST_BASE_KEY = getGetWishlistQueryKey();

/**
 * Identity-scoped wishlist query key:
 * - signed-in: `[...base, "user:<id>"]`
 * - guest:     `[...base, "guest:<deviceToken>"]`
 *
 * Keeping each identity in its own cache entry is what prevents cross-identity
 * leakage across login/logout/account-switch transitions.
 */
export function wishlistKeyFor(
  userId: number | null,
  deviceToken: string | null,
): readonly unknown[] {
  return [
    ...WISHLIST_BASE_KEY,
    userId != null ? `user:${userId}` : `guest:${deviceToken ?? ""}`,
  ];
}

let cachedToken: string | null | undefined; // undefined = not yet read
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

export function getDeviceToken(): string | null {
  if (cachedToken === undefined) {
    if (typeof window === "undefined") return null;
    try {
      cachedToken = window.localStorage.getItem(TOKEN_KEY);
    } catch {
      cachedToken = null;
    }
  }
  return cachedToken ?? null;
}

/** Returns the existing device token, creating and persisting one if absent. */
export function ensureDeviceToken(): string {
  const existing = getDeviceToken();
  if (existing) return existing;
  const token =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    // Quota / private mode — token still drives this session in-memory.
  }
  cachedToken = token;
  notify();
  return token;
}

export function clearDeviceToken(): void {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
  cachedToken = null;
  notify();
}

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Reactive view of the current device token (null until the guest acts). */
export function useDeviceToken(): string | null {
  return useSyncExternalStore(
    subscribe,
    getDeviceToken,
    () => null,
  );
}

/**
 * Centralized wishlist read for the current identity:
 * - signed-in: GET /wishlist (session-scoped)
 * - guest: disabled, empty list
 */
export function useWishlistItems() {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? null;
  const deviceToken = useDeviceToken();
  const queryKey = wishlistKeyFor(userId, deviceToken);

  const query = useGetWishlist(undefined, {
    query: {
      queryKey,
      enabled: isAuthenticated,
      retry: false,
      staleTime: 30_000,
    },
  });

  return {
    // Never surface cached data or a loading state for signed-out visitors.
    items: isAuthenticated ? (query.data?.items ?? []) : [],
    isAuthenticated,
    userId,
    deviceToken,
    queryKey,
    isLoading: isAuthenticated ? query.isLoading : false,
  };
}

/**
 * One-time migration of the pre-feature localStorage wishlist (an array of
 * product ids under `oasis-pending-wishlist`) into real DB rows. Runs once
 * and always clears the legacy key afterward. Best-effort: individual failures
 * (e.g. a product that is no longer active) are skipped silently.
 */
async function migrateLegacyGuestWishlist(
  isAuthenticated: boolean,
): Promise<void> {
  if (typeof window === "undefined") return;
  if (!isAuthenticated) {
    try {
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      // ignore
    }
    return;
  }

  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(LEGACY_KEY);
  } catch {
    return;
  }
  if (!raw) return;

  let ids: number[] = [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      ids = parsed
        .map((n) => Number(n))
        .filter((n) => Number.isInteger(n) && n > 0);
    }
  } catch {
    // Corrupt payload — fall through and just drop the key.
  }

  // Clear first so the migration can never run twice, even if writes fail.
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }
  if (ids.length === 0) return;

  for (const productId of ids) {
    try {
      await addWishlistItem({ productId });
    } catch {
      // Skip items that can't be re-added.
    }
  }
}

/**
 * Mount once near the top of the customer tree. Handles the one-time legacy
 * localStorage → DB migration for signed-in customers.
 */
export function useWishlistBootstrap(): void {
  const { isAuthenticated, isLoading } = useAuth();
  const qc = useQueryClient();
  const migratedRef = useRef(false);

  // One-time legacy migration.
  useEffect(() => {
    if (isLoading || migratedRef.current) return;
    migratedRef.current = true;
    void migrateLegacyGuestWishlist(isAuthenticated).finally(() => {
      qc.invalidateQueries({ queryKey: WISHLIST_BASE_KEY });
    });
  }, [isLoading, isAuthenticated, qc]);
}
