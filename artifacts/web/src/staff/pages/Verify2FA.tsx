import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStaffVerifyTotp,
  useStaffVerifyRecoveryCode,
  getStaffGetStateQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { StaffAuthShell } from "../lib/StaffAuthShell";
import { useStaffSession, pathForStage } from "../lib/staffSession";

export default function Verify2FA() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const session = useStaffSession();
  const [mode, setMode] = useState<"totp" | "recovery">("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const totpMutation = useStaffVerifyTotp();
  const recoveryMutation = useStaffVerifyRecoveryCode();

  useEffect(() => {
    if (session.isLoading) return;
    if (session.stage !== "needs_2fa_verify") {
      navigate(pathForStage(session.stage, session.user?.role));
    }
  }, [session.isLoading, session.stage, session.user?.role, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res =
        mode === "totp"
          ? await totpMutation.mutateAsync({ data: { code: code.replace(/\s+/g, "") } })
          : await recoveryMutation.mutateAsync({
              data: { code: code.replace(/\s+/g, "").toUpperCase() },
            });
      await queryClient.invalidateQueries({
        queryKey: getStaffGetStateQueryKey(),
      });
      navigate(pathForStage(res.stage, res.user?.role));
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError(
          mode === "totp"
            ? "That code didn't work. Try the next one your app shows."
            : "Recovery code not recognized.",
        );
      } else {
        setError("Could not verify. Please try again.");
      }
    }
  };

  const isPending = totpMutation.isPending || recoveryMutation.isPending;

  return (
    <StaffAuthShell
      title="Two-Factor Verification"
      subtitle={
        mode === "totp"
          ? "Enter the 6-digit code from your authenticator app."
          : "Enter one of your saved recovery codes."
      }
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
          <Label htmlFor="code">
            {mode === "totp" ? "6-digit code" : "Recovery code"}
          </Label>
          <Input
            id="code"
            inputMode={mode === "totp" ? "numeric" : "text"}
            pattern={mode === "totp" ? "[0-9]*" : undefined}
            maxLength={mode === "totp" ? 6 : 16}
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => {
              setCode(
                mode === "totp"
                  ? e.target.value.replace(/\D/g, "")
                  : e.target.value,
              );
            }}
            disabled={isPending}
          />
        </div>

        <Button
          type="submit"
          className="w-full bg-[#1A3C5E] hover:bg-[#142e48]"
          disabled={isPending || (mode === "totp" ? code.length !== 6 : code.length < 8)}
        >
          {isPending ? (
            <>
              <Spinner className="size-4 mr-2" />
              Verifying…
            </>
          ) : (
            "Verify"
          )}
        </Button>

        <div className="text-center text-xs">
          <button
            type="button"
            className="text-[#1A3C5E] hover:underline"
            onClick={() => {
              setMode(mode === "totp" ? "recovery" : "totp");
              setCode("");
              setError(null);
            }}
          >
            {mode === "totp"
              ? "Lost your device? Use a recovery code"
              : "Use authenticator app instead"}
          </button>
        </div>
      </form>
    </StaffAuthShell>
  );
}
