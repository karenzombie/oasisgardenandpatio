import { useEffect, useRef } from "react";
import { Link, useSearch } from "wouter";
import { useOptOutMarketingPreference } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "./auth/AuthShell";

export default function AccountOptOut() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";

  const mutation = useOptOutMarketingPreference();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token || startedRef.current) return;
    startedRef.current = true;
    mutation.mutate({ data: { token } });
  }, [token, mutation]);

  const invalidOrExpiredCopy = (
    <AuthShell title="Link Expired">
      <div className="space-y-6 text-center">
        <p className="text-sm text-muted-foreground">
          This link has expired. You can update your marketing contact
          preference any time in your{" "}
          <Link href="/account" className="underline">
            account settings
          </Link>
          .
        </p>
      </div>
    </AuthShell>
  );

  if (!token) {
    return invalidOrExpiredCopy;
  }

  if (mutation.isPending || mutation.isIdle) {
    return (
      <AuthShell
        title="One moment…"
        subtitle="Please wait while we update your preference."
      >
        <div className="flex justify-center py-6">
          <Spinner className="size-8 text-primary" />
        </div>
      </AuthShell>
    );
  }

  if (mutation.isSuccess && mutation.data.status === "success") {
    return (
      <AuthShell title="You're Opted Out">
        <div className="space-y-6 text-center">
          <p className="text-sm text-muted-foreground">
            Got it — we will not contact you about your wishlist or send you
            promotional emails. You can update this preference any time in
            your account settings.
          </p>
          <Button asChild className="rounded-none font-serif tracking-wide" size="lg">
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return invalidOrExpiredCopy;
}
