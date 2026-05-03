import { useState, type FormEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useLogin,
  getGetCurrentUserQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "./auth/AuthShell";

export default function Login() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const nextPath = (() => {
    const raw = new URLSearchParams(search).get("next");
    if (!raw) return "/";
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
  })();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loginMutation = useLogin();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    try {
      await loginMutation.mutateAsync({ data: { email, password } });
      await queryClient.invalidateQueries({
        queryKey: getGetCurrentUserQueryKey(),
      });
      navigate(nextPath);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setErrorMessage("Invalid email or password.");
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
    }
  };

  const isPending = loginMutation.isPending;

  return (
    <AuthShell
      title="Welcome Back"
      subtitle="Sign in to your Oasis Garden & Patio account."
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        {errorMessage && (
          <div
            role="alert"
            className="border border-destructive/40 bg-destructive/5 text-destructive text-sm px-4 py-3 rounded-sm"
          >
            {errorMessage}
          </div>
        )}

        <div className="space-y-2">
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

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              Forgot password?
            </Link>
          </div>
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
          className="w-full rounded-none font-serif tracking-wide"
          size="lg"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Spinner className="mr-2" /> Signing in…
            </>
          ) : (
            "Sign In"
          )}
        </Button>

        <p className="text-sm text-center text-muted-foreground pt-2">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="text-primary hover:underline font-medium"
          >
            Create one
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
