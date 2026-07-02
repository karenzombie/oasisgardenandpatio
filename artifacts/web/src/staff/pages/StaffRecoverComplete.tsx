import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams, useLocation } from "wouter";
import {
  useGetStaffRecoveryStatus,
  useCompleteStaffRecovery,
  ApiError,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { StaffAuthShell } from "../lib/StaffAuthShell";

function fmtAbsolute(d: Date): string {
  return d.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function StaffRecoverComplete() {
  const params = useParams<{ token: string }>();
  const token = params.token ?? "";
  const [, navigate] = useLocation();
  const statusQuery = useGetStaffRecoveryStatus(token, {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    query: { refetchInterval: 15_000, enabled: token.length > 0 } as any,
  });

  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const completeMutation = useCompleteStaffRecovery();

  const status = statusQuery.data;
  const expiresAt = useMemo(
    () => (status?.expiresAt ? new Date(status.expiresAt) : null),
    [status?.expiresAt],
  );

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pwd.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }
    if (pwd !== pwd2) {
      setError("Passwords do not match.");
      return;
    }
    try {
      await completeMutation.mutateAsync({ token, data: { newPassword: pwd } });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        const msg = (err.data as { error?: string } | null)?.error;
        setError(msg ?? "Could not reset account. Please try again.");
      } else {
        setError("Could not reset account. Please try again.");
      }
    }
  };

  if (done) {
    return (
      <StaffAuthShell
        title="Account reset"
        subtitle="Your password has been changed and two-factor authentication has been cleared."
        footer={
          <button
            type="button"
            className="underline hover:text-slate-700"
            onClick={() => navigate("/staff")}
          >
            Continue to sign in
          </button>
        }
      >
        <p className="text-sm text-slate-700 leading-relaxed">
          On your next sign-in you'll be walked through scanning a fresh
          authenticator QR code.
        </p>
      </StaffAuthShell>
    );
  }

  if (statusQuery.isLoading) {
    return (
      <StaffAuthShell title="Loading recovery link…">
        <div className="flex items-center justify-center py-6">
          <Spinner className="size-5" />
        </div>
      </StaffAuthShell>
    );
  }

  if (!status || status.state === "not_found") {
    return (
      <StaffAuthShell
        title="Link not found"
        subtitle="This recovery link is invalid or has been replaced by a newer request."
        footer={
          <Link href="/staff" className="underline hover:text-slate-700">
            Back to sign in
          </Link>
        }
      >
        <Link
          href="/staff/recover"
          className="block text-center text-sm underline text-slate-700"
        >
          Request a new recovery link
        </Link>
      </StaffAuthShell>
    );
  }

  if (status.state === "cancelled") {
    return (
      <StaffAuthShell
        title="Recovery cancelled"
        subtitle="Another administrator cancelled this recovery request."
        footer={
          <Link href="/staff" className="underline hover:text-slate-700">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-slate-700">
          If you are genuinely locked out, contact the administrator who
          cancelled the request, or submit a new one.
        </p>
      </StaffAuthShell>
    );
  }

  if (status.state === "used") {
    return (
      <StaffAuthShell
        title="Already used"
        subtitle="This recovery link has already been used to reset the account."
        footer={
          <Link href="/staff" className="underline hover:text-slate-700">
            Back to sign in
          </Link>
        }
      >
        <p className="text-sm text-slate-700">
          If you did not perform that reset, sign in and rotate your password
          immediately, then notify another administrator.
        </p>
      </StaffAuthShell>
    );
  }

  if (status.state === "expired") {
    return (
      <StaffAuthShell
        title="Link expired"
        subtitle="This recovery link is no longer valid."
        footer={
          <Link href="/staff" className="underline hover:text-slate-700">
            Back to sign in
          </Link>
        }
      >
        <Link
          href="/staff/recover"
          className="block text-center text-sm underline text-slate-700"
        >
          Request a new recovery link
        </Link>
      </StaffAuthShell>
    );
  }

  // state === "ready"
  return (
    <StaffAuthShell
      title="Set a new password"
      subtitle={
        status.emailMasked
          ? `Recovering ${status.emailMasked}`
          : "Choose a new password and we'll reset 2FA."
      }
      footer={
        expiresAt ? (
          <span>This link expires at {fmtAbsolute(expiresAt)}.</span>
        ) : null
      }
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
          <Label htmlFor="pwd">New password</Label>
          <Input
            id="pwd"
            type="password"
            autoComplete="new-password"
            required
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            disabled={completeMutation.isPending}
          />
          <p className="text-xs text-slate-500">
            Minimum 12 characters. Use something you have not used before.
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pwd2">Confirm new password</Label>
          <Input
            id="pwd2"
            type="password"
            autoComplete="new-password"
            required
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            disabled={completeMutation.isPending}
          />
        </div>
        <Button
          type="submit"
          className="w-full bg-[#1A3C5E] hover:bg-[#142e48]"
          disabled={completeMutation.isPending}
        >
          {completeMutation.isPending ? (
            <>
              <Spinner className="size-4 mr-2" />
              Resetting…
            </>
          ) : (
            "Reset password & clear 2FA"
          )}
        </Button>
      </form>
    </StaffAuthShell>
  );
}
