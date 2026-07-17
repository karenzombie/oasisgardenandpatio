import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { HostedForm } from "react-acceptjs";
import type { HostedFormDispatchDataResponse } from "react-acceptjs";
import {
  useGetCart,
  useGetCheckoutPaymentConfig,
  useListAccountAddresses,
  usePlaceOrder,
  useQuoteCheckout,
  getGetCartQueryKey,
  getGetCheckoutPaymentConfigQueryKey,
  getListAccountAddressesQueryKey,
  type AccountAddress,
  type CheckoutQuoteResponse,
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

interface GuestContactForm {
  email: string;
  firstName: string;
  lastName: string;
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

const EMPTY_GUEST: GuestContactForm = {
  email: "",
  firstName: "",
  lastName: "",
  phone: "",
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Checkout() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: cart, isLoading: cartLoading } = useGetCart({
    query: {
      queryKey: getGetCartQueryKey(),
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

  // Public AcceptUI credentials — only fetched for authenticated users.
  // Guests see the under-construction UI and never trigger payment.
  const { data: paymentConfig } = useGetCheckoutPaymentConfig({
    query: {
      queryKey: getGetCheckoutPaymentConfigQueryKey(),
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
  const [guest, setGuest] = useState<GuestContactForm>(EMPTY_GUEST);
  const [shippingMethod, setShippingMethod] = useState("standard");
  const [specialInstructions, setSpecialInstructions] = useState("");

  // Error shown near the HostedForm button (address validation or gateway errors).
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // One-shot latch: prevents react-acceptjs HostedForm from firing
  // placeOrderM.mutate more than once per card submission. The ref is set
  // synchronously inside the handler so a duplicate fire (before isPending
  // flips) is dropped. Reset onError so the customer can retry after a decline.
  const orderSubmittedRef = useRef(false);

  // Default to first saved address when they load (authed only)
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

  // For guests, mirror the contact name into the shipping recipient unless
  // they've typed something different there.
  useEffect(() => {
    if (isAuthenticated) return;
    setForm((f) => {
      const auto = `${guest.firstName} ${guest.lastName}`.trim();
      const previousAuto = f.recipientName.trim();
      if (
        previousAuto === ""
        || /^[A-Za-z' .-]+ [A-Za-z' .-]+$/.test(previousAuto)
      ) {
        return { ...f, recipientName: auto };
      }
      return f;
    });
  }, [isAuthenticated, guest.firstName, guest.lastName]);

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
        const heldSuffix = resp.heldForReview ? "?held=1" : "";
        navigate(`/order-confirmation/${encodeURIComponent(resp.orderNumber)}${heldSuffix}`);
      },
      onError: (err: unknown) => {
        const data = (
          err as {
            response?: {
              data?: { error?: string; paymentDeclined?: boolean };
            };
          }
        )?.response?.data;
        const message =
          data?.error ??
          (err as { message?: string })?.message ??
          "Could not place order.";
        // Reset the one-shot latch so the customer can retry after a decline.
        orderSubmittedRef.current = false;

        if (data?.paymentDeclined) {
          setCheckoutError(message);
        } else {
          toast({ title: "Checkout failed", description: message });
        }
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
  const shippingZip = (selectedAddress?.zip ?? form.zip).trim();

  const quoteM = useQuoteCheckout();
  const quoteMutate = quoteM.mutate;
  const [confirmedQuote, setConfirmedQuote] = useState<{
    key: { state: string; zip: string; subtotal: string };
    data: CheckoutQuoteResponse;
  } | null>(null);
  const quoteSeq = useRef(0);
  useEffect(() => {
    if (!cart || cart.items.length === 0) return;
    const subtotalKey = String(cart.subtotal ?? "");
    const myReq = ++quoteSeq.current;
    quoteMutate(
      {
        data: {
          state: shippingState || null,
          zip: shippingZip || null,
        },
      },
      {
        onSuccess: (data) => {
          if (myReq !== quoteSeq.current) return;
          setConfirmedQuote({
            key: {
              state: shippingState,
              zip: shippingZip,
              subtotal: subtotalKey,
            },
            data,
          });
        },
      },
    );
  }, [
    quoteMutate,
    shippingState,
    shippingZip,
    cart?.itemCount,
    cart?.subtotal,
    cart,
  ]);

  const quoteFresh =
    !!confirmedQuote &&
    confirmedQuote.key.state === shippingState &&
    confirmedQuote.key.zip === shippingZip &&
    confirmedQuote.key.subtotal === String(cart?.subtotal ?? "");
  const quote = quoteFresh ? confirmedQuote!.data : null;
  const cartShipping = Number(cart?.shipping ?? 0);
  const shippingNum = quote ? Number(quote.shipping) : cartShipping;
  const taxNum = quote ? Number(quote.tax) : 0;
  const totalNum = quote
    ? Number(quote.total)
    : subtotalNum + shippingNum + taxNum;

  function setField<K extends keyof AddressForm>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }
  function setGuestField<K extends keyof GuestContactForm>(
    key: K,
    value: string,
  ) {
    setGuest((g) => ({ ...g, [key]: value }));
  }

  // HostedForm is disabled until a valid shipping address is present. This
  // prevents the card popup from opening when the customer hasn't filled in
  // their address yet, providing a clear ordering of steps.
  const addressComplete = useMemo(() => {
    if (typeof selectedId === "number") return true; // saved address selected
    return (
      form.street1.trim() !== "" &&
      form.city.trim() !== "" &&
      form.state.trim() !== "" &&
      form.zip.trim() !== ""
    );
  }, [selectedId, form]);

  /**
   * Called by react-acceptjs HostedForm when Authorize.net returns a result.
   * Address is read from current state — no stale closure risk because
   * HostedForm passes a fresh closure on every render.
   */
  function handleHostedFormSubmit(response: HostedFormDispatchDataResponse) {
    if (response.messages.resultCode === "Error" || !response.opaqueData) {
      const msg =
        response.messages.message[0]?.text ??
        "Payment could not be processed. Please try again.";
      setCheckoutError(msg);
      return;
    }

    setCheckoutError(null);

    // One-shot latch: blocks duplicate onSubmit fires that race before
    // isPending flips (the ref update is synchronous, the state update is not).
    if (orderSubmittedRef.current) return;
    orderSubmittedRef.current = true;

    const addressPayload =
      typeof selectedId === "number"
        ? {
            shippingAddressId: selectedId,
            billingSameAsShipping: true,
            shippingMethod,
            specialInstructions: specialInstructions || undefined,
          }
        : {
            shippingAddress: {
              recipientName: form.recipientName || undefined,
              street1: form.street1,
              street2: form.street2 || undefined,
              city: form.city,
              state: form.state,
              zip: form.zip,
              phone: form.phone || undefined,
            },
            billingSameAsShipping: true,
            shippingMethod,
            specialInstructions: specialInstructions || undefined,
          };

    placeOrderM.mutate({
      data: {
        ...addressPayload,
        paymentToken: {
          dataDescriptor: response.opaqueData.dataDescriptor,
          dataValue: response.opaqueData.dataValue,
        },
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
          <Link href="/shop">Browse Products</Link>
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

      {/* No onSubmit — the AcceptUI button is type="button" and handles its own
          click flow. The form wrapper is kept for browser autofill grouping. */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-10">
          {/* Contact */}
          <section>
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="font-serif text-xl">Contact</h2>
              {!isAuthenticated ? (
                <Link
                  href="/sign-in?redirect_url=%2Fcheckout"
                  className="text-xs uppercase tracking-widest text-muted-foreground hover:text-primary"
                >
                  Sign in for faster checkout →
                </Link>
              ) : null}
            </div>
            {isAuthenticated ? (
              <p className="text-sm text-muted-foreground">
                Signed in as <span className="text-foreground">{user?.email}</span>
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="contact-email">Email *</Label>
                  <Input
                    id="contact-email"
                    type="email"
                    autoComplete="email"
                    required
                    value={guest.email}
                    onChange={(e) => setGuestField("email", e.target.value)}
                    className="rounded-none"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    We'll send your order confirmation here.
                  </p>
                </div>
                <div>
                  <Label htmlFor="contact-first">First name *</Label>
                  <Input
                    id="contact-first"
                    autoComplete="given-name"
                    required
                    value={guest.firstName}
                    onChange={(e) => setGuestField("firstName", e.target.value)}
                    className="rounded-none"
                  />
                </div>
                <div>
                  <Label htmlFor="contact-last">Last name *</Label>
                  <Input
                    id="contact-last"
                    autoComplete="family-name"
                    required
                    value={guest.lastName}
                    onChange={(e) => setGuestField("lastName", e.target.value)}
                    className="rounded-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="contact-phone">Phone *</Label>
                  <Input
                    id="contact-phone"
                    type="tel"
                    autoComplete="tel"
                    required
                    value={guest.phone}
                    onChange={(e) => setGuestField("phone", e.target.value)}
                    className="rounded-none"
                  />
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Used to schedule delivery and confirm payment.
                  </p>
                </div>
              </div>
            )}
          </section>

          {/* Shipping address */}
          <section>
            <h2 className="font-serif text-xl mb-4">Shipping Address</h2>

            {isAuthenticated && addresses.length > 0 ? (
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
                  <Label htmlFor="phone">
                    Phone {!isAuthenticated ? "(uses your contact phone if blank)" : ""}
                  </Label>
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

          {/* Payment — under-construction notice for guests only.
              Authenticated users see the security note in the Order Summary
              sidebar directly above the Place Order button. */}
          {!isAuthenticated ? (
            <section>
              <h2 className="font-serif text-xl mb-3">Payment</h2>
              <div className="border border-dashed border-border p-5 bg-card text-sm text-muted-foreground">
                <p>
                  This site is still under construction and not available for
                  online purchasing. Please visit{" "}
                  <a
                    href="https://www.oasispatioumbrellas.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-foreground hover:text-primary"
                  >
                    oasispatioumbrellas.com
                  </a>{" "}
                  if you're looking to make a purchase.
                </p>
              </div>
            </section>
          ) : null}
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
                <dd>{shippingNum === 0 ? "Free" : formatMoney(shippingNum)}</dd>
              </div>
              {/* Weight shown under Shipping so the customer can see why
                  shipping costs what it does. */}
              {quote && quote.shippingWeightLbs > 0 ? (
                <p className="text-[11px] text-muted-foreground -mt-1">
                  {quote.shippingWeightLbs.toFixed(1)} lb estimated
                </p>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">
                  Tax
                  {quote && quote.taxRate > 0
                    ? ` (${(quote.taxRate * 100).toFixed(2)}%)`
                    : ""}
                </dt>
                <dd>
                  {!shippingState
                    ? "Enter address"
                    : !quoteFresh
                      ? "Calculating…"
                      : formatMoney(taxNum)}
                </dd>
              </div>
              {quote && shippingState && quote.taxJurisdiction ? (
                <p className="text-[11px] text-muted-foreground">
                  {quote.taxJurisdiction}
                </p>
              ) : null}
            </dl>
            <div className="border-t border-border mt-4 pt-4 flex justify-between font-serif text-lg">
              <span>Total</span>
              <span>{formatMoney(totalNum)}</span>
            </div>

            {checkoutError ? (
              <p className="text-sm text-destructive mt-4">{checkoutError}</p>
            ) : null}

            {isAuthenticated ? (
              <>
                {/* Security note directly under the Total line. */}
                <p className="mt-4 text-[11px] text-muted-foreground">
                  Your card details are entered securely via Authorize.net's
                  hosted form and never touch our page or server.
                </p>

                {/* react-acceptjs HostedForm renders the AcceptUI popup button.
                    disabled= keeps the button locked until the address is
                    complete and no mutation is in flight (double-submit guard).
                    onSubmit fires with the opaque token after card entry. */}
                {paymentConfig ? (
                  <HostedForm
                    authData={{
                      apiLoginID: paymentConfig.apiLoginId,
                      clientKey: paymentConfig.publicClientKey,
                    }}
                    environment={paymentConfig.sandbox ? "SANDBOX" : "PRODUCTION"}
                    onSubmit={handleHostedFormSubmit}
                    billingAddressOptions={{ show: false, required: false }}
                    paymentOptions={{ showCreditCard: true, showBankAccount: false }}
                    formHeaderText="Card Information"
                    formButtonText="Submit"
                    buttonText={placeOrderM.isPending ? "Placing Order…" : "Place Order"}
                    disabled={!addressComplete || placeOrderM.isPending}
                    containerClassName="w-full mt-3"
                    buttonClassName="w-full bg-primary text-primary-foreground px-4 py-3 font-serif tracking-widest uppercase text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  />
                ) : (
                  <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                    <Spinner className="size-4" />
                    <span>Loading payment form…</span>
                  </div>
                )}

                {/* Hint shown below the button so customers know clicking
                    Place Order opens the secure card entry popup. */}
                {!placeOrderM.isPending && addressComplete && paymentConfig ? (
                  <p className="mt-2 text-[11px] text-muted-foreground text-center">
                    Click <strong>Place Order</strong> to proceed to payment entry.
                  </p>
                ) : null}

                {/* Prompt shown when address is not yet complete. */}
                {!addressComplete ? (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Fill in your shipping address above to enable payment.
                  </p>
                ) : null}
              </>
            ) : (
              <>
                <Button
                  type="button"
                  disabled
                  className="w-full rounded-none mt-6 font-serif tracking-widest uppercase opacity-50 cursor-not-allowed"
                >
                  Place Order
                </Button>
                <p className="text-[11px] text-muted-foreground mt-3 text-center">
                  This site is still under construction and not available for
                  online purchasing. Please visit{" "}
                  <a
                    href="https://www.oasispatioumbrellas.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-primary"
                  >
                    oasispatioumbrellas.com
                  </a>{" "}
                  to make a purchase.
                </p>
              </>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
