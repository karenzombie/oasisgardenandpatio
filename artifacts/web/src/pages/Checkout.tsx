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

  // Per-section billing/shipping form state
  const [billingForm, setBillingForm] = useState<AddressForm>(() => ({
    ...EMPTY_FORM,
    recipientName:
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "",
  }));
  const [shippingForm, setShippingForm] = useState<AddressForm>(EMPTY_FORM);

  // Saved address IDs — set when a signed-in customer's saved address prefills
  // the section. Cleared when they edit any field inline.
  const [billingSavedId, setBillingSavedId] = useState<number | null>(null);
  const [shippingSavedId, setShippingSavedId] = useState<number | null>(null);

  // "Shipping same as billing" checkbox — default checked
  const [shipSameBilling, setShipSameBilling] = useState(true);

  const [guest, setGuest] = useState<GuestContactForm>(EMPTY_GUEST);
  const [shippingMethod, setShippingMethod] = useState("standard");
  const [specialInstructions, setSpecialInstructions] = useState("");

  // Error shown near the HostedForm button (address validation or gateway errors).
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Persistent critical message for 500 (charge confirmed, order write failed)
  // and 503 (server-side interruption, unknown capture state). Never a toast —
  // stays on screen so the reference number and "do not resubmit" copy cannot
  // be dismissed. The one-shot latch is NOT reset on these paths.
  const [criticalError, setCriticalError] = useState<{
    title: string;
    body: string;
  } | null>(null);

  // One-shot latch: prevents react-acceptjs HostedForm from firing
  // placeOrderM.mutate more than once per card submission. The ref is set
  // synchronously inside the handler so a duplicate fire (before isPending
  // flips) is dropped. Reset onError ONLY on declines so the customer can
  // retry with a different card. NOT reset on 500/503 — do not resubmit.
  const orderSubmittedRef = useRef(false);
  // One-shot latch: prevents the saved-address prefill from re-running after
  // the customer has started editing. Set the first time addresses arrive.
  const prefillDoneRef = useRef(false);

  // Prefill billing and shipping sections from the customer's saved addresses
  // the first time the address list loads (signed-in only). Uses a ref so
  // editing a field does not re-trigger and overwrite what the customer typed.
  useEffect(() => {
    if (prefillDoneRef.current || addresses.length === 0) return;
    prefillDoneRef.current = true;

    const savedBilling = addresses.find((a) => a.type === "billing");
    if (savedBilling) {
      setBillingForm((prev) => ({
        recipientName: savedBilling.recipientName ?? prev.recipientName,
        street1: savedBilling.street1,
        street2: savedBilling.street2 ?? "",
        city: savedBilling.city,
        state: savedBilling.state,
        zip: savedBilling.zip,
        phone: savedBilling.phone ?? "",
      }));
      setBillingSavedId(savedBilling.id);
    }

    const savedShipping = addresses.find((a) => a.type === "shipping");
    if (savedShipping) {
      setShippingForm((prev) => ({
        recipientName: savedShipping.recipientName ?? prev.recipientName,
        street1: savedShipping.street1,
        street2: savedShipping.street2 ?? "",
        city: savedShipping.city,
        state: savedShipping.state,
        zip: savedShipping.zip,
        phone: savedShipping.phone ?? "",
      }));
      setShippingSavedId(savedShipping.id);
    }
  }, [addresses]);

  // Keep billing recipient name in sync once user loads (signed-in only).
  useEffect(() => {
    setBillingForm((f) =>
      f.recipientName
        ? f
        : {
            ...f,
            recipientName:
              [user?.firstName, user?.lastName].filter(Boolean).join(" ") || "",
          },
    );
  }, [user]);

  // For guests, mirror the contact name into the billing recipient unless
  // they've typed something different there.
  useEffect(() => {
    if (isAuthenticated) return;
    setBillingForm((f) => {
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
        // customFetch throws ApiError instances whose parsed JSON body is
        // at .data (not .response.data — that is the axios shape).
        const data = (
          err as {
            data?: {
              error?: string;
              paymentDeclined?: boolean;
              paymentUnavailable?: boolean;
            };
          }
        )?.data;
        const message =
          data?.error ??
          (err as { message?: string })?.message ??
          "Could not place order.";

        if (data?.paymentDeclined) {
          // Plain decline: reset latch so they can retry with a different card.
          orderSubmittedRef.current = false;
          setCheckoutError(message);
        } else if (data?.paymentUnavailable) {
          // 503: server-side interruption — unknown capture state.
          // Do NOT reset latch. Persistent display, not a toast.
          setCriticalError({
            title: "Please contact us before retrying",
            body: message,
          });
        } else {
          // 500: charge confirmed but order write failed.
          // Do NOT reset latch. Persistent display, not a toast.
          setCriticalError({
            title: "Payment received — please contact us",
            body: message,
          });
        }
      },
    },
  });

  const subtotalNum = Number(cart?.subtotal ?? 0);
  // shippingState/shippingZip drive the tax quote. When the checkbox is
  // checked, shipping inherits billing values; otherwise use the shipping form.
  const shippingState = (
    shipSameBilling ? billingForm.state : shippingForm.state
  ).toUpperCase().trim();
  const shippingZip = (
    shipSameBilling ? billingForm.zip : shippingForm.zip
  ).trim();

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

  // setBillingField / setShippingField clear the saved ID when the customer
  // edits inline, so the payload switches from shippingAddressId/billingAddressId
  // to inline address objects.
  function setBillingField<K extends keyof AddressForm>(key: K, value: string) {
    setBillingSavedId(null);
    setBillingForm((f) => ({ ...f, [key]: value }));
  }
  function setShippingField<K extends keyof AddressForm>(key: K, value: string) {
    setShippingSavedId(null);
    setShippingForm((f) => ({ ...f, [key]: value }));
  }
  function setGuestField<K extends keyof GuestContactForm>(
    key: K,
    value: string,
  ) {
    setGuest((g) => ({ ...g, [key]: value }));
  }

  // Billing is complete when the four required fields are non-empty.
  // (When a saved address is prefilling the form the fields are already filled.)
  const billingComplete = useMemo(
    () =>
      billingForm.street1.trim() !== "" &&
      billingForm.city.trim() !== "" &&
      billingForm.state.trim() !== "" &&
      billingForm.zip.trim() !== "",
    [billingForm],
  );

  // HostedForm is disabled until both billing and shipping are complete.
  const addressComplete = useMemo(() => {
    if (!billingComplete) return false;
    if (shipSameBilling) return true; // shipping inherits billing
    return (
      shippingForm.street1.trim() !== "" &&
      shippingForm.city.trim() !== "" &&
      shippingForm.state.trim() !== "" &&
      shippingForm.zip.trim() !== ""
    );
  }, [billingComplete, shipSameBilling, shippingForm]);

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

    // Build the shipping part: if checkbox is checked, shipping equals billing.
    const shippingSrc = shipSameBilling ? billingForm : shippingForm;
    const shippingSavedIdForPayload = shipSameBilling
      ? billingSavedId
      : shippingSavedId;
    const shippingPayload =
      shippingSavedIdForPayload !== null
        ? ({ shippingAddressId: shippingSavedIdForPayload } as const)
        : ({
            shippingAddress: {
              recipientName: shippingSrc.recipientName || undefined,
              street1: shippingSrc.street1,
              street2: shippingSrc.street2 || undefined,
              city: shippingSrc.city,
              state: shippingSrc.state,
              zip: shippingSrc.zip,
              phone: shippingSrc.phone || undefined,
            },
          } as const);

    // Build the billing part.
    const billingPayload = shipSameBilling
      ? ({ billingSameAsShipping: true } as const)
      : billingSavedId !== null
        ? ({ billingSameAsShipping: false, billingAddressId: billingSavedId } as const)
        : ({
            billingSameAsShipping: false,
            billingAddress: {
              recipientName: billingForm.recipientName || undefined,
              street1: billingForm.street1,
              street2: billingForm.street2 || undefined,
              city: billingForm.city,
              state: billingForm.state,
              zip: billingForm.zip,
              phone: billingForm.phone || undefined,
            },
          } as const);

    const addressPayload = {
      ...shippingPayload,
      ...billingPayload,
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

          {/* Billing address */}
          <section>
            <h2 className="font-serif text-xl mb-4">Billing Address</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="billingRecipientName">Full name</Label>
                <Input
                  id="billingRecipientName"
                  value={billingForm.recipientName}
                  onChange={(e) => setBillingField("recipientName", e.target.value)}
                  className="rounded-none"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="billingStreet1">Street address *</Label>
                <Input
                  id="billingStreet1"
                  required
                  value={billingForm.street1}
                  onChange={(e) => setBillingField("street1", e.target.value)}
                  className="rounded-none"
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="billingStreet2">Apt, suite, etc.</Label>
                <Input
                  id="billingStreet2"
                  value={billingForm.street2}
                  onChange={(e) => setBillingField("street2", e.target.value)}
                  className="rounded-none"
                />
              </div>
              <div>
                <Label htmlFor="billingCity">City *</Label>
                <Input
                  id="billingCity"
                  required
                  value={billingForm.city}
                  onChange={(e) => setBillingField("city", e.target.value)}
                  className="rounded-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="billingState">State *</Label>
                  <Input
                    id="billingState"
                    required
                    maxLength={2}
                    value={billingForm.state}
                    onChange={(e) =>
                      setBillingField("state", e.target.value.toUpperCase())
                    }
                    className="rounded-none"
                    placeholder="CA"
                  />
                </div>
                <div>
                  <Label htmlFor="billingZip">ZIP *</Label>
                  <Input
                    id="billingZip"
                    required
                    value={billingForm.zip}
                    onChange={(e) => setBillingField("zip", e.target.value)}
                    className="rounded-none"
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="billingPhone">Phone</Label>
                <Input
                  id="billingPhone"
                  type="tel"
                  value={billingForm.phone}
                  onChange={(e) => setBillingField("phone", e.target.value)}
                  className="rounded-none"
                />
              </div>
            </div>
          </section>

          {/* Shipping address */}
          <section>
            <h2 className="font-serif text-xl mb-4">Shipping Address</h2>
            <label className="flex items-center gap-2 text-sm cursor-pointer mb-4">
              <input
                type="checkbox"
                checked={shipSameBilling}
                onChange={(e) => setShipSameBilling(e.target.checked)}
                className="rounded"
              />
              Same as billing address
            </label>
            {!shipSameBilling ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="shippingRecipientName">Full name</Label>
                  <Input
                    id="shippingRecipientName"
                    value={shippingForm.recipientName}
                    onChange={(e) => setShippingField("recipientName", e.target.value)}
                    className="rounded-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="shippingStreet1">Street address *</Label>
                  <Input
                    id="shippingStreet1"
                    required
                    value={shippingForm.street1}
                    onChange={(e) => setShippingField("street1", e.target.value)}
                    className="rounded-none"
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="shippingStreet2">Apt, suite, etc.</Label>
                  <Input
                    id="shippingStreet2"
                    value={shippingForm.street2}
                    onChange={(e) => setShippingField("street2", e.target.value)}
                    className="rounded-none"
                  />
                </div>
                <div>
                  <Label htmlFor="shippingCity">City *</Label>
                  <Input
                    id="shippingCity"
                    required
                    value={shippingForm.city}
                    onChange={(e) => setShippingField("city", e.target.value)}
                    className="rounded-none"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="shippingState">State *</Label>
                    <Input
                      id="shippingState"
                      required
                      maxLength={2}
                      value={shippingForm.state}
                      onChange={(e) =>
                        setShippingField("state", e.target.value.toUpperCase())
                      }
                      className="rounded-none"
                      placeholder="CA"
                    />
                  </div>
                  <div>
                    <Label htmlFor="shippingZipInput">ZIP *</Label>
                    <Input
                      id="shippingZipInput"
                      required
                      value={shippingForm.zip}
                      onChange={(e) => setShippingField("zip", e.target.value)}
                      className="rounded-none"
                    />
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="shippingPhone">
                    Phone {!isAuthenticated ? "(uses your contact phone if blank)" : ""}
                  </Label>
                  <Input
                    id="shippingPhone"
                    type="tel"
                    value={shippingForm.phone}
                    onChange={(e) => setShippingField("phone", e.target.value)}
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

            {criticalError ? (
              <div className="mt-4 rounded border border-amber-400 bg-amber-50 p-4">
                <p className="font-semibold text-amber-900">
                  {criticalError.title}
                </p>
                <p className="mt-1 text-sm text-amber-800">{criticalError.body}</p>
              </div>
            ) : null}

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
                    Fill in your billing and shipping address above to enable payment.
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
