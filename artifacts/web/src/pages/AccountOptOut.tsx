import { useAuth as useClerkAuth } from "@clerk/react";
import { Redirect } from "wouter";
import { Spinner } from "@/components/ui/spinner";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

// Gate 2 security fix: this page no longer reads the token from the URL,
// calls any API, or performs any write. Token-bearing links already in
// inboxes are rendered inert because the page ignores the token entirely.
//
// Unauthenticated visitors are sent to sign-in first (fixed destination,
// not derived from the token or any query param). Authenticated visitors
// are redirected to their own account/preferences page, with the account
// resolved from the Clerk session — never from the URL token.
export default function AccountOptOut() {
  const { isLoaded, isSignedIn } = useClerkAuth();

  if (!isLoaded) {
    return (
      <div className="w-full flex-1 flex items-center justify-center py-24">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  if (isSignedIn) {
    return <Redirect to="/account" />;
  }

  return <Redirect to="/sign-in" />;
}
