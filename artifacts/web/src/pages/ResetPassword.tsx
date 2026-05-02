import { useState, type FormEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import {
  useResetPassword,
  ApiError,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "./auth/AuthShell";

export default function ResetPassword() {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mutation = useResetPassword();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!token) {
      setErrorMessage("This reset link is missing a token.");
      return;
    }
    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    try {
      await mutation.mutateAsync({
        data: { token, newPassword: password },
      });
      navigate("/login?reset=success");
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setErrorMessage(
          "This reset link is invalid or has expired. Please request a new one."
        );
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
    }
  };

  if (!token) {
    return (
      <AuthShell title="Invalid Link">
        <div className="space-y-6 text-center">
          <p className="text-sm text-muted-foreground">
            This password reset link is missing a token. Please request a new
            one.
          </p>
          <Button
            asChild
            className="rounded-none font-serif tracking-wide"
          >
            <Link href="/forgot-password">Request reset link</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Set New Password"
      subtitle="Choose a new password for your account."
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
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={mutation.isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirm">Confirm password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={mutation.isPending}
          />
        </div>

        <Button
          type="submit"
          className="w-full rounded-none font-serif tracking-wide"
          size="lg"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <>
              <Spinner className="mr-2" /> Updating…
            </>
          ) : (
            "Update Password"
          )}
        </Button>
      </form>
    </AuthShell>
  );
}
