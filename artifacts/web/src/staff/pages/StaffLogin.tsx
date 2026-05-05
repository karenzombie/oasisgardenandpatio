import { useState, type FormEvent } from "react";
import { Link, useLocation, Redirect } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStaffLogin,
  getStaffGetStateQueryKey,
  getGetCurrentUserQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { StaffAuthShell } from "../lib/StaffAuthShell";
import { useStaffSession, pathForStage } from "../lib/staffSession";

export default function StaffLogin() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const session = useStaffSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const loginMutation = useStaffLogin();

  // If already mid-flow or signed in, bounce to the right place
  if (!session.isLoading && session.stage !== "anonymous") {
    return (
      <Redirect to={pathForStage(session.stage, session.user?.role)} replace />
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await loginMutation.mutateAsync({
        data: { email: email.trim(), password },
      });
      await queryClient.invalidateQueries({
        queryKey: getStaffGetStateQueryKey(),
      });
      await queryClient.invalidateQueries({
        queryKey: getGetCurrentUserQueryKey(),
      });
      navigate(pathForStage(res.stage, res.user?.role));
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.data as
          | { error?: unknown; code?: unknown }
          | null
          | undefined;
        if (err.status === 403 && data?.code === "account_disabled") {
          const message =
            typeof data.error === "string"
              ? data.error
              : "This staff account has been disabled. Please contact a super admin at Oasis Garden & Patio to have it restored.";
          setError(message);
          if (typeof window !== "undefined") window.alert(message);
        } else if (err.status === 401) {
          setError("Invalid email or password.");
        } else if (err.status === 429) {
          setError(
            "Too many attempts. Please wait a few minutes and try again.",
          );
        } else {
          setError("Could not sign in. Please try again.");
        }
      } else {
        setError("Could not sign in. Please try again.");
      }
    }
  };

  const isPending = loginMutation.isPending;

  return (
    <StaffAuthShell
      title="Staff Sign In"
      subtitle="Authorized employees only. All sign-ins are logged."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="border border-red-200 bg-red-50 text-red-700 text-sm px-3 py-2 rounded"
          >
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
          />
        </div>

        <Button
          type="submit"
          className="w-full bg-[#1A3C5E] hover:bg-[#142e48]"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Spinner className="size-4 mr-2" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>

        <div className="text-center text-xs text-slate-500 pt-2">
          <Link
            href="/staff/recover"
            className="underline hover:text-slate-700"
          >
            Locked out? Recover staff access
          </Link>
        </div>
      </form>
    </StaffAuthShell>
  );
}
