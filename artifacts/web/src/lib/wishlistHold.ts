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
  mergeWishlist,
  useGetWishlist,
  getGetWishlistQueryKey,
  type WishlistResponse,
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
 * - guest with a token: GET /wishlist?deviceToken=…
 * - guest without a token yet: disabled, empty list
 */
export function useWishlistItems() {
  const { user, isAuthenticated } = useAuth();
  const userId = user?.id ?? null;
  const deviceToken = useDeviceToken();
  const params =
    !isAuthenticated && deviceToken ? { deviceToken } : undefined;
  const enabled = isAuthenticated || Boolean(deviceToken);
  const queryKey = wishlistKeyFor(userId, deviceToken);

  const query = useGetWishlist(params, {
    query: {
      queryKey,
      enabled,
      retry: false,
      staleTime: 30_000,
    },
  });

  return {
    // Never surface cached data when the query is disabled (e.g. a brand-new
    // guest with no token): each identity reads only its own scoped entry.
    items: enabled ? (query.data?.items ?? []) : [],
    isAuthenticated,
    userId,
    deviceToken,
    queryKey,
    isLoading: query.isLoading,
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

  // Signed-in users get the items added straight to their account; guests get
  // them written under a (freshly minted) device token.
  const token = isAuthenticated ? null : ensureDeviceToken();
  for (const productId of ids) {
    try {
      await addWishlistItem({
        productId,
        ...(token ? { deviceToken: token } : {}),
      });
    } catch {
      // Skip items that can't be re-added.
    }
  }
}

/**
 * Mount once near the top of the customer tree. Handles:
 *  1. the one-time legacy localStorage → DB migration, and
 *  2. merging a guest device's wishlist into the account on login.
 */
export function useWishlistBootstrap(): void {
  const { user, isAuthenticated, isLoading } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const migratedRef = useRef(false);
  const mergedRef = useRef(false);

  // One-time legacy migration.
  useEffect(() => {
    if (isLoading || migratedRef.current) return;
    migratedRef.current = true;
    void migrateLegacyGuestWishlist(isAuthenticated).finally(() => {
      qc.invalidateQueries({ queryKey: WISHLIST_BASE_KEY });
    });
  }, [isLoading, isAuthenticated, qc]);

  // Merge guest device wishlist into the account on login.
  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated || userId == null) {
      mergedRef.current = false;
      return;
    }
    if (mergedRef.current) return;
    const token = getDeviceToken();
    if (!token) {
      mergedRef.current = true;
      return;
    }
    mergedRef.current = true;
    void mergeWishlist({ deviceToken: token })
      .then((resp: WishlistResponse) => {
        qc.setQueryData(wishlistKeyFor(userId, null), resp);
        clearDeviceToken();
        qc.invalidateQueries({ queryKey: WISHLIST_BASE_KEY });
      })
      .catch(() => {
        // Retry on the next auth event.
        mergedRef.current = false;
      });
  }, [isLoading, isAuthenticated, userId, qc]);
}
