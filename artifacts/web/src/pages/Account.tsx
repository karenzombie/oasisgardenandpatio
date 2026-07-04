import { useEffect, useState } from "react";
import { useLocation, useSearch, Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useLogout,
  useResendVerification,
  useGetWishlist,
  useGetAccountProfile,
  useUpdateAccountProfile,
  useUpdateAccountMarketingPreference,
  useUpsertAccountRoleAddress,
  useRequestAccountEmailChange,
  useVerifyAccountEmailChange,
  useCancelAccountEmailChange,
  getGetCurrentUserQueryKey,
  getGetAccountProfileQueryKey,
  type AccountProfileResponse,
  type AccountAddress,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { wishlistKeyFor } from "@/lib/wishlistHold";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import {
  MailWarning,
  CheckCircle2,
  LogOut,
  Heart,
  Pencil,
  MapPin,
} from "lucide-react";

function errorMessage(err: unknown, fallback: string): string {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data
      ?.error ??
    (err as { message?: string })?.message ??
    fallback
  );
}

interface AddressForm {
  recipientName: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
}

const EMPTY_ADDRESS_FORM: AddressForm = {
  recipientName: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  phone: "",
};

function toAddressForm(a: AccountAddress | null): AddressForm {
  if (!a) return EMPTY_ADDRESS_FORM;
  return {
    recipientName: a.recipientName ?? "",
    street1: a.street1,
    street2: a.street2 ?? "",
    city: a.city,
    state: a.state,
    zip: a.zip,
    phone: a.phone ?? "",
  };
}

