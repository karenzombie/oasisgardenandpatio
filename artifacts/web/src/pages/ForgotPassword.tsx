import { useSignIn, useAuth as useClerkAuth } from "@clerk/react";
import { useState, type FormEvent } from "react";
import { Link, Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { AuthShell } from "./auth/AuthShell";

type Step = "email" | "verify" | "done";

export default function ForgotPassword() {
  const { isLoaded, isSignedIn } = useClerkAuth();
  const { signIn } = useSignIn();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in — including after a successful reset + finalize().
  if (isLoaded && isSignedIn) {
    return <Redirect to="/account" />;
  }

  // Reset complete — redirect unconditionally while Clerk propagates session.
  if (step === "done") {
    return <Redirect to="/sign-in" />;
  }

  function clerkErrorMessage(err: unknown): string {
    const ce = err as { errors?: { longMessage?: string; message?: string }[] };
    return (
      ce?.errors?.[0]?.longMessage ??
      ce?.errors?.[0]?.message ??
      "Something went wrong. Please try again."
    );
  }

  async function handleEmailSubmit(e: FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setError(null);
    setLoading(true);
    try {
      // Step 1: identify the account by email address.
      const createResult = await signIn.create({ identifier: email });
      if (createResult.error) {
        setError(
          createResult.error.longMessage ??
          createResult.error.message ??
          "No account found with that email address."
        );
        return;
      }
      // Step 2: trigger the reset code email via Clerk.
      const sendResult = await signIn.resetPasswordEmailCode.sendCode();
      if (sendResult.error) {
        setError(
          sendResult.error.longMessage ??
          sendResult.error.message ??
          "Could not send reset code. Please try again."
        );
        return;
      }
      setStep("verify");
    } catch (err: unknown) {
      setError(clerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifySubmit(e: FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      // Step 3: verify the one-time code Clerk emailed.
      const verifyResult = await signIn.resetPasswordEmailCode.verifyCode({ code });
      if (verifyResult.error) {
        setError(
          verifyResult.error.longMessage ??
          verifyResult.error.message ??
          "Invalid or expired code. Please check your email and try again."
        );
        return;
      }
      // Step 4: set the new password in Clerk's credential store.
      const submitResult = await signIn.resetPasswordEmailCode.submitPassword({ password });
      if (submitResult.error) {
        setError(
          submitResult.error.longMessage ??
          submitResult.error.message ??
          "Password update failed. Please try again."
        );
        return;
      }
      // Step 5: finalize the session Clerk created so isSignedIn becomes true.
      if (signIn.status === "complete") {
        await signIn.finalize();
      }
      setStep("done");
    } catch (err: unknown) {
      setError(clerkErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  if (step === "email") {
    return (
      <AuthShell
        title="Reset Password"
        subtitle="Enter the email associated with your account and we'll send a reset code."
      >
        <form onSubmit={handleEmailSubmit} className="space-y-5" noValidate>
          <div className="space-y-2">
            <Label htmlFor="fp-email">Email</Label>
            <Input
              id="fp-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <div
              role="alert"
              className="border border-destructive/40 bg-destructive/5 text-destructive text-sm px-4 py-3 rounded-sm"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            className="w-full rounded-none font-serif tracking-wide"
            size="lg"
            disabled={loading}
          >
            {loading ? (
              <>
                <Spinner className="mr-2" /> Sending…
              </>
            ) : (
              "Send Reset Code"
            )}
          </Button>

          <p className="text-sm text-center text-muted-foreground pt-2">
            Remembered it?{" "}
            <Link href="/sign-in" className="text-primary hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </form>
      </AuthShell>
    );
  }

  // step === "verify"
  return (
    <AuthShell
      title="Set New Password"
      subtitle="Enter the 6-digit code we emailed you, then choose a new password."
    >
      <form onSubmit={handleVerifySubmit} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="fp-code">Verification code</Label>
          <Input
            id="fp-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            maxLength={6}
            placeholder="123456"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="fp-password">New password</Label>
          <Input
            id="fp-password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="fp-confirm">Confirm password</Label>
          <Input
            id="fp-confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={loading}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="border border-destructive/40 bg-destructive/5 text-destructive text-sm px-4 py-3 rounded-sm"
          >
            {error}
          </div>
        )}

        <Button
          type="submit"
          className="w-full rounded-none font-serif tracking-wide"
          size="lg"
          disabled={loading}
        >
          {loading ? (
            <>
              <Spinner className="mr-2" /> Updating…
            </>
          ) : (
            "Update Password"
          )}
        </Button>

        <p className="text-sm text-center text-muted-foreground pt-2">
          Didn&apos;t receive a code?{" "}
          <button
            type="button"
            onClick={() => {
              setStep("email");
              setError(null);
              setCode("");
              setPassword("");
              setConfirm("");
            }}
            className="text-primary hover:underline font-medium"
          >
            Try again
          </button>
        </p>
      </form>
    </AuthShell>
  );
}
