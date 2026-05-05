import { useEffect, useRef } from "react";
import { useAuth as useClerkAuth } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  clerkSync,
  getGetCurrentUserQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { useAuth } from "./auth";

/**
 * Bridge Clerk auth state to the local Express session.
 *
 * Whenever Clerk reports a signed-in user but the local /auth/me query
 * returns no customer, POST /auth/clerk-sync to provision the local users
 * row, attach the session cookie, and merge any guest cart. Then refetch
 * /auth/me so the rest of the app sees the customer.
 *
 * Runs at most once per Clerk session id transition; failures are surfaced
 * via console.error and retried on the next mount.
 */
export function useClerkSync(): void {
  const { isLoaded, isSignedIn, sessionId } = useClerkAuth();
  const { user: localUser, isLoading: localLoading } = useAuth();
  const qc = useQueryClient();
  const syncedSessionRef = useRef<string | null>(null);
  const inFlightRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isLoaded || localLoading) return;
    if (!isSignedIn || !sessionId) {
      syncedSessionRef.current = null;
      return;
    }
    if (localUser) {
      // Already bridged on a previous render — remember which Clerk session
      // succeeded so we don't re-sync until the user signs out and back in.
      syncedSessionRef.current = sessionId;
      return;
    }
    if (syncedSessionRef.current === sessionId) return;
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    void clerkSync()
      .then(() => {
        syncedSessionRef.current = sessionId;
        return qc.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 409) {
          // Email collides with a legacy account — we surface this in the
          // UI elsewhere; just don't keep retrying in a tight loop.
          syncedSessionRef.current = sessionId;
        }
        // Other failures: leave syncedSessionRef alone so it retries.
        console.error("clerk-sync failed", err);
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [isLoaded, isSignedIn, sessionId, localUser, localLoading, qc]);
}
