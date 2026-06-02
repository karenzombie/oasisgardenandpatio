import { useEffect } from "react";
import { Link, useLocation, useRoute } from "wouter";
import { useGetAccountOrder, getGetAccountOrderQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";

function formatMoney(v: string | number | null | undefined): string {
  if (v == null || v === "") return "$0.00";
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function statusLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function AccountOrderDetail() {
  const [, params] = useRoute<{ orderNumber: string }>(
    "/account/orders/:orderNumber",
  );
  const orderNumber = params?.orderNumber ?? "";
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && !isAuthenticated)
      navigate(
        `/login?next=${encodeURIComponent(`/account/orders/${orderNumber}`)}`,
      );
  }, [authLoading, isAuthenticated, navigate, orderNumber]);

  const { data, isLoading, error } = useGetAccountOrder(orderNumber, {
    query: {
      queryKey: getGetAccountOrderQueryKey(orderNumber),
      enabled: isAuthenticated && !!orderNumber,
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
        <Button asChild className="rounded-none mt-4">
          <Link href="/account/orders">Back to My Orders</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2 flex-wrap">
        <Link href="/account" className="hover:text-foreground">Account</Link>
        <span>/</span>
        <Link href="/account/orders" className="hover:text-foreground">Orders</Link>
        <span>/</span>
        <span className="text-foreground">{data.orderNumber}</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-8">
        <div>
          <h1 className="font-serif text-3xl md:text-4xl">
            Order {data.orderNumber}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Placed {formatDate(data.placedAt)}
          </p>
        </div>
        <span className="self-start inline-block px-3 py-1 border border-border bg-card uppercase text-xs tracking-widest">
          {statusLabel(data.status)}
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 border border-border bg-card p-6">
          <h2 className="font-serif text-xl mb-4">Items</h2>
          <ul className="divide-y divide-border">
            {data.items.map((item) => (
              <li key={item.id} className="py-4 flex justify-between gap-4 text-sm">
                <div className="min-w-0 flex gap-3">
                  {item.finishSwatchImageUrl ? (
                    <img
                      src={item.finishSwatchImageUrl}
                      alt={item.finishName ?? "Finish swatch"}
                      className="h-12 w-12 shrink-0 object-cover border border-border"
                    />
                  ) : null}
                  {item.swatchImageUrl ? (
                    <img
                      src={item.swatchImageUrl}
                      alt={item.fabricName ?? "Fabric swatch"}
                      className="h-12 w-12 shrink-0 object-cover border border-border"
                    />
                  ) : null}
                  <div className="min-w-0">
                    {item.slug ? (
                      <Link
                        href={`/shop/${item.slug}`}
                        className="hover:text-primary transition-colors"
                      >
                        {item.description}
                      </Link>
                    ) : (
                      <p>{item.description}</p>
                    )}
                    {item.finishName ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Finish: {item.finishName}
                      </p>
                    ) : null}
                    {item.fabricName ? (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Fabric: {item.fabricName}
                        {item.fabricItemNumber ? ` (${item.fabricItemNumber})` : ""}
                      </p>
                    ) : null}
                    <p className="text-xs text-muted-foreground mt-1">
                      {item.productSku ? `SKU ${item.productSku} · ` : ""}
                      {formatMoney(item.unitPrice)} × {item.quantity}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 font-serif">
                  {formatMoney(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        </div>

        <aside className="space-y-6">
          <div className="border border-border bg-card p-6 text-sm">
            <h2 className="font-serif text-xl mb-3">Totals</h2>
            <dl className="space-y-2">
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
            <div className="border border-border bg-card p-6 text-sm">
              <h2 className="font-serif text-xl mb-3">Shipping Address</h2>
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
              {data.shippingAddress.phone ? (
                <p className="text-muted-foreground mt-1">
                  {data.shippingAddress.phone}
                </p>
              ) : null}
            </div>
          ) : null}

          {data.shippingMethod ? (
            <div className="border border-border bg-card p-6 text-sm">
              <h2 className="font-serif text-xl mb-3">Shipping Method</h2>
              <p className="capitalize">{data.shippingMethod}</p>
              {data.specialInstructions ? (
                <>
                  <h3 className="font-serif mt-3 mb-1">Notes</h3>
                  <p className="text-muted-foreground">
                    {data.specialInstructions}
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </aside>
      </div>

      <div className="mt-8">
        <Button asChild variant="outline" className="rounded-none">
          <Link href="/account/orders">Back to Orders</Link>
        </Button>
      </div>
    </div>
  );
}
