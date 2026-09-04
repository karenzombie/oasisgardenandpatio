import { useEffect, useRef } from "react";
import {
  useGetCurrentUser,
  getGetCurrentUserQueryKey,
  ApiError,
  type CurrentUser,
} from "@workspace/api-client-react";

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
  const isAuthenticated = Boolean(user);
  const previousIsAuthenticatedRef = useRef<boolean | undefined>(undefined);

  useEffect(() => {
    if (previousIsAuthenticatedRef.current === isAuthenticated) return;
    previousIsAuthenticatedRef.current = isAuthenticated;
    console.log("[AUTHDIAG] derived isAuthenticated changed", {
      isAuthenticated,
      queryStatus: query.status,
      hasData: Boolean(query.data),
      errorStatus: error instanceof ApiError ? error.status : null,
    });
  }, [isAuthenticated, query.status, query.data, error]);

  return {
    user,
    isLoading: query.isLoading,
    isAuthenticated,
  };
}
