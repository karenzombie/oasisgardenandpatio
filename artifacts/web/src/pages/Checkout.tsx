import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
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

// ---------------------------------------------------------------------------
// Authorize.net AcceptUI global types.
// The hosted lightbox form is served by Authorize.net — card data NEVER touches
// our DOM or server. The response handler receives the opaque token only.
// ---------------------------------------------------------------------------
type AcceptUIResponse = {
  messages: {
    resultCode: "Ok" | "Error";
    message: Array<{ code: string; text: string }>;
  };
  opaqueData?: {
    dataDescriptor: string;
    dataValue: string;
  };
};

declare global {
  interface Window {
    handleAcceptUIResponse?: (response: AcceptUIResponse) => void;
  }
}

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

  // Error shown near the AcceptUI button (address validation or gateway errors).
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Payload captured at AcceptUI-button click time; consumed by the global
  // response handler when Authorize.net returns the opaque token.
  const pendingOrderPayloadRef = useRef<
    Parameters<typeof placeOrderM.mutate>[0]["data"] | null
  >(null);

  // DOM ref for the AcceptUI trigger button. React lowercases all data-*
  // attribute names when set as JSX props (data-apiLoginID → data-apiloginid),
  // but AcceptUI requires the exact mixed-case names Authorize.net documents.
  // We set them imperatively via setAttribute() after mount instead.
  const acceptUIBtnRef = useRef<HTMLButtonElement | null>(null);

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

  // Apply AcceptUI data-* attributes with exact Authorize.net-documented casing.
  // Must run whenever paymentConfig changes (config loads async after mount).
  useEffect(() => {
    const btn = acceptUIBtnRef.current;
    if (!btn || !paymentConfig) return;
    btn.setAttribute("data-apiLoginID", paymentConfig.apiLoginId);
    btn.setAttribute("data-clientKey", paymentConfig.publicClientKey);
    btn.setAttribute("data-acceptUIFormBtnTxt", "Submit");
    btn.setAttribute("data-acceptUIFormHeaderTxt", "Card Information");
    btn.setAttribute(
      "data-paymentOptions",
      '{"showCreditCard": true, "showBankAccount": false}',
    );
    btn.setAttribute(
      "data-billingAddressOptions",
      '{"show":false,"required":false}',
    );
    btn.setAttribute("data-responseHandler", "handleAcceptUIResponse");
  }, [paymentConfig]);

  // Load the AcceptUI hosted-form script when config arrives.
  // v3/AcceptUI.js is the hosted lightbox form — different from v1/Accept.js.
  useEffect(() => {
    if (!paymentConfig || !isAuthenticated) return;
    const src = paymentConfig.sandbox
      ? "https://jstest.authorize.net/v3/AcceptUI.js"
      : "https://js.authorize.net/v3/AcceptUI.js";
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.charset = "utf-8";
    document.head.appendChild(script);
    // Intentionally not removing on unmount — removing and re-adding
    // causes AcceptUI to lose its delegated click listener.
  }, [paymentConfig, isAuthenticated]);

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
        if (data?.paymentDeclined) {
          // Show declined messages inline near the payment button so the
          // customer can immediately retry with a different card.
          setCheckoutError(message);
        } else {
          toast({ title: "Checkout failed", description: message });
        }
      },
    },
  });

  // Keep always-current refs so the global AcceptUI response handler is never
  // stale across renders without needing to re-register it every render.
  const placeOrderMutateRef = useRef(placeOrderM.mutate);
  useEffect(() => { placeOrderMutateRef.current = placeOrderM.mutate; });
  const setCheckoutErrorRef = useRef(setCheckoutError);
  useEffect(() => { setCheckoutErrorRef.current = setCheckoutError; });

  // Register the global AcceptUI response handler once. AcceptUI calls
  // window.handleAcceptUIResponse(response) when the hosted form completes.
  // The global is a thin bridge to the always-current refs above.
  useEffect(() => {
    window.handleAcceptUIResponse = (response: AcceptUIResponse) => {
      if (response.messages.resultCode === "Error" || !response.opaqueData) {
        const msg =
          response.messages.message[0]?.text ??
          "Payment could not be processed. Please try again.";
        setCheckoutErrorRef.current(msg);
        return;
      }
      const payload = pendingOrderPayloadRef.current;
      if (!payload) return;
      setCheckoutErrorRef.current(null);
      placeOrderMutateRef.current({
        data: {
          ...payload,
          paymentToken: {
            dataDescriptor: response.opaqueData.dataDescriptor,
            dataValue: response.opaqueData.dataValue,
          },
        },
      });
    };
    return () => {
      delete window.handleAcceptUIResponse;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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

  function validateGuestContact(): string | null {
    if (!guest.email.trim() || !EMAIL_RE.test(guest.email.trim())) {
      return "Enter a valid email address.";
    }
    if (!guest.firstName.trim() || !guest.lastName.trim()) {
      return "Enter your first and last name.";
    }
    if (guest.phone.trim().replace(/\D/g, "").length < 7) {
      return "Enter a phone number we can reach you at.";
    }
    return null;
  }

  /**
   * Click handler for the AcceptUI button. AcceptUI uses document-level click
   * delegation: calling e.stopPropagation() here prevents the delegated handler
   * from seeing the event, so the lightbox never opens when validation fails.
   *
   * On success, the current address payload is captured in pendingOrderPayloadRef
   * so the global response handler can include it in the place-order mutation.
   */
  function handleAcceptUIClick(e: React.MouseEvent<HTMLButtonElement>) {
    // Block double-submit while a mutation is already in flight.
    if (placeOrderM.isPending) {
      e.stopPropagation();
      return;
    }

    // Validate new-address form fields manually (the button is type="button"
    // so native HTML form validation does not fire automatically).
    if (selectedId === "new") {
      if (
        !form.street1.trim() ||
        !form.city.trim() ||
        !form.state.trim() ||
        !form.zip.trim()
      ) {
        setCheckoutError(
          "Please fill in the required shipping address fields (street, city, state, ZIP).",
        );
        e.stopPropagation();
        return;
      }
    }

    if (!paymentConfig) {
      setCheckoutError(
        "Payment configuration not available. Please refresh and try again.",
      );
      e.stopPropagation();
      return;
    }

    setCheckoutError(null);

    // Snapshot the current address payload. The global response handler reads
    // this ref when Authorize.net returns the opaque token.
    pendingOrderPayloadRef.current =
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

    // Allow the event to bubble — AcceptUI's document-level listener opens the
    // hosted lightbox form.
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
              {quote && shippingState ? (
                <p className="text-[11px] text-muted-foreground">
                  {quote.taxJurisdiction}
                  {quote.shippingWeightLbs > 0
                    ? ` · ${quote.shippingWeightLbs.toFixed(1)} lb`
                    : ""}
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
                {/* Security note — positioned directly under the Order Summary
                    box so it is visible alongside the Place Order button. */}
                <div className="mt-4 space-y-1 text-[11px] text-muted-foreground">
                  <p>
                    Your card details are entered securely via Authorize.net's
                    hosted form and never touch our page or server.
                  </p>
                  <p>Click <strong>Place Order</strong> to proceed to payment entry.</p>
                </div>

                {/* AcceptUI trigger button.
                    - className must include "AcceptUI": AcceptUI.js uses
                      document-level click delegation keyed on this class.
                    - All data-* attributes are set via setAttribute() in a
                      useEffect (see acceptUIBtnRef above) because React
                      lowercases mixed-case data-* names in JSX, which breaks
                      AcceptUI's attribute lookup.
                    - onClick validates the address; e.stopPropagation() keeps
                      the lightbox closed when validation fails. */}
                <button
                  ref={acceptUIBtnRef}
                  type="button"
                  className="AcceptUI w-full mt-3 bg-primary text-primary-foreground px-4 py-3 font-serif tracking-widest uppercase text-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  disabled={placeOrderM.isPending || !paymentConfig}
                  onClick={handleAcceptUIClick}
                >
                  {placeOrderM.isPending ? "Placing Order…" : "Place Order"}
                </button>
              </>
            ) : (
              <>
                <Button
                  type="submit"
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
