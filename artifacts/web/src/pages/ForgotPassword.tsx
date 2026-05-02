import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useRequestPasswordReset } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "./auth/AuthShell";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const mutation = useRequestPasswordReset();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await mutation.mutateAsync({ data: { email } });
    } catch {
      // Endpoint always returns 204 — ignore network errors silently for UX.
    } finally {
      setSubmitted(true);
    }
  };

  if (submitted) {
    return (
      <AuthShell title="Check Your Email">
        <div className="space-y-6 text-center">
          <p className="text-sm text-muted-foreground leading-relaxed">
            If that address is registered, we sent a reset link. Please check
            your inbox (and spam folder) for next steps.
          </p>
          <Button
            asChild
            variant="outline"
            className="rounded-none font-serif tracking-wide border-primary text-primary hover:bg-primary hover:text-primary-foreground"
          >
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Reset Password"
      subtitle="Enter the email associated with your account and we'll send you a reset link."
    >
      <form onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
              <Spinner className="mr-2" /> Sending…
            </>
          ) : (
            "Send Reset Link"
          )}
        </Button>

        <p className="text-sm text-center text-muted-foreground pt-2">
          Remembered it?{" "}
          <Link href="/login" className="text-primary hover:underline font-medium">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
