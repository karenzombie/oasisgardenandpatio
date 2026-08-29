import { Link, useRoute } from "wouter";
import { CheckCircle2, Clock } from "lucide-react";
import { useGetAccountOrder, getGetAccountOrderQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useAuth } from "@/lib/auth";

function formatMoney(v: string | number | null | undefined): string {
  if (v == null || v === "") return "$0.00";
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

export default function OrderConfirmation() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, params] = useRoute<{ orderNumber: string }>(
    "/order-confirmation/:orderNumber",
  );
  const orderNumber = params?.orderNumber ?? "";
  const { data, isLoading, error } = useGetAccountOrder(orderNumber, {
    query: {
      queryKey: getGetAccountOrderQueryKey(orderNumber),
      enabled: !!orderNumber && !authLoading,
      retry: false,
    },
  });

  if (authLoading || isLoading) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <Spinner className="size-8 text-primary mx-auto" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-24 max-w-xl text-center">
        <h1 className="font-serif text-3xl mb-3">Order not found</h1>
        <p className="text-muted-foreground mb-6">
          {isAuthenticated
            ? "We couldn't find that order. If you just placed it, please check your account."
            : "We couldn't find that order in this browser session."}
        </p>
        {!isAuthenticated ? (
          <div className="mb-6 flex items-start gap-3 border-l-4 border-[#C8843C] bg-[#FDF6EC] px-4 py-3 text-left text-[#7A4E15]">
            <span aria-hidden="true" className="mt-0.5 text-lg leading-none">
              ⚠
            </span>
            <div className="space-y-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                Placed an order as a guest?
              </p>
              <p className="text-sm leading-relaxed">
                Guest orders are only viewable in the browser they were placed in.
                Please check your email for your confirmation, or contact us at
                (661) 255-9909 or sales@oasisgardenandpatio.com and we'll look it up
                for you.
              </p>
            </div>
          </div>
        ) : null}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {isAuthenticated ? (
            <Button asChild className="rounded-none">
              <Link href="/account/orders">My Orders</Link>
            </Button>
          ) : (
            <>
              <Button type="button" disabled className="rounded-none">
                My Orders
              </Button>
              <Button asChild className="rounded-none">
                <Link href="/shop">Continue Shopping</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    );
  }

  const isHeld = data.paymentState.kind === "api_held";

  return (
    <div className="container mx-auto px-4 py-12 max-w-3xl">
      <div className="text-center mb-10">
        {isHeld ? (
          <>
            <Clock className="w-14 h-14 text-amber-500 mx-auto mb-4" />
            <h1 className="font-serif text-3xl md:text-4xl mb-2">
              Order received: payment under review
            </h1>
            <p className="text-muted-foreground mb-1">
              Reference:{" "}
              <span className="text-foreground font-medium">{data.orderNumber}</span>
            </p>
            <p className="text-muted-foreground max-w-lg mx-auto">
              Your order has been received and your payment is being reviewed.
              We'll contact you to confirm before your order is processed. You
              do not need to do anything, and please do not resubmit your order.
            </p>
          </>
        ) : (
          <>
            <CheckCircle2 className="w-14 h-14 text-primary mx-auto mb-4" />
            <h1 className="font-serif text-3xl md:text-4xl mb-2">
              Thank you for your order
            </h1>
            <p className="text-muted-foreground">
              Order{" "}
              <span className="text-foreground font-medium">{data.orderNumber}</span>{" "}
              has been received. We'll be in touch shortly to confirm delivery and
              collect payment.
            </p>
          </>
        )}
      </div>

      <div className="border border-border bg-card p-6 mb-6">
        <h2 className="font-serif text-xl mb-4">Order Summary</h2>
        <ul className="divide-y divide-border mb-4">
          {data.items.map((item) => (
            <li key={item.id} className="py-3 flex justify-between text-sm">
              <div>
                <p>{item.description}</p>
                <p className="text-xs text-muted-foreground">
                  {item.productSku ? `SKU ${item.productSku} · ` : ""}Qty{" "}
                  {item.quantity}
                </p>
                {item.addons && item.addons.length > 0 ? (
                  <ul className="mt-2 space-y-0.5">
                    {item.addons.map((a, idx) => (
                      <li
                        key={`${a.sku ?? a.name}-${idx}`}
                        className="text-xs text-muted-foreground flex justify-between gap-3"
                      >
                        <span>
                          Add-on: {a.name}
                          {a.quantity > 1 ? ` × ${a.quantity}` : ""}
                        </span>
                        <span>{formatMoney(a.amount)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <span>{formatMoney(item.amount)}</span>
            </li>
          ))}
        </ul>
        <dl className="space-y-2 text-sm border-t border-border pt-4">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd>{formatMoney(data.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Shipping</dt>
            <dd>{formatMoney(data.deliveryAmount)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Tax</dt>
            <dd>{formatMoney(data.taxAmount)}</dd>
          </div>
          <div className="flex justify-between font-serif text-lg pt-2 border-t border-border">
            <dt>Total</dt>
            <dd>{formatMoney(data.total)}</dd>
          </div>
        </dl>
      </div>

      {data.shippingAddress ? (
        <div className="border border-border bg-card p-6 mb-6 text-sm">
          <h2 className="font-serif text-xl mb-3">Shipping To</h2>
          {data.shippingAddress.recipientName ? (
            <p>{data.shippingAddress.recipientName}</p>
          ) : null}
          <p>{data.shippingAddress.street1}</p>
          {data.shippingAddress.street2 ? (
            <p>{data.shippingAddress.street2}</p>
          ) : null}
          <p>
            {data.shippingAddress.city}, {data.shippingAddress.state}{" "}
            {data.shippingAddress.zip}
          </p>
        </div>
      ) : null}

      {!isAuthenticated ? (
        <div className="mb-6 flex items-start gap-3 border-l-4 border-[#C8843C] bg-[#FDF6EC] px-4 py-3 text-left text-[#7A4E15]">
          <span aria-hidden="true" className="mt-0.5 text-lg leading-none">
            ⚠
          </span>
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              Keep your confirmation email
            </p>
            <p className="text-sm leading-relaxed">
              This order was placed as a guest, so it isn't linked to an account and
              can't be viewed again later. Your confirmation email is your receipt.{" "}
              <Link
                href="/sign-up"
                className="font-medium underline underline-offset-2 hover:no-underline"
              >
                Create an account
              </Link>{" "}
              to track future orders.
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        {isAuthenticated ? (
          <Button asChild variant="outline" className="rounded-none">
            <Link href="/account/orders">View My Orders</Link>
          </Button>
        ) : (
          <Button type="button" variant="outline" disabled className="rounded-none">
            View My Orders
          </Button>
        )}
        <Button asChild className="rounded-none">
          <Link href="/shop">Continue Shopping</Link>
        </Button>
      </div>
    </div>
  );
}
