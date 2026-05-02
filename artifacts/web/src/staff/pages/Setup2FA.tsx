import { useEffect, useState, type FormEvent } from "react";
import { useLocation, Redirect } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useStaffSetupTotp,
  useStaffVerifySetupTotp,
  getStaffGetStateQueryKey,
  ApiError,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { StaffAuthShell } from "../lib/StaffAuthShell";
import { useStaffSession, pathForStage } from "../lib/staffSession";
import { ShieldCheck, Copy, AlertTriangle } from "lucide-react";

export default function Setup2FA() {
  const [, navigate] = useLocation();
  const queryClient = useQueryClient();
  const session = useStaffSession();

  const initMutation = useStaffSetupTotp();
  const verifyMutation = useStaffVerifySetupTotp();

  const [qrUrl, setQrUrl] = useState<string | null>(null);
  const [manualKey, setManualKey] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  // Auto-init the QR on first load
  useEffect(() => {
    if (qrUrl || initMutation.isPending) return;
    if (session.stage !== "needs_2fa_setup") return;
    initMutation.mutate(undefined, {
      onSuccess: (data) => {
        setQrUrl(data.qrDataUrl);
        setManualKey(data.manualEntryKey);
      },
      onError: () => {
        setError("Could not start 2FA setup. Please refresh and try again.");
      },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.stage]);

  // Redirect if not in correct stage (after hooks have all run)
  if (
    !session.isLoading &&
    session.stage !== "needs_2fa_setup" &&
    !recoveryCodes
  ) {
    return (
      <Redirect to={pathForStage(session.stage, session.user?.role)} replace />
    );
  }

  const handleVerify = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await verifyMutation.mutateAsync({
        data: { code: code.replace(/\s+/g, "") },
      });
      setRecoveryCodes(res.recoveryCodes ?? []);
    } catch (err) {
      if (err instanceof ApiError && err.status === 400) {
        setError("That code didn't work. Try the next one your app shows.");
      } else {
        setError("Could not verify. Please try again.");
      }
    }
  };

  const handleContinue = async () => {
    await queryClient.invalidateQueries({
      queryKey: getStaffGetStateQueryKey(),
    });
    const refreshed = await session.refetch();
    const stage = refreshed.data?.stage ?? "complete";
    const role = refreshed.data?.user?.role;
    navigate(pathForStage(stage, role));
  };

  if (recoveryCodes) {
    return (
      <StaffAuthShell
        title="Save Your Recovery Codes"
        subtitle="Store these somewhere safe. Each one can be used once if you lose access to your authenticator app."
      >
        <div className="space-y-4">
          <div className="flex items-start gap-2 border border-amber-200 bg-amber-50 text-amber-900 text-xs rounded p-3">
            <AlertTriangle className="size-4 shrink-0 mt-0.5" />
            <div>
              These codes are shown <strong>only once</strong>. Save them now —
              you will not be able to view them again.
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 font-mono text-sm bg-slate-50 border border-slate-200 rounded p-3">
            {recoveryCodes.map((c) => (
              <div key={c} className="text-slate-800">{c}</div>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={() => navigator.clipboard.writeText(recoveryCodes.join("\n"))}
          >
            <Copy className="size-4 mr-2" />
            Copy all codes
          </Button>

          <Button
            type="button"
            className="w-full bg-[#1A3C5E] hover:bg-[#142e48]"
            onClick={handleContinue}
          >
            I&apos;ve saved my codes — continue
          </Button>
        </div>
      </StaffAuthShell>
    );
  }

  return (
    <StaffAuthShell
      title="Set Up Two-Factor Authentication"
      subtitle="Scan the QR code with an authenticator app (Google Authenticator, 1Password, Authy), then enter the 6-digit code it generates."
    >
      <div className="space-y-5">
        {initMutation.isPending && !qrUrl && (
          <div className="flex justify-center py-12">
            <Spinner className="size-8 text-[#1A3C5E]" />
          </div>
        )}

        {qrUrl && (
          <>
            <div className="flex justify-center">
              <div className="bg-white border border-slate-200 rounded p-2">
                <img
                  src={qrUrl}
                  alt="2FA QR Code"
                  className="size-48"
                />
              </div>
            </div>

            {manualKey && (
              <div className="text-xs text-slate-600 text-center">
                <div>Or enter manually:</div>
                <div className="font-mono mt-1 inline-flex items-center gap-2 bg-slate-50 border border-slate-200 rounded px-2 py-1">
                  <ShieldCheck className="size-3.5 text-emerald-600" />
                  {manualKey}
                </div>
              </div>
            )}

            <form onSubmit={handleVerify} className="space-y-3" noValidate>
              {error && (
                <div
                  role="alert"
                  className="border border-red-200 bg-red-50 text-red-700 text-xs px-3 py-2 rounded"
                >
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="code">6-digit code</Label>
                <Input
                  id="code"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  disabled={verifyMutation.isPending}
                />
              </div>

              <Button
                type="submit"
                className="w-full bg-[#1A3C5E] hover:bg-[#142e48]"
                disabled={verifyMutation.isPending || code.length !== 6}
              >
                {verifyMutation.isPending ? (
                  <>
                    <Spinner className="size-4 mr-2" />
                    Verifying…
                  </>
                ) : (
                  "Confirm and continue"
                )}
              </Button>
            </form>
          </>
        )}
      </div>
    </StaffAuthShell>
  );
}
