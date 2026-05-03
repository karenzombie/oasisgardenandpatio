import { useEffect, useState } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useLogout,
  useResendVerification,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { MailWarning, CheckCircle2, LogOut } from "lucide-react";

export default function Account() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const params = new URLSearchParams(search);
  const isWelcome = params.get("welcome") === "1";

  const logoutMutation = useLogout();
  const resendMutation = useResendVerification();
  const [resendSent, setResendSent] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login");
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || !user) {
    return (
      <div className="w-full bg-muted/30 flex-1 flex items-center justify-center py-24">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      await queryClient.invalidateQueries({
        queryKey: getGetCurrentUserQueryKey(),
      });
      queryClient.setQueryData(getGetCurrentUserQueryKey(), undefined);
      navigate("/");
    }
  };

  const handleResend = async () => {
    try {
      await resendMutation.mutateAsync();
      setResendSent(true);
    } catch {
      // ignore
    }
  };

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(" ");

  return (
    <div className="w-full bg-muted/30 flex-1">
      <div className="container mx-auto px-4 py-16 md:py-24 max-w-3xl">
        <div className="bg-card border border-border shadow-sm p-8 md:p-12">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              My Account
            </p>
            <h1 className="font-serif text-3xl md:text-4xl font-medium tracking-tight">
              Welcome back, {user.firstName ?? "friend"}.
            </h1>
            <div className="h-px w-12 bg-primary/40 mt-4" />
          </div>

          {isWelcome && (
            <div className="mb-8 border border-primary/30 bg-primary/5 text-foreground/80 text-sm px-4 py-3 rounded-sm flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Account created</p>
                <p className="text-muted-foreground">
                  We&apos;ve sent a verification email to {user.email}. Please
                  check your inbox to confirm your address.
                </p>
              </div>
            </div>
          )}

          {!user.emailVerified && !isWelcome && (
            <div className="mb-8 border border-border bg-secondary/50 px-4 py-4 rounded-sm flex items-start gap-3">
              <MailWarning className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="font-medium">Email not verified</p>
                  <p className="text-sm text-muted-foreground">
                    Please verify your email address to access all features.
                  </p>
                </div>
                {resendSent ? (
                  <p className="text-sm text-primary">
                    Verification email sent. Check your inbox.
                  </p>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-none border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                    onClick={handleResend}
                    disabled={resendMutation.isPending}
                  >
                    {resendMutation.isPending ? (
                      <>
                        <Spinner className="mr-2" /> Sending…
                      </>
                    ) : (
                      "Resend verification email"
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6 mb-10">
            <div>
              <dt className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                Name
              </dt>
              <dd className="text-base">{fullName || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                Email
              </dt>
              <dd className="text-base flex items-center gap-2 flex-wrap">
                <span className="break-all">{user.email}</span>
                {user.emailVerified && (
                  <Badge variant="secondary" className="text-[10px]">
                    Verified
                  </Badge>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                Account type
              </dt>
              <dd>
                <Badge
                  variant={user.role === "customer" ? "outline" : "default"}
                  className="capitalize"
                >
                  {user.role}
                </Badge>
              </dd>
            </div>
          </dl>

          <div className="border-t border-border pt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row gap-3 text-sm">
              <Button asChild variant="outline" className="rounded-none font-serif tracking-wide">
                <Link href="/account/wishlist">My Wishlist</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-none font-serif tracking-wide">
                <Link href="/account/orders">My Orders</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-none font-serif tracking-wide">
                <Link href="/account/addresses">My Addresses</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-none font-serif tracking-wide">
                <Link href="/cart">My Cart</Link>
              </Button>
            </div>
            <Button
              variant="outline"
              className="rounded-none font-serif tracking-wide"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? (
                <>
                  <Spinner className="mr-2" /> Logging out…
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4 mr-2" /> Log Out
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
