import { useState, type FormEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSignup,
  getGetCurrentUserQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "./auth/AuthShell";

export default function Signup() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const nextPath = (() => {
    const raw = new URLSearchParams(search).get("next");
    if (!raw) return null;
    return raw.startsWith("/") && !raw.startsWith("//") ? raw : null;
  })();
  const queryClient = useQueryClient();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const signupMutation = useSignup();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (password.length < 8) {
      setErrorMessage("Password must be at least 8 characters.");
      return;
    }

    try {
      await signupMutation.mutateAsync({
        data: {
          firstName,
          lastName,
          email,
          password,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
        },
      });
      await queryClient.invalidateQueries({
        queryKey: getGetCurrentUserQueryKey(),
      });
      navigate(nextPath ?? "/account?welcome=1");
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setErrorMessage("An account with that email already exists.");
      } else if (err instanceof ApiError && err.status === 400) {
        setErrorMessage("Please check your information and try again.");
      } else {
        setErrorMessage("Something went wrong. Please try again.");
      }
    }
  };

  const isPending = signupMutation.isPending;

  return (
    <AuthShell
      title="Create Account"
      subtitle="Join Oasis Garden & Patio to save favorites and check out faster."
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              autoComplete="given-name"
              required
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lastName">Last name</Label>
            <Input
              id="lastName"
              autoComplete="family-name"
              required
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

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
          <Label htmlFor="phone">
            Phone <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={isPending}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={isPending}
            aria-describedby="password-hint"
          />
          <p id="password-hint" className="text-xs text-muted-foreground">
            Must be at least 8 characters.
          </p>
        </div>

        <Button
          type="submit"
          className="w-full rounded-none font-serif tracking-wide"
          size="lg"
          disabled={isPending}
        >
          {isPending ? (
            <>
              <Spinner className="mr-2" /> Creating account…
            </>
          ) : (
            "Create Account"
          )}
        </Button>

        <p className="text-sm text-center text-muted-foreground pt-2">
          Already have an account?{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
