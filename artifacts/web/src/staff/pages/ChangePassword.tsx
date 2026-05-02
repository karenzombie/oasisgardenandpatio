import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStaffChangePassword,
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

export default function ChangePassword() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const session = useStaffSession();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useStaffChangePassword();

  useEffect(() => {
    if (session.isLoading) return;
    if (
      session.stage !== "needs_password_change" &&
      session.stage !== "complete"
    ) {
      navigate(pathForStage(session.stage, session.user?.role));
    }
  }, [session.isLoading, session.stage, session.user?.role, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }
    if (newPassword !== confirm) {
      setError("New password and confirmation do not match.");
      return;
    }
    try {
      const res = await mutation.mutateAsync({
        data: { currentPassword, newPassword },
      });
      await queryClient.invalidateQueries({
        queryKey: getStaffGetStateQueryKey(),
      });
      await queryClient.invalidateQueries({
        queryKey: getGetCurrentUserQueryKey(),
      });
      navigate(pathForStage(res.stage, res.user?.role));
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        const msg = (err.data as { error?: string } | undefined)?.error;
        setError(msg ?? "Could not change password.");
      } else {
        setError("Could not change password.");
      }
    }
  };

  const isPending = mutation.isPending;

  return (
    <StaffAuthShell
      title="Choose a New Password"
      subtitle="Your account requires a new password before you can continue. Choose at least 12 characters."
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && (
          <div
            role="alert"
            className="border border-red-200 bg-red-50 text-red-700 text-xs px-3 py-2 rounded"
          >
            {error}
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="current">Current password</Label>
          <Input
            id="current"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={isPending}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="new">New password</Label>
          <Input
            id="new"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={isPending}
          />
          <p className="text-[11px] text-slate-500">At least 12 characters.</p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm new password</Label>
          <Input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
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
              Updating…
            </>
          ) : (
            "Update password and continue"
          )}
        </Button>
      </form>
    </StaffAuthShell>
  );
}
