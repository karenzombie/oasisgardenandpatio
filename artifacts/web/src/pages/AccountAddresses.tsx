import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { MapPin, Pencil, Trash2, Star, Plus } from "lucide-react";
import {
  useListAccountAddresses,
  useCreateAccountAddress,
  useUpdateAccountAddress,
  useDeleteAccountAddress,
  getListAccountAddressesQueryKey,
  type AccountAddress,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddressForm {
  recipientName: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  isDefault: boolean;
}

const EMPTY_FORM: AddressForm = {
  recipientName: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  phone: "",
  isDefault: false,
};

function toForm(a: AccountAddress): AddressForm {
  return {
    recipientName: a.recipientName ?? "",
    street1: a.street1,
    street2: a.street2 ?? "",
    city: a.city,
    state: a.state,
    zip: a.zip,
    phone: a.phone ?? "",
    isDefault: a.isDefault,
  };
}

function formToBody(f: AddressForm) {
  return {
    recipientName: f.recipientName || undefined,
    street1: f.street1,
    street2: f.street2 || undefined,
    city: f.city,
    state: f.state,
    zip: f.zip,
    country: "US",
    phone: f.phone || undefined,
    isDefault: f.isDefault,
  };
}

export default function AccountAddresses() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { toast } = useToast();

  useEffect(() => {
    if (!authLoading && !isAuthenticated)
      navigate("/login?next=%2Faccount%2Faddresses");
  }, [authLoading, isAuthenticated, navigate]);

  const { data, isLoading } = useListAccountAddresses({
    query: {
      queryKey: getListAccountAddressesQueryKey(),
      enabled: isAuthenticated,
      retry: false,
    },
  });

  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [form, setForm] = useState<AddressForm>(EMPTY_FORM);

  function setField<K extends keyof AddressForm>(
    key: K,
    value: AddressForm[K],
  ) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  const onSuccess = (resp: { addresses: AccountAddress[] }) => {
    qc.setQueryData(getListAccountAddressesQueryKey(), resp);
    setEditingId(null);
    setForm(EMPTY_FORM);
  };
  const onError = (err: unknown) => {
    const message =
      (err as { response?: { data?: { error?: string } } })?.response?.data
        ?.error ??
      (err as { message?: string })?.message ??
      "Could not save address.";
    toast({ title: "Error", description: message });
  };

  const createM = useCreateAccountAddress({
    mutation: { onSuccess: (r) => { onSuccess(r); toast({ title: "Address added" }); }, onError },
  });
  const updateM = useUpdateAccountAddress({
    mutation: { onSuccess: (r) => { onSuccess(r); toast({ title: "Address updated" }); }, onError },
  });
  const deleteM = useDeleteAccountAddress({
    mutation: {
      onSuccess: (r) => {
        qc.setQueryData(getListAccountAddressesQueryKey(), r);
        toast({ title: "Address deleted" });
      },
      onError,
    },
  });
  const setDefaultM = useUpdateAccountAddress({
    mutation: {
      onSuccess: (r) => {
        qc.setQueryData(getListAccountAddressesQueryKey(), r);
        toast({ title: "Default address updated" });
      },
      onError,
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <Spinner className="size-8 text-primary mx-auto" />
      </div>
    );
  }

  const addresses = data?.addresses ?? [];

  function startNew() {
    setForm(EMPTY_FORM);
    setEditingId("new");
  }
  function startEdit(a: AccountAddress) {
    setForm(toForm(a));
    setEditingId(a.id);
  }
  function cancel() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.street1 || !form.city || !form.state || !form.zip) {
      toast({
        title: "Missing fields",
        description: "Street, city, state, and zip are required.",
      });
      return;
    }
    if (editingId === "new") {
      createM.mutate({ data: formToBody(form) });
    } else if (typeof editingId === "number") {
      updateM.mutate({ addressId: editingId, data: formToBody(form) });
    }
  }

  function handleSetDefault(a: AccountAddress) {
    setDefaultM.mutate({
      addressId: a.id,
      data: formToBody({ ...toForm(a), isDefault: true }),
    });
  }

  function handleDelete(a: AccountAddress) {
    if (
      !confirm(
        `Delete this address?\n\n${a.street1}, ${a.city}, ${a.state} ${a.zip}`,
      )
    )
      return;
    deleteM.mutate({ addressId: a.id });
  }

  const isSaving = createM.isPending || updateM.isPending;

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span>/</span>
        <Link href="/account" className="hover:text-foreground">My Account</Link>
        <span>/</span>
        <span className="text-foreground">Addresses</span>
      </nav>

      <div className="flex items-center justify-between gap-3 mb-8">
        <div className="flex items-center gap-3">
          <MapPin className="w-6 h-6 text-primary" />
          <h1 className="font-serif text-3xl md:text-4xl">My Addresses</h1>
        </div>
        {editingId === null ? (
          <Button onClick={startNew} className="rounded-none">
            <Plus className="w-4 h-4 mr-2" /> Add Address
          </Button>
        ) : null}
      </div>

      {addresses.length === 0 && editingId === null ? (
        <div className="border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground mb-4">
            You haven't saved any addresses yet.
          </p>
          <Button onClick={startNew} className="rounded-none">
            <Plus className="w-4 h-4 mr-2" /> Add Your First Address
          </Button>
        </div>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {addresses.map((a) => {
            const isEditing = editingId === a.id;
            return (
              <li
                key={a.id}
                className={`border bg-card p-5 ${
                  isEditing ? "border-primary" : "border-border"
                }`}
              >
                {isEditing ? null : (
                  <>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="text-sm">
                        {a.recipientName ? (
                          <p className="font-medium">{a.recipientName}</p>
                        ) : null}
                        <p>{a.street1}</p>
                        {a.street2 ? <p>{a.street2}</p> : null}
                        <p>
                          {a.city}, {a.state} {a.zip}
                        </p>
                        {a.phone ? (
                          <p className="text-muted-foreground">{a.phone}</p>
                        ) : null}
                      </div>
                      {a.isDefault ? (
                        <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-widest px-2 py-1 bg-primary/10 text-primary border border-primary/30">
                          <Star className="w-3 h-3" /> Default
                        </span>
                      ) : null}
                    </div>
                    <div className="border-t border-border mt-3 pt-3 flex flex-wrap gap-2">
                      {!a.isDefault ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="rounded-none"
                          onClick={() => handleSetDefault(a)}
                          disabled={setDefaultM.isPending}
                        >
                          <Star className="w-3.5 h-3.5 mr-1.5" /> Set Default
                        </Button>
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-none"
                        onClick={() => startEdit(a)}
                        disabled={editingId !== null}
                      >
                        <Pencil className="w-3.5 h-3.5 mr-1.5" /> Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-none text-destructive hover:text-destructive"
                        onClick={() => handleDelete(a)}
                        disabled={deleteM.isPending || editingId !== null}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1.5" /> Delete
                      </Button>
                    </div>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editingId !== null ? (
        <form
          onSubmit={handleSubmit}
          className="border border-border bg-card p-6 max-w-2xl"
        >
          <h2 className="font-serif text-xl mb-4">
            {editingId === "new" ? "Add a New Address" : "Edit Address"}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label htmlFor="recipientName">Full name</Label>
              <Input
                id="recipientName"
                value={form.recipientName}
                onChange={(e) => setField("recipientName", e.target.value)}
                className="rounded-none"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="street1">Street address *</Label>
              <Input
                id="street1"
                required
                value={form.street1}
                onChange={(e) => setField("street1", e.target.value)}
                className="rounded-none"
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="street2">Apt, suite, etc.</Label>
              <Input
                id="street2"
                value={form.street2}
                onChange={(e) => setField("street2", e.target.value)}
                className="rounded-none"
              />
            </div>
            <div>
              <Label htmlFor="city">City *</Label>
              <Input
                id="city"
                required
                value={form.city}
                onChange={(e) => setField("city", e.target.value)}
                className="rounded-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="state">State *</Label>
                <Input
                  id="state"
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
                <Label htmlFor="zip">ZIP *</Label>
                <Input
                  id="zip"
                  required
                  value={form.zip}
                  onChange={(e) => setField("zip", e.target.value)}
                  className="rounded-none"
                />
              </div>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={form.phone}
                onChange={(e) => setField("phone", e.target.value)}
                className="rounded-none"
              />
            </div>
            <label className="md:col-span-2 flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={form.isDefault}
                onChange={(e) => setField("isDefault", e.target.checked)}
              />
              Make this my default address
            </label>
          </div>
          <div className="border-t border-border mt-6 pt-6 flex gap-3">
            <Button
              type="submit"
              className="rounded-none"
              disabled={isSaving}
            >
              {isSaving
                ? "Saving…"
                : editingId === "new"
                  ? "Add Address"
                  : "Save Changes"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="rounded-none"
              onClick={cancel}
              disabled={isSaving}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
