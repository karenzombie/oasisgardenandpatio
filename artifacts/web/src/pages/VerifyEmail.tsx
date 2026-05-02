import { useEffect, useRef } from "react";
import { Link, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useVerifyEmail,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "./auth/AuthShell";

export default function VerifyEmail() {
  const search = useSearch();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";

  const mutation = useVerifyEmail();
  const startedRef = useRef(false);

  useEffect(() => {
    if (!token || startedRef.current) return;
    startedRef.current = true;
    mutation.mutate(
      { data: { token } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetCurrentUserQueryKey(),
          });
        },
      }
    );
  }, [token, mutation, queryClient]);

  if (!token) {
    return (
      <AuthShell title="Invalid Link">
        <div className="space-y-6 text-center">
          <p className="text-sm text-muted-foreground">
            This verification link is missing a token.
          </p>
          <Button asChild className="rounded-none font-serif tracking-wide">
            <Link href="/account">Back to account</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  if (mutation.isPending || mutation.isIdle) {
    return (
      <AuthShell title="Verifying…" subtitle="Please wait while we confirm your email.">
        <div className="flex justify-center py-6">
          <Spinner className="size-8 text-primary" />
        </div>
      </AuthShell>
    );
  }

  if (mutation.isSuccess) {
    return (
      <AuthShell
        title="Email Verified"
        subtitle="Thank you — your email address has been confirmed."
      >
        <div className="flex flex-col gap-3 pt-2">
          <Button asChild className="rounded-none font-serif tracking-wide" size="lg">
            <Link href="/account">Go to my account</Link>
          </Button>
          <Button
            asChild
            variant="outline"
            className="rounded-none font-serif tracking-wide border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          >
            <Link href="/">Back to home</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Verification Failed"
      subtitle="This verification link is invalid or has expired."
    >
      <div className="flex flex-col gap-3 pt-2">
        <Button asChild className="rounded-none font-serif tracking-wide" size="lg">
          <Link href="/account">Go to my account</Link>
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          You can request a new verification email from your account page.
        </p>
      </div>
    </AuthShell>
  );
}
