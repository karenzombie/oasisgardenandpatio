import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCart,
  useListAccountAddresses,
  usePlaceOrder,
  getGetCartQueryKey,
  getListAccountAddressesQueryKey,
  type AccountAddress,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";

function formatMoney(v: string | number | null | undefined): string {
  if (v == null || v === "") return "$0.00";
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
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

const EMPTY_FORM: AddressForm = {
  recipientName: "",
  street1: "",
  street2: "",
  city: "",
  state: "",
  zip: "",
  phone: "",
};

export default function Checkout() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  useEffect(() => {
    if (!authLoading && !isAuthenticated)
      navigate("/login?next=%2Fcheckout");
  }, [authLoading, isAuthenticated, navigate]);

  const { data: cart, isLoading: cartLoading } = useGetCart({
    query: {
      queryKey: getGetCartQueryKey(),
      enabled: isAuthenticated,
      retry: false,
    },
  });
  const { data: addrData } = useListAccountAddresses({
    query: {
      queryKey: getListAccountAddressesQueryKey(),
      enabled: isAuthenticated,
      retry: false,
    },
  });

  const addresses = addrData?.addresses ?? [];
  const [selectedId, setSelectedId] = useState<number | "new">("new");
  const [form, setForm] = useState<AddressForm>(() => ({
    ...EMPTY_FORM,
    recipientName:
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "",
  }));
  const [shippingMethod, setShippingMethod] = useState("standard");
  const [specialInstructions, setSpecialInstructions] = useState("");

  // Default to first saved address when they load
  useEffect(() => {
    if (addresses.length > 0 && selectedId === "new") {
      const def = addresses.find((a) => a.isDefault) ?? addresses[0];
      setSelectedId(def.id);
    }
  }, [addresses, selectedId]);

  // Keep recipient name in sync once user loads
  useEffect(() => {
    setForm((f) =>
      f.recipientName
        ? f
        : {
            ...f,
            recipientName:
              [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "",
          },
    );
  }, [user]);

  const placeOrderM = usePlaceOrder({
    mutation: {
      onSuccess: (resp) => {
        qc.setQueryData(getGetCartQueryKey(), {
          id: 0,
          items: [],
          itemCount: 0,
          subtotal: "0.00",
        });
        qc.invalidateQueries({ queryKey: getGetCartQueryKey() });
        navigate(`/order-confirmation/${encodeURIComponent(resp.orderNumber)}`);
      },
      onError: (err: unknown) => {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data
            ?.error ??
          (err as { message?: string })?.message ??
          "Could not place order.";
        toast({ title: "Checkout failed", description: message });
      },
    },
  });

  const subtotalNum = Number(cart?.subtotal ?? 0);
  const selectedAddress: AccountAddress | null = useMemo(() => {
    if (typeof selectedId === "number")
      return addresses.find((a) => a.id === selectedId) ?? null;
    return null;
  }, [addresses, selectedId]);
  const shippingState =
    (selectedAddress?.state ?? form.state).toUpperCase().trim();
  const shippingNum = shippingState === "CA" ? 0 : shippingState ? 50 : 0;
  const taxNum = 0;
  const totalNum = subtotalNum + shippingNum + taxNum;

  function setField<K extends keyof AddressForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (placeOrderM.isPending) return;

    if (typeof selectedId === "number") {
      placeOrderM.mutate({
        data: {
          shippingAddressId: selectedId,
          billingSameAsShipping: true,
          shippingMethod,
          specialInstructions: specialInstructions || undefined,
        },
      });
      return;
    }

    if (
      !form.street1 ||
      !form.city ||
      !form.state ||
      !form.zip
    ) {
      toast({
        title: "Missing address",
        description: "Street, city, state, and zip are required.",
      });
      return;
    }

    placeOrderM.mutate({
      data: {
        shippingAddress: {
          recipientName: form.recipientName || undefined,
          street1: form.street1,
          street2: form.street2 || undefined,
          city: form.city,
          state: form.state,
          zip: form.zip,
          country: "US",
          phone: form.phone || undefined,
        },
        billingSameAsShipping: true,
        shippingMethod,
        specialInstructions: specialInstructions || undefined,
      },
    });
  }

  if (authLoading || cartLoading) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <Spinner className="size-8 text-primary mx-auto" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="container mx-auto px-4 py-24 max-w-2xl text-center">
        <h1 className="font-serif text-3xl mb-3">Your cart is empty</h1>
        <p className="text-muted-foreground mb-6">
          Add an item to your cart before checking out.
        </p>
        <Button asChild className="rounded-none">
          <Link href="/shop">Browse the Shop</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
        <Link href="/cart" className="hover:text-foreground">Cart</Link>
        <span>/</span>
        <span className="text-foreground">Checkout</span>
      </nav>
      <h1 className="font-serif text-3xl md:text-4xl mb-8">Checkout</h1>

      <form
        onSubmit={handleSubmit}
        className="grid grid-cols-1 lg:grid-cols-3 gap-12"
      >
        <div className="lg:col-span-2 space-y-10">
          {/* Contact */}
          <section>
            <h2 className="font-serif text-xl mb-3">Contact</h2>
            <p className="text-sm text-muted-foreground">
              Signed in as <span className="text-foreground">{user?.email}</span>
            </p>
          </section>

          {/* Shipping address */}
          <section>
            <h2 className="font-serif text-xl mb-4">Shipping Address</h2>

            {addresses.length > 0 ? (
              <div className="space-y-2 mb-4">
                {addresses.map((a) => (
                  <label
                    key={a.id}
                    className={`flex items-start gap-3 border p-4 cursor-pointer ${
                      selectedId === a.id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-foreground/40"
                    }`}
                  >
                    <input
                      type="radio"
                      name="address"
                      checked={selectedId === a.id}
                      onChange={() => setSelectedId(a.id)}
                      className="mt-1"
                    />
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
                  </label>
                ))}
                <label
                  className={`flex items-center gap-3 border p-4 cursor-pointer ${
                    selectedId === "new"
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-foreground/40"
                  }`}
                >
                  <input
                    type="radio"
                    name="address"
                    checked={selectedId === "new"}
                    onChange={() => setSelectedId("new")}
                  />
                  <span className="text-sm">Use a new address</span>
                </label>
              </div>
            ) : null}

            {selectedId === "new" ? (
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
              </div>
            ) : null}
          </section>

          {/* Shipping method */}
          <section>
            <h2 className="font-serif text-xl mb-4">Shipping Method</h2>
            <label className="flex items-start gap-3 border border-primary bg-primary/5 p-4">
              <input
                type="radio"
                name="shippingMethod"
                checked={shippingMethod === "standard"}
                onChange={() => setShippingMethod("standard")}
                className="mt-1"
              />
              <div className="flex-1 text-sm">
                <p className="font-medium">Standard Delivery</p>
                <p className="text-muted-foreground">
                  Free within California. Flat $50 elsewhere. White-glove
                  scheduling provided after order placement.
                </p>
              </div>
              <span className="font-serif">{formatMoney(shippingNum)}</span>
            </label>
          </section>

          {/* Special instructions */}
          <section>
            <h2 className="font-serif text-xl mb-3">Order Notes</h2>
            <textarea
              value={specialInstructions}
              onChange={(e) => setSpecialInstructions(e.target.value)}
              rows={3}
              placeholder="Gate code, delivery preferences, etc."
              className="w-full rounded-none border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </section>

          {/* Payment placeholder */}
          <section>
            <h2 className="font-serif text-xl mb-3">Payment</h2>
            <div className="border border-dashed border-border p-5 bg-card text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1">
                Online payment coming soon
              </p>
              <p>
                Your order will be reserved with status <em>Pending Payment</em>.
                Our team will contact you to securely collect payment via phone
                or email. (Authorize.Net integration is in progress.)
              </p>
            </div>
          </section>
        </div>

        {/* Order summary */}
        <aside className="lg:col-span-1">
          <div className="border border-border bg-card p-6 sticky top-32">
            <h2 className="font-serif text-xl mb-4">Order Summary</h2>
            <ul className="divide-y divide-border mb-4 max-h-72 overflow-auto">
              {cart.items.map((item) => (
                <li key={item.id} className="py-3 flex gap-3 text-sm">
                  <div className="w-12 h-12 bg-background shrink-0 overflow-hidden">
                    {item.primaryImageUrl ? (
                      <img
                        src={item.primaryImageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover mix-blend-multiply"
                      />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{item.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Qty {item.quantity}
                    </p>
                  </div>
                  <span className="shrink-0">{formatMoney(item.lineTotal)}</span>
                </li>
              ))}
            </ul>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd>{formatMoney(subtotalNum)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Shipping</dt>
                <dd>{shippingNum === 0 && shippingState === "CA" ? "Free" : formatMoney(shippingNum)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Tax</dt>
                <dd className="text-muted-foreground">Calculated later</dd>
              </div>
            </dl>
            <div className="border-t border-border mt-4 pt-4 flex justify-between font-serif text-lg">
              <span>Total</span>
              <span>{formatMoney(totalNum)}</span>
            </div>
            <Button
              type="submit"
              disabled={placeOrderM.isPending}
              className="w-full rounded-none mt-6 font-serif tracking-widest uppercase"
            >
              {placeOrderM.isPending ? "Placing Order…" : "Place Order"}
            </Button>
            <p className="text-[11px] text-muted-foreground mt-3 text-center">
              By placing this order you agree to our terms. Payment will be
              collected separately.
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
