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
// Accept.js browser global — card data is tokenised by Authorize.net's script,
// the raw PAN never reaches our server.
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    Accept?: {
      dispatchData: (
        secureData: {
          authData: { clientKey: string; apiLoginID: string };
          cardData: {
            cardNumber: string;
            month: string;
            year: string;
            cardCode: string;
          };
        },
        handler: (response: {
          messages: {
            resultCode: "Ok" | "Error";
            message: Array<{ code: string; text: string }>;
          };
          opaqueData?: { dataDescriptor: string; dataValue: string };
        }) => void,
      ) => void;
    };
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

  // Cart works for both authed users and guests now (session-keyed on the
  // server). No more redirect to /login — guests can complete a purchase by
  // providing their contact info.
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

  // Public Accept.js credentials — fetched here so the script can be loaded.
  // Enabled only for authenticated users (guests see the under-construction UI).
  const { data: paymentConfig } = useGetCheckoutPaymentConfig({
    query: {
      queryKey: getGetCheckoutPaymentConfigQueryKey(),
      enabled: isAuthenticated,
      retry: false,
    },
  });

  const addresses = addrData?.addresses ?? [];
  // Guests don't have a saved address book, so default to the new-address
  // form rather than picking from an empty list.
  const [selectedId, setSelectedId] = useState<number | "new">("new");
  const [form, setForm] = useState<AddressForm>(() => ({
    ...EMPTY_FORM,
    recipientName:
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "",
  }));
  const [guest, setGuest] = useState<GuestContactForm>(EMPTY_GUEST);
  const [shippingMethod, setShippingMethod] = useState("standard");
  const [specialInstructions, setSpecialInstructions] = useState("");

  // Card fields (Accept.js tokenisation, raw PAN stays in the browser).
  const [cardNumber, setCardNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [cardCode, setCardCode] = useState("");
  // True while Accept.dispatchData is in flight (before placeOrder fires).
  const [isTokenizing, setIsTokenizing] = useState(false);
  // Inline error shown below the card fields.
  const [cardError, setCardError] = useState<string | null>(null);

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
      // Only auto-fill while the field is blank or still matches the prior
      // computed value — never clobber a custom recipient the user typed.
      if (
        previousAuto === ""
        || /^[A-Za-z' .-]+ [A-Za-z' .-]+$/.test(previousAuto)
      ) {
        return { ...f, recipientName: auto };
      }
      return f;
    });
  }, [isAuthenticated, guest.firstName, guest.lastName]);

  // Load the Accept.js script once the payment config arrives.
  // The sandbox flag controls whether to use the test or live script URL.
  useEffect(() => {
    if (!paymentConfig || !isAuthenticated) return;
    const src = paymentConfig.sandbox
      ? "https://jstest.authorize.net/v1/Accept.js"
      : "https://js.authorize.net/v1/Accept.js";
    if (document.querySelector(`script[src="${src}"]`)) return;
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    document.head.appendChild(script);
    // Intentionally not removing the script on unmount — removing and
    // re-adding triggers reload races; Accept.js is lightweight and idempotent.
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
          // Show declined-card messages inline near the card fields so the
          // customer can immediately try a different card.
          setCardError(message);
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

  // Live quote — same monotonic-request guard as before so out-of-order
  // responses can't overwrite the displayed totals.
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
  // Shipping comes from the staff-managed Shipping rules and does NOT depend on
  // the destination address, so it's available straight from the cart even
  // before a tax quote resolves.
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

  // Format card number as XXXX XXXX XXXX XXXX (digits only, max 16).
  function handleCardNumberChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 16);
    const formatted = digits.replace(/(.{4})(?=.)/g, "$1 ");
    setCardNumber(formatted);
    setCardError(null);
  }

  // Format expiration date as MM/YY, inserting the slash automatically.
  function handleExpirationChange(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    if (digits.length <= 2) {
      setExpirationDate(digits);
    } else {
      setExpirationDate(`${digits.slice(0, 2)}/${digits.slice(2)}`);
    }
    setCardError(null);
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    // Non-authenticated users see the "under construction" UI and cannot submit.
    if (!isAuthenticated) return;

    // Validate card fields.
    const rawCard = cardNumber.replace(/\s/g, "");
    if (rawCard.length < 13 || rawCard.length > 19) {
      setCardError("Enter a valid card number.");
      return;
    }
    const expiryMatch = expirationDate.match(/^(\d{1,2})\/(\d{2,4})$/);
    if (!expiryMatch) {
      setCardError("Enter the expiration date as MM/YY.");
      return;
    }
    if (!cardCode.trim()) {
      setCardError("Enter the security code.");
      return;
    }
    if (!paymentConfig) {
      setCardError(
        "Payment configuration not available. Please refresh and try again.",
      );
      return;
    }
    if (!window.Accept) {
      setCardError("Payment is loading. Please try again in a moment.");
      return;
    }

    setCardError(null);
    setIsTokenizing(true);

    const month = expiryMatch[1].padStart(2, "0");
    const rawYear = expiryMatch[2];
    const year = rawYear.length === 2 ? `20${rawYear}` : rawYear;

    // Build the address portion of the request payload.
    const addressPayload: Parameters<typeof placeOrderM.mutate>[0]["data"] =
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

    // Tokenise the card via Accept.js. The raw PAN never reaches our server.
    window.Accept.dispatchData(
      {
        authData: {
          clientKey: paymentConfig.publicClientKey,
          apiLoginID: paymentConfig.apiLoginId,
        },
        cardData: { cardNumber: rawCard, month, year, cardCode: cardCode.trim() },
      },
      (response) => {
        setIsTokenizing(false);
        if (
          response.messages.resultCode === "Error" ||
          !response.opaqueData
        ) {
          const msg =
            response.messages.message[0]?.text ?? "Card could not be processed.";
          setCardError(msg);
          return;
        }
        placeOrderM.mutate({
          data: {
            ...addressPayload,
            paymentToken: {
              dataDescriptor: response.opaqueData.dataDescriptor,
              dataValue: response.opaqueData.dataValue,
            },
          },
        });
      },
    );
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

  const isSubmitting = isTokenizing || placeOrderM.isPending;

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
                  White-glove scheduling provided after order placement.
                  {shippingNum === 0
                    ? " Your order ships free."
                    : ""}
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

          {/* Payment */}
          <section>
            <h2 className="font-serif text-xl mb-3">Payment</h2>
            {isAuthenticated ? (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="cardNumber">Card number *</Label>
                  <Input
                    id="cardNumber"
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-number"
                    placeholder="1234 5678 9012 3456"
                    maxLength={19}
                    value={cardNumber}
                    onChange={(e) => handleCardNumberChange(e.target.value)}
                    className="rounded-none font-mono tracking-wider"
                    disabled={isSubmitting}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="expirationDate">Expiration *</Label>
                    <Input
                      id="expirationDate"
                      type="text"
                      inputMode="numeric"
                      autoComplete="cc-exp"
                      placeholder="MM/YY"
                      maxLength={5}
                      value={expirationDate}
                      onChange={(e) => handleExpirationChange(e.target.value)}
                      className="rounded-none"
                      disabled={isSubmitting}
                    />
                  </div>
                  <div>
                    <Label htmlFor="cardCode">Security code *</Label>
                    <Input
                      id="cardCode"
                      type="password"
                      inputMode="numeric"
                      autoComplete="cc-csc"
                      placeholder="CVV"
                      maxLength={4}
                      value={cardCode}
                      onChange={(e) => {
                        setCardCode(e.target.value.replace(/\D/g, "").slice(0, 4));
                        setCardError(null);
                      }}
                      className="rounded-none"
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                {cardError ? (
                  <p className="text-sm text-destructive">{cardError}</p>
                ) : null}
                <p className="text-[11px] text-muted-foreground">
                  Your card details are tokenised by Authorize.net and never
                  sent to our server.
                </p>
              </div>
            ) : (
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
            )}
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
            {isAuthenticated ? (
              <Button
                type="submit"
                disabled={isSubmitting}
                className="w-full rounded-none mt-6 font-serif tracking-widest uppercase"
              >
                {isTokenizing
                  ? "Verifying card…"
                  : placeOrderM.isPending
                    ? "Placing Order…"
                    : "Place Order"}
              </Button>
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
      </form>
    </div>
  );
}
