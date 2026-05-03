import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { useRequestStaffRecovery } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { StaffAuthShell } from "../lib/StaffAuthShell";

export default function StaffRecoverRequest() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const mutation = useRequestStaffRecovery();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await mutation.mutateAsync({ data: { email: email.trim() } });
    } catch {
      // Endpoint always returns 200; only network errors land here.
    }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <StaffAuthShell
        title="Check your email"
        subtitle="If that address is registered to a staff account, a recovery link is on its way."
        footer={
          <Link href="/staff" className="underline hover:text-slate-700">
            Back to sign in
          </Link>
        }
      >
        <div className="space-y-4 text-sm leading-relaxed text-slate-700">
          <p>
            For security, the link <strong>will not work for the first hour</strong>.
            During that time, every other administrator is notified and can
            cancel the request. After the cooldown, the link remains valid for
            24 hours and lets you set a new password and re-enroll
            two-factor authentication.
          </p>
          <p>
            If you did not request this, no action is needed — but please tell
            another administrator so they can cancel it from the admin portal.
          </p>
        </div>
      </StaffAuthShell>
    );
  }

  return (
    <StaffAuthShell
      title="Recover staff access"
      subtitle="Use this only if you have lost access to your staff password or authenticator. A 1-hour security delay applies."
      footer={
        <Link href="/staff" className="underline hover:text-slate-700">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">Staff email</Label>
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
          className="w-full bg-[#1A3C5E] hover:bg-[#142e48]"
          disabled={mutation.isPending}
        >
          {mutation.isPending ? (
            <>
              <Spinner className="size-4 mr-2" />
              Sending…
            </>
          ) : (
            "Send recovery link"
          )}
        </Button>
        <p className="text-xs text-slate-500 leading-relaxed">
          To prevent abuse, the link in the email is delayed by one hour and
          all other admins are notified so they can cancel it before it can
          be used.
        </p>
      </form>
    </StaffAuthShell>
  );
}
