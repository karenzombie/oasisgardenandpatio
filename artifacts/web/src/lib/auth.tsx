import { useEffect, useRef, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  getGetWishlistQueryKey,
  syncWishlist,
  ApiError,
  type CurrentUser,
} from "@workspace/api-client-react";
import {
  clearPendingWishlist,
  readPendingWishlist,
  subscribePendingWishlist,
} from "./wishlistHold";

export function useAuth(): {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
} {
  const query = useGetCurrentUser({
    query: {
      queryKey: getGetCurrentUserQueryKey(),
      retry: false,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  });

  const error = query.error;
  const isUnauthorized =
    error instanceof ApiError && error.status === 401;

  const rawUser = query.data && !isUnauthorized ? query.data : null;

  // The customer-facing site and the staff portal share a single session
  // cookie. Staff (admin / agent) sessions must NOT appear as "logged in"
  // on the customer site — internal users have no customer account context
  // (no orders, no wishlist, etc.) and showing their name in the storefront
  // navbar is confusing. Treat any non-customer role as anonymous here.
  const user = rawUser && rawUser.role === "customer" ? rawUser : null;

  return {
    user,
    isLoading: query.isLoading,
    isAuthenticated: !!user,
  };
}

/**
 * Subscribe to the localStorage-backed pending wishlist set. Returns the
 * current snapshot and re-renders whenever the set changes.
 */
export function usePendingWishlist(): ReadonlySet<number> {
  const snapshotRef = useRef<ReadonlySet<number>>(readPendingWishlist());
  const subscribe = (cb: () => void) =>
    subscribePendingWishlist((next) => {
      snapshotRef.current = new Set(next);
      cb();
    });
  return useSyncExternalStore(
    subscribe,
    () => snapshotRef.current,
    () => snapshotRef.current,
  );
}

/**
 * Mount once near the top of the tree. The first time the user transitions
 * from guest → authenticated and there are pending wishlist items in
 * localStorage, POST them to /wishlist/sync and clear the local cache.
 *
 * Failures are silent (the items stay locally and will be retried next
 * mount) so a flaky network never blocks the auth flow.
 */
export function useDrainPendingWishlistOnLogin(): void {
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const wasAuthedRef = useRef<boolean>(isAuthenticated);
  const draining = useRef<boolean>(false);

  useEffect(() => {
    if (draining.current) return;
    if (!isAuthenticated) {
      wasAuthedRef.current = false;
      return;
    }
    // Run the drain on every transition into authenticated AND on initial
    // mount when already authed — the latter handles the case where a guest
    // added items, then refreshed the page after logging in.
    const pending = Array.from(readPendingWishlist());
    if (pending.length === 0) {
      wasAuthedRef.current = true;
      return;
    }
    draining.current = true;
    void syncWishlist({ productIds: pending })
      .then((resp) => {
        clearPendingWishlist();
        qc.setQueryData(getGetWishlistQueryKey(), resp);
        qc.invalidateQueries({ queryKey: getGetWishlistQueryKey() });
      })
      .catch(() => {
        // Leave the local set alone; we'll retry on the next auth event.
      })
      .finally(() => {
        draining.current = false;
        wasAuthedRef.current = true;
      });
  }, [isAuthenticated, qc]);
}
