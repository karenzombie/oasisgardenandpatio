import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useUpdateAccountProfile,
  useRecordLegalAcceptances,
  getGetAccountProfileQueryKey,
  getGetCurrentUserQueryKey,
  type AccountProfileResponse,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

const PRIVACY_PDF_URL = "/api/legal/privacy_policy/pdf";
const TERMS_PDF_URL = "/api/legal/terms_and_conditions/pdf";

type DocumentType = "privacy_policy" | "terms_and_conditions";

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data
      ?.error ??
    (err as { message?: string })?.message ??
    fallback
  );
}

interface OnboardingViewProps {
  profile: AccountProfileResponse;
  onComplete: (updatedProfile: AccountProfileResponse) => void;
}

export function OnboardingView({ profile, onComplete }: OnboardingViewProps) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [firstName, setFirstName] = useState(profile.firstName ?? "");
  const [lastName, setLastName] = useState(profile.lastName ?? "");
  const [phone, setPhone] = useState(profile.phone ?? "");

  // Pre-check boxes for document types already accepted.
  const [privacyChecked, setPrivacyChecked] = useState(
    profile.legalAcceptances.privacy_policy !== null,
  );
  const [termsChecked, setTermsChecked] = useState(
    profile.legalAcceptances.terms_and_conditions !== null,
  );
  const [isSubmitting, setIsSubmitting] = useState(false);

  const updateProfileM = useUpdateAccountProfile();
  const recordAcceptancesM = useRecordLegalAcceptances();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedFirst = firstName.trim();
    const trimmedLast = lastName.trim();

    if (!trimmedFirst || !trimmedLast) {
      toast({
        title: "Name required",
        description: "Please enter your first and last name.",
      });
      return;
    }
    if (!privacyChecked || !termsChecked) {
      toast({
        title: "Acceptance required",
        description:
          "Please accept both the Privacy Policy and Terms & Conditions to continue.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      // Step 1: Save name and phone via the existing PUT /account/profile
      // endpoint.  This writes to the users table, which is what
      // onboardingRequired reads for the name check.
      const updatedProfile = await updateProfileM.mutateAsync({
        data: {
          firstName: trimmedFirst,
          lastName: trimmedLast,
          phone: phone.trim() || null,
        },
      });

      // Keep the auth user cache (navbar name) in sync.
      queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });

      // Step 2: Record any document types not yet accepted.  Check the
      // returned profile (not the stale prop) so we don't double-record.
      const pendingTypes: DocumentType[] = [];
      if (!updatedProfile.legalAcceptances.privacy_policy) {
        pendingTypes.push("privacy_policy");
      }
      if (!updatedProfile.legalAcceptances.terms_and_conditions) {
        pendingTypes.push("terms_and_conditions");
      }

      let finalProfile = updatedProfile;
      if (pendingTypes.length > 0) {
        finalProfile = await recordAcceptancesM.mutateAsync({
          data: { documentTypes: pendingTypes },
        });
      }

      // Update the query cache so OnboardingGate and Account see the new state.
      queryClient.setQueryData(getGetAccountProfileQueryKey(), finalProfile);
      onComplete(finalProfile);
    } catch (err) {
      toast({
        title: "Error",
        description: errorMessage(
          err,
          "Could not complete setup. Please try again.",
        ),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="w-full bg-muted/30 flex-1">
      <div className="max-w-lg mx-auto px-4 py-12">
        <h1 className="font-serif text-3xl mb-2">
          Welcome to Oasis Garden &amp; Patio
        </h1>
        <p className="text-muted-foreground mb-8">
          Please complete your profile and accept our policies to continue.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="onboarding-firstName">First name *</Label>
              <Input
                id="onboarding-firstName"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="rounded-none mt-1"
              />
            </div>
            <div>
              <Label htmlFor="onboarding-lastName">Last name *</Label>
              <Input
                id="onboarding-lastName"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="rounded-none mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="onboarding-email">Email</Label>
            <Input
              id="onboarding-email"
              value={profile.email}
              readOnly
              disabled
              className="rounded-none mt-1 bg-muted cursor-not-allowed"
            />
          </div>

          <div>
            <Label htmlFor="onboarding-phone">
              Phone{" "}
              <span className="text-muted-foreground font-normal text-sm">
                (optional)
              </span>
            </Label>
            <Input
              id="onboarding-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-none mt-1"
            />
          </div>

          <div className="border border-border p-4 space-y-4">
            <p className="text-sm font-medium">Legal Agreements</p>

            <div className="flex items-start gap-3">
              <Checkbox
                id="onboarding-privacy"
                checked={privacyChecked}
                onCheckedChange={(v) => setPrivacyChecked(!!v)}
                disabled={profile.legalAcceptances.privacy_policy !== null}
                className="mt-0.5 shrink-0"
              />
              <Label
                htmlFor="onboarding-privacy"
                className="font-normal leading-snug cursor-pointer"
              >
                I have read and agree to the{" "}
                <a
                  href={PRIVACY_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary hover:text-primary/80"
                  onClick={(e) => e.stopPropagation()}
                >
                  Privacy Policy
                </a>
              </Label>
            </div>

            <div className="flex items-start gap-3">
              <Checkbox
                id="onboarding-terms"
                checked={termsChecked}
                onCheckedChange={(v) => setTermsChecked(!!v)}
                disabled={
                  profile.legalAcceptances.terms_and_conditions !== null
                }
                className="mt-0.5 shrink-0"
              />
              <Label
                htmlFor="onboarding-terms"
                className="font-normal leading-snug cursor-pointer"
              >
                I have read and agree to the{" "}
                <a
                  href={TERMS_PDF_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline text-primary hover:text-primary/80"
                  onClick={(e) => e.stopPropagation()}
                >
                  Terms &amp; Conditions
                </a>
              </Label>
            </div>
          </div>

          <Button
            type="submit"
            className="w-full rounded-none"
            disabled={isSubmitting || !privacyChecked || !termsChecked}
          >
            {isSubmitting ? "Saving…" : "Save and continue"}
          </Button>
        </form>
      </div>
    </div>
  );
}