function RoleAddressCard({
  role,
  label,
  address,
  onSaved,
}: {
  role: "billing" | "shipping";
  label: string;
  address: AccountAddress | null;
  onSaved: (profile: AccountProfileResponse) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<AddressForm>(toAddressForm(address));

  const mutation = useUpsertAccountRoleAddress({
    mutation: {
      onSuccess: (resp) => {
        onSaved(resp);
        setEditing(false);
        toast({ title: `${label} address saved` });
      },
      onError: (err) =>
        toast({
          title: "Error",
          description: errorMessage(err, "Could not save address."),
        }),
    },
  });

  function setField<K extends keyof AddressForm>(key: K, value: AddressForm[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function startEdit() {
    setForm(toAddressForm(address));
    setEditing(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.street1 || !form.city || !form.state || !form.zip) {
      toast({
        title: "Missing fields",
        description: "Street, city, state, and ZIP are required.",
      });
      return;
    }
    mutation.mutate({
      role,
      data: {
        recipientName: form.recipientName || undefined,
        street1: form.street1,
        street2: form.street2 || undefined,
        city: form.city,
        state: form.state,
        zip: form.zip,
        country: "US",
        phone: form.phone || undefined,
      },
    });
  }

  return (
    <div className="border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <MapPin className="w-4 h-4 text-primary" />
          <h3 className="font-serif text-lg">{label} Address</h3>
        </div>
        {!editing && (
          <Button
            size="sm"
            variant="outline"
            className="rounded-none"
            onClick={startEdit}
          >
            <Pencil className="w-3.5 h-3.5 mr-1.5" />
            {address ? "Edit" : "Add"}
          </Button>
        )}
      </div>

      {editing ? (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-3">
          <div>
            <Label htmlFor={`${role}-recipientName`}>Full name</Label>
            <Input
              id={`${role}-recipientName`}
              value={form.recipientName}
              onChange={(e) => setField("recipientName", e.target.value)}
              className="rounded-none"
            />
          </div>
          <div>
            <Label htmlFor={`${role}-street1`}>Street address *</Label>
            <Input
              id={`${role}-street1`}
              required
              value={form.street1}
              onChange={(e) => setField("street1", e.target.value)}
              className="rounded-none"
            />
          </div>
          <div>
            <Label htmlFor={`${role}-street2`}>Apt, suite, etc.</Label>
            <Input
              id={`${role}-street2`}
              value={form.street2}
              onChange={(e) => setField("street2", e.target.value)}
              className="rounded-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <Label htmlFor={`${role}-city`}>City *</Label>
              <Input
                id={`${role}-city`}
                required
                value={form.city}
                onChange={(e) => setField("city", e.target.value)}
                className="rounded-none"
              />
            </div>
            <div>
              <Label htmlFor={`${role}-state`}>State *</Label>
              <Input
                id={`${role}-state`}
                required
                maxLength={2}
                value={form.state}
                onChange={(e) =>
                  setField("state", e.target.value.toUpperCase())
                }
                className="rounded-none"
                placeholder="CA"
              />
            </div>
            <div>
              <Label htmlFor={`${role}-zip`}>ZIP *</Label>
              <Input
                id={`${role}-zip`}
                required
                value={form.zip}
                onChange={(e) => setField("zip", e.target.value)}
                className="rounded-none"
              />
            </div>
          </div>
          <div>
            <Label htmlFor={`${role}-phone`}>Phone</Label>
            <Input
              id={`${role}-phone`}
              type="tel"
              value={form.phone}
              onChange={(e) => setField("phone", e.target.value)}
              className="rounded-none"
            />
          </div>
          <div className="flex gap-3 pt-1">
            <Button
              type="submit"
              className="rounded-none"
              disabled={mutation.isPending}
            >
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-none"
              onClick={() => setEditing(false)}
              disabled={mutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : address ? (
        <div className="text-sm">
          {address.recipientName ? (
            <p className="font-medium">{address.recipientName}</p>
          ) : null}
          <p>{address.street1}</p>
          {address.street2 ? <p>{address.street2}</p> : null}
          <p>
            {address.city}, {address.state} {address.zip}
          </p>
          {address.phone ? (
            <p className="text-muted-foreground">{address.phone}</p>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No {label.toLowerCase()} address on file.
        </p>
      )}
    </div>
  );
}

export default function Account() {
  const { user, isLoading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const search = useSearch();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const params = new URLSearchParams(search);
  const isWelcome = params.get("welcome") === "1";

  const logoutMutation = useLogout();
  const resendMutation = useResendVerification();
  const [resendSent, setResendSent] = useState(false);

  const { data: profile } = useGetAccountProfile({
    query: {
      queryKey: getGetAccountProfileQueryKey(),
      enabled: isAuthenticated,
      retry: false,
    },
  });

  const setProfile = (p: AccountProfileResponse) =>
    queryClient.setQueryData(getGetAccountProfileQueryKey(), p);

  // Profile (name + phone) editing.
  const [editingProfile, setEditingProfile] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");

  const updateProfileM = useUpdateAccountProfile({
    mutation: {
      onSuccess: (p) => {
        setProfile(p);
        // Name lives on the user record too — refresh the auth user.
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        setEditingProfile(false);
        toast({ title: "Profile updated" });
      },
      onError: (err) =>
        toast({
          title: "Error",
          description: errorMessage(err, "Could not update profile."),
        }),
    },
  });

  // Email change flow.
  const [changingEmail, setChangingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [code, setCode] = useState("");

  const requestEmailM = useRequestAccountEmailChange({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getGetAccountProfileQueryKey(),
        });
        toast({
          title: "Verification code sent",
          description: "Enter the code we emailed to your new address.",
        });
      },
      onError: (err) =>
        toast({
          title: "Error",
          description: errorMessage(err, "Could not start email change."),
        }),
    },
  });
  const verifyEmailM = useVerifyAccountEmailChange({
    mutation: {
      onSuccess: (p) => {
        setProfile(p);
        queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        setChangingEmail(false);
        setNewEmail("");
        setCode("");
        toast({ title: "Email updated" });
      },
      onError: (err) =>
        toast({
          title: "Error",
          description: errorMessage(err, "Could not verify code."),
        }),
    },
  });
  const cancelEmailM = useCancelAccountEmailChange({
    mutation: {
      onSuccess: (p) => {
        setProfile(p);
        setChangingEmail(false);
        setNewEmail("");
        setCode("");
        toast({ title: "Email change cancelled" });
      },
      onError: (err) =>
        toast({
          title: "Error",
          description: errorMessage(err, "Could not cancel email change."),
        }),
    },
  });

  const marketingPreferenceM = useUpdateAccountMarketingPreference({
    mutation: {
      onSuccess: (p) => {
        setProfile(p);
        toast({ title: "Preference saved" });
      },
      onError: (err) =>
        toast({
          title: "Error",
          description: errorMessage(err, "Could not save preference."),
        }),
    },
  });

  const { data: wishlist } = useGetWishlist(undefined, {
    query: {
      queryKey: wishlistKeyFor(user?.id ?? null, null),
      enabled: isAuthenticated,
      retry: false,
      staleTime: 30_000,
    },
  });
  const wishlistItems = wishlist?.items ?? [];
  const wishlistPreview = wishlistItems.slice(0, 4);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/sign-in");
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (isLoading || !user) {
    return (
      <div className="w-full bg-muted/30 flex-1 flex items-center justify-center py-24">
        <Spinner className="size-8 text-primary" />
      </div>
    );
  }

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      await queryClient.invalidateQueries({
        queryKey: getGetCurrentUserQueryKey(),
      });
      queryClient.setQueryData(getGetCurrentUserQueryKey(), undefined);
      navigate("/");
    }
  };

  const handleResend = async () => {
    try {
      await resendMutation.mutateAsync();
      setResendSent(true);
    } catch {
      // ignore
    }
  };

  function startEditProfile() {
    setFirstName(profile?.firstName ?? user?.firstName ?? "");
    setLastName(profile?.lastName ?? user?.lastName ?? "");
    setPhone(profile?.phone ?? "");
    setEditingProfile(true);
  }

  function handleProfileSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!firstName.trim() || !lastName.trim()) {
      toast({
        title: "Missing fields",
        description: "First and last name are required.",
      });
      return;
    }
    updateProfileM.mutate({
      data: {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phone: phone.trim() ? phone.trim() : null,
      },
    });
  }

  function handleRequestEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!newEmail.trim()) {
      toast({ title: "Enter a new email address." });
      return;
    }
    requestEmailM.mutate({ data: { newEmail: newEmail.trim() } });
  }

  function handleVerifyEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) {
      toast({ title: "Enter the verification code." });
      return;
    }
    verifyEmailM.mutate({ data: { code: code.trim() } });
  }

  const email = profile?.email ?? user.email;
  const emailVerified = profile?.emailVerified ?? user.emailVerified;
  const pendingEmail = profile?.pendingEmail ?? null;
  const fullName =
    [profile?.firstName ?? user.firstName, profile?.lastName ?? user.lastName]
      .filter(Boolean)
      .join(" ") || "—";

  return (
    <div className="w-full bg-muted/30 flex-1">
      <div className="container mx-auto px-4 py-16 md:py-24 max-w-3xl">
        <div className="bg-card border border-border shadow-sm p-8 md:p-12">
          <div className="mb-8">
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">
              My Account
            </p>
            <h1 className="font-serif text-3xl md:text-4xl font-medium tracking-tight">
              Welcome back, {profile?.firstName ?? user.firstName ?? "friend"}.
            </h1>
            <div className="h-px w-12 bg-primary/40 mt-4" />
          </div>

          {isWelcome && (
            <div className="mb-8 border border-primary/30 bg-primary/5 text-foreground/80 text-sm px-4 py-3 rounded-sm flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-foreground">Account created</p>
                <p className="text-muted-foreground">
                  We&apos;ve sent a verification email to {email}. Please check
                  your inbox to confirm your address.
                </p>
              </div>
            </div>
          )}

          {!emailVerified && !isWelcome && (
            <div className="mb-8 border border-border bg-secondary/50 px-4 py-4 rounded-sm flex items-start gap-3">
              <MailWarning className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="flex-1 space-y-3">
                <div>
                  <p className="font-medium">Email not verified</p>
                  <p className="text-sm text-muted-foreground">
                    Please verify your email address to access all features.
                  </p>
                </div>
                {resendSent ? (
                  <p className="text-sm text-primary">
                    Verification email sent. Check your inbox.
                  </p>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-none border-primary text-primary hover:bg-primary hover:text-primary-foreground"
                    onClick={handleResend}
                    disabled={resendMutation.isPending}
                  >
                    {resendMutation.isPending ? (
                      <>
                        <Spinner className="mr-2" /> Sending…
                      </>
                    ) : (
                      "Resend verification email"
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Profile details */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl">Profile</h2>
              {!editingProfile && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  onClick={startEditProfile}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                </Button>
              )}
            </div>

            {editingProfile ? (
              <form
                onSubmit={handleProfileSubmit}
                className="grid grid-cols-1 sm:grid-cols-2 gap-4"
              >
                <div>
                  <Label htmlFor="firstName">First name *</Label>
                  <Input
                    id="firstName"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="rounded-none"
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Last name *</Label>
                  <Input
                    id="lastName"
                    required
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="rounded-none"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="rounded-none"
                  />
                </div>
                <div className="sm:col-span-2 flex gap-3">
                  <Button
                    type="submit"
                    className="rounded-none"
                    disabled={updateProfileM.isPending}
                  >
                    {updateProfileM.isPending ? "Saving…" : "Save Changes"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => setEditingProfile(false)}
                    disabled={updateProfileM.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            ) : (
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6">
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                    Name
                  </dt>
                  <dd className="text-base">{fullName}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                    Phone
                  </dt>
                  <dd className="text-base">{profile?.phone || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                    Account type
                  </dt>
                  <dd>
                    <Badge
                      variant={user.role === "customer" ? "outline" : "default"}
                      className="capitalize"
                    >
                      {user.role}
                    </Badge>
                  </dd>
                </div>
              </dl>
            )}
          </div>

          {/* Email */}
          <div className="border-t border-border pt-8 mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl">Email</h2>
              {!changingEmail && !pendingEmail && (
                <Button
                  size="sm"
                  variant="outline"
                  className="rounded-none"
                  onClick={() => {
                    setNewEmail("");
                    setCode("");
                    setChangingEmail(true);
                  }}
                >
                  <Pencil className="w-3.5 h-3.5 mr-1.5" /> Change
                </Button>
              )}
            </div>

            <div className="text-base flex items-center gap-2 flex-wrap mb-4">
              <span className="break-all">{email}</span>
              {emailVerified && (
                <Badge variant="secondary" className="text-[10px]">
                  Verified
                </Badge>
              )}
            </div>

            {pendingEmail && (
              <form
                onSubmit={handleVerifyEmail}
                className="border border-primary/30 bg-primary/5 p-4 space-y-3"
              >
                <p className="text-sm">
                  We sent a 6-digit code to{" "}
                  <span className="font-medium break-all">{pendingEmail}</span>.
                  Enter it below to confirm your new email.
                </p>
                <div className="max-w-[220px]">
                  <Label htmlFor="email-code">Verification code</Label>
                  <Input
                    id="email-code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={code}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/\D/g, ""))
                    }
                    className="rounded-none tracking-[0.4em] text-lg"
                    placeholder="000000"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
                  <Button
                    type="submit"
                    className="rounded-none"
                    disabled={verifyEmailM.isPending}
                  >
                    {verifyEmailM.isPending ? "Verifying…" : "Verify & Update"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none"
                    onClick={() =>
                      requestEmailM.mutate({ data: { newEmail: pendingEmail } })
                    }
                    disabled={requestEmailM.isPending}
                  >
                    {requestEmailM.isPending ? "Sending…" : "Resend code"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none text-destructive hover:text-destructive"
                    onClick={() => cancelEmailM.mutate()}
                    disabled={cancelEmailM.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}

            {changingEmail && !pendingEmail && (
              <form
                onSubmit={handleRequestEmail}
                className="border border-border bg-muted/30 p-4 space-y-3"
              >
                <div className="max-w-md">
                  <Label htmlFor="new-email">New email address</Label>
                  <Input
                    id="new-email"
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    className="rounded-none"
                    placeholder="you@example.com"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    We&apos;ll send a verification code to this address. Your
                    email changes only after you enter the code.
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button
                    type="submit"
                    className="rounded-none"
                    disabled={requestEmailM.isPending}
                  >
                    {requestEmailM.isPending ? "Sending…" : "Send code"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => setChangingEmail(false)}
                    disabled={requestEmailM.isPending}
                  >
                    Cancel
                  </Button>
                </div>
              </form>
            )}
          </div>

          {/* Billing & Shipping addresses */}
          <div className="border-t border-border pt-8 mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl">Addresses</h2>
              <Link
                href="/account/addresses"
                className="text-xs uppercase tracking-widest text-primary hover:underline"
              >
                Manage all
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <RoleAddressCard
                role="billing"
                label="Billing"
                address={profile?.billingAddress ?? null}
                onSaved={setProfile}
              />
              <RoleAddressCard
                role="shipping"
                label="Shipping"
                address={profile?.shippingAddress ?? null}
                onSaved={setProfile}
              />
            </div>
          </div>

          <div className="border-t border-border pt-8 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Heart
                  className={`w-5 h-5 ${
                    wishlistItems.length > 0
                      ? "fill-primary text-primary"
                      : "text-primary"
                  }`}
                />
                <h2 className="font-serif text-xl">My Wishlist</h2>
                {wishlistItems.length > 0 && (
                  <Badge variant="secondary" className="text-[10px]">
                    {wishlistItems.length}
                  </Badge>
                )}
              </div>
              <Link
                href="/account/wishlist"
                className="text-xs uppercase tracking-widest text-primary hover:underline"
              >
                View all
              </Link>
            </div>
            {wishlistItems.length === 0 ? (
              <div className="border border-border bg-muted/30 px-4 py-6 text-sm text-muted-foreground text-center">
                Your wishlist is empty.{" "}
                <Link href="/shop" className="text-primary hover:underline">
                  Browse products
                </Link>{" "}
                to start saving favorites.
              </div>
            ) : (
              <ul className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {wishlistPreview.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/shop/${item.slug}`}
                      className="block group"
                      title={item.name}
                    >
                      <div className="aspect-square bg-card border border-border overflow-hidden">
                        {item.primaryImageUrl ? (
                          <img
                            src={item.primaryImageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover mix-blend-multiply transition-transform group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted" />
                        )}
                      </div>
                      <p className="mt-2 text-xs font-serif line-clamp-2 group-hover:text-primary transition-colors">
                        {item.name}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Marketing contact preference */}
          <div className="border-t border-border pt-8 mb-8">
            <h2 className="font-serif text-xl mb-4">
              Marketing contact preference
            </h2>
            <div className="border border-border bg-card p-5 flex items-start justify-between gap-4">
              <div className="flex-1">
                <Label htmlFor="marketing-opt-out" className="text-sm font-medium">
                  Allow Oasis Garden &amp; Patio to contact me about my
                  wishlist and send me promotional emails.
                </Label>
                <p className="text-xs text-muted-foreground mt-2">
                  This applies to wishlist follow-ups and promotional emails.
                  It does not affect your order confirmations, shipping
                  updates, or delivery notifications.
                </p>
              </div>
              <Switch
                id="marketing-opt-out"
                checked={!(profile?.marketingOptOut ?? false)}
                disabled={marketingPreferenceM.isPending}
                onCheckedChange={(checked) =>
                  marketingPreferenceM.mutate({
                    data: { marketingOptOut: !checked },
                  })
                }
              />
            </div>
          </div>

          <div className="border-t border-border pt-8 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
            <div className="flex flex-col sm:flex-row gap-3 text-sm">
              <Button asChild variant="outline" className="rounded-none font-serif tracking-wide">
                <Link href="/account/wishlist">My Wishlist</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-none font-serif tracking-wide">
                <Link href="/account/orders">My Orders</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-none font-serif tracking-wide">
                <Link href="/account/addresses">My Addresses</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-none font-serif tracking-wide">
                <Link href="/cart">My Cart</Link>
              </Button>
            </div>
            <Button
              variant="outline"
              className="rounded-none font-serif tracking-wide"
              onClick={handleLogout}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? (
                <>
                  <Spinner className="mr-2" /> Logging out…
                </>
              ) : (
                <>
                  <LogOut className="w-4 h-4 mr-2" /> Log Out
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
