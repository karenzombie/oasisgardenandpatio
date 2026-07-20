import { useLocation, Redirect } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  useGetAccountProfile,
  getGetAccountProfileQueryKey,
} from "@workspace/api-client-react";

const EXEMPT_PATHS = ["/account", "/account/preferences/opt-out"];

export function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [location] = useLocation();

  const { data: profile, isLoading: profileLoading } = useGetAccountProfile({
    query: {
      queryKey: getGetAccountProfileQueryKey(),
      enabled: isAuthenticated,
      retry: false,
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  });

  // Still loading — let through, the redirect will happen after data arrives.
  if (authLoading || (isAuthenticated && profileLoading && !profile)) {
    return <>{children}</>;
  }

  // Not a customer, or profile not yet available — no gate.
  if (!isAuthenticated || !profile) {
    return <>{children}</>;
  }

  if (!profile.onboardingRequired) {
    return <>{children}</>;
  }

  // Gate is active — check if the current path is exempt from redirection.
  const isExempt = EXEMPT_PATHS.some(
    (p) => location === p || location.startsWith(p + "/"),
  );
  if (isExempt) {
    return <>{children}</>;
  }

  return <Redirect to="/account" />;
}
