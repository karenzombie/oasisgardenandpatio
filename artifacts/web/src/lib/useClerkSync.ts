import { useEffect, useRef } from "react";
import { useAuth as useClerkAuth, useClerk } from "@clerk/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  clerkSync,
  getGetCurrentUserQueryKey,
  getGetCartQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { useAuth } from "./auth";
import { addAuthDiagnostic } from "./authDiagnostics";

function extractErrorMessage(err: ApiError, fallback: string): string {
  const data = err.data as { error?: unknown } | null | undefined;
  if (data && typeof data.error === "string" && data.error.length > 0) {
    return data.error;
  }
  return fallback;
}

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
  const { signOut: clerkSignOut } = useClerk();
  const { user: localUser, isLoading: localLoading } = useAuth();
  const qc = useQueryClient();
  const syncedSessionRef = useRef<string | null>(null);
  const inFlightRef = useRef<boolean>(false);

  useEffect(() => {
    const diagnosticState = {
      isLoaded,
      isSignedIn,
      hasSessionId: Boolean(sessionId),
      localLoading,
      hasLocalUser: Boolean(localUser),
      syncedSessionMatches: syncedSessionRef.current === sessionId,
      inFlight: inFlightRef.current,
    };

    if (!isLoaded || localLoading) {
      addAuthDiagnostic(
        "useClerkSync early return: auth state not ready",
        diagnosticState,
      );
      return;
    }
    if (!isSignedIn || !sessionId) {
      addAuthDiagnostic(
        "useClerkSync early return: Clerk signed out or session missing",
        diagnosticState,
      );
      syncedSessionRef.current = null;
      return;
    }
    if (localUser) {
      addAuthDiagnostic(
        "useClerkSync early return: local user already present",
        diagnosticState,
      );
      // Already bridged on a previous render — remember which Clerk session
      // succeeded so we don't re-sync until the user signs out and back in.
      syncedSessionRef.current = sessionId;
      return;
    }
    if (syncedSessionRef.current === sessionId) {
      addAuthDiagnostic(
        "useClerkSync early return: Clerk session already synced",
        diagnosticState,
      );
      return;
    }
    if (inFlightRef.current) {
      addAuthDiagnostic(
        "useClerkSync early return: sync already in flight",
        diagnosticState,
      );
      return;
    }

    inFlightRef.current = true;
    addAuthDiagnostic("useClerkSync calling clerkSync", {
      ...diagnosticState,
      inFlight: inFlightRef.current,
    });
    void clerkSync()
      .then(async (user) => {
        addAuthDiagnostic("clerkSync resolved", {
          userId: user.id,
          role: user.role,
        });
        syncedSessionRef.current = sessionId;
        const currentUserQueryKey = getGetCurrentUserQueryKey();
        await qc.cancelQueries({ queryKey: currentUserQueryKey });
        qc.setQueryData(currentUserQueryKey, user);
        const cachedUser = qc.getQueryData<typeof user>(currentUserQueryKey);
        addAuthDiagnostic("current user cache after setQueryData", {
          isPresent: Boolean(cachedUser),
          userId: cachedUser?.id ?? null,
        });
        return qc.invalidateQueries({ queryKey: getGetCartQueryKey() });
      })
      .catch(async (err) => {
        addAuthDiagnostic("clerkSync catch reached", {
          error:
            err instanceof Error
              ? { name: err.name, message: err.message }
              : err,
        });
        if (err instanceof ApiError && err.status === 403) {
          const data = err.data as
            | { code?: unknown }
            | null
            | undefined;
          if (data?.code === "account_disabled") {
            // Account disabled by an admin. Sign out of Clerk so the user
            // can't keep retrying, then surface the explanation.
            syncedSessionRef.current = sessionId;
            const message = extractErrorMessage(
              err,
              "This account has been disabled. Please contact Oasis Garden & Patio to have it restored.",
            );
            try {
              await clerkSignOut();
            } catch {
              // ignore — we still want to show the message
            }
            if (typeof window !== "undefined") {
              window.alert(message);
            }
            return;
          }
        }
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
  }, [isLoaded, isSignedIn, sessionId, localUser, localLoading, qc, clerkSignOut]);
}
