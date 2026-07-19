import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Trash2, Minus, Plus, ShoppingBag } from "lucide-react";
import {
  useGetCart,
  useUpdateCartItem,
  useRemoveCartItem,
  getGetCartQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

function formatMoney(v: string | null | undefined): string {
  if (v == null || v === "") return "$0.00";
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

// Effective quantity floor for a cart line. Two sources can raise it: the
// configuration's minimum order quantity (variant/finish driven, served by the
// API as `minOrderQty`) and the striped-fabric pairs rule. Striped fabrics must
// stay even, so an odd floor is rounded up to the next even quantity.
function minQtyFor(item: {
  fabricIsStripe: boolean;
  minOrderQty?: number | null;
}): number {
  const floor = Math.max(1, item.minOrderQty ?? 1);
  if (!item.fabricIsStripe) return floor;
  const evenFloor = floor % 2 === 0 ? floor : floor + 1;
  return Math.max(2, evenFloor);
}

export default function Cart() {
  const { isAuthenticated } = useAuth();
  const isDemoUser = isAuthenticated;
  const qc = useQueryClient();

  // Cart is now anonymous-friendly: the API uses `req.session.id` to track a
  // guest cart so we no longer gate the page on authentication.
  const { data, isLoading } = useGetCart({
    query: {
      queryKey: getGetCartQueryKey(),
      retry: false,
    },
  });

  const updateM = useUpdateCartItem({
    mutation: {
      onSuccess: (resp) => qc.setQueryData(getGetCartQueryKey(), resp),
    },
  });
  const removeM = useRemoveCartItem({
    mutation: {
      onSuccess: (resp) => qc.setQueryData(getGetCartQueryKey(), resp),
    },
  });

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <Spinner className="size-8 text-primary mx-auto" />
      </div>
    );
  }

  const items = data?.items ?? [];
  const subtotal = Number(data?.subtotal ?? 0);
  const shipping = Number(data?.shipping ?? 0);
  const shippingWeightLbs = Number(data?.shippingWeightLbs ?? 0);
  const total = subtotal + shipping;

  // Group tied accessory lines (Aluminum Top Covers) beneath their parent base
  // line. Top-level lines (bases and independent stems) render normally; covers
  // render indented under their base with a locked quantity.
  const accessoriesByParent = new Map<number, typeof items>();
  for (const it of items) {
    if (it.parentCartItemId != null) {
      const list = accessoriesByParent.get(it.parentCartItemId) ?? [];
      list.push(it);
      accessoriesByParent.set(it.parentCartItemId, list);
    }
  }
  const topLevelItems = items.filter((it) => it.parentCartItemId == null);

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span>/</span>
        <span className="text-foreground">Cart</span>
      </nav>

      <div className="flex items-center gap-3 mb-8">
        <ShoppingBag className="w-6 h-6 text-primary" />
        <h1 className="font-serif text-3xl md:text-4xl">Shopping Cart</h1>
      </div>

      {items.length === 0 ? (
        <div className="border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground mb-4">Your cart is empty.</p>
          <Button asChild className="rounded-none">
            <Link href="/shop">Continue Shopping</Link>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {!isAuthenticated ? (
            <div className="lg:col-span-3 -mt-2 border border-border bg-muted/30 p-4 text-sm flex flex-wrap items-center justify-between gap-3">
              <p className="text-muted-foreground">
                Checking out as a guest is fine — no account required.{" "}
                <span className="text-foreground">Have an account?</span>
              </p>
              <Link
                href="/sign-in?redirect_url=%2Fcheckout"
                className="text-xs uppercase tracking-widest font-medium hover:text-primary"
              >
                Sign in for faster checkout →
              </Link>
            </div>
          ) : null}
          <ul className="lg:col-span-2 divide-y divide-border border-y border-border">
            {topLevelItems.map((item) => (
              <li key={item.id} className="py-5 flex flex-col gap-4">
              <div className="flex gap-5">
                <Link href={`/shop/${item.slug}`} className="shrink-0 w-24 h-24 bg-card overflow-hidden">
                  {item.primaryImageUrl ? (
                    <img src={item.primaryImageUrl} alt={item.name} className="w-full h-full object-cover mix-blend-multiply" />
                  ) : (
                    <div className="w-full h-full bg-muted" />
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  {item.manufacturerName ? (
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">{item.manufacturerName}</p>
                  ) : null}
                  <Link href={`/shop/${item.slug}`} className="font-serif text-lg hover:text-primary transition-colors">
                    {item.name}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-1">SKU {item.sku}</p>
                  {item.variantName ? (
                    <p className="text-xs text-foreground/80 mt-0.5">
                      <span className="text-muted-foreground">Finish:</span>{" "}
                      {item.variantName}
                    </p>
                  ) : null}
                  {item.finialName ? (
                    <p className="text-xs text-foreground/80 mt-0.5">
                      <span className="text-muted-foreground">Finial:</span>{" "}
                      {item.finialName}
                    </p>
                  ) : null}
                  {item.fabricName ? (
                    <p className="text-xs text-foreground/80 mt-0.5">
                      <span className="text-muted-foreground">Fabric:</span>{" "}
                      {item.fabricName}
                      {item.fabricItemNumber ? (
                        <span className="text-muted-foreground">
                          {" "}
                          ({item.fabricItemNumber})
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {item.addons.length > 0 ? (
                    <div className="mt-1.5 border-l-2 border-border pl-2 space-y-0.5">
                      {item.addons.map((a) => (
                        <p
                          key={a.addonOptionId}
                          className="text-xs text-foreground/80 flex justify-between gap-3"
                        >
                          <span>
                            <span className="text-muted-foreground">Add-on:</span>{" "}
                            {a.name}
                            {a.quantity > 1 ? ` × ${a.quantity}` : ""}
                          </span>
                          <span className="text-muted-foreground">
                            +{formatMoney(a.unitPrice)} each
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <p className="text-sm mt-1">{formatMoney(item.unitPrice)} each</p>
                  <div className="mt-3 flex items-center gap-3">
                    <div className="inline-flex items-center border border-input">
                      <button
                        type="button"
                        className="px-2 py-1.5 hover:bg-muted disabled:opacity-40"
                        onClick={() => {
                          const step = item.fabricIsStripe ? 2 : 1;
                          const min = minQtyFor(item);
                          updateM.mutate({
                            itemId: item.id,
                            data: { quantity: Math.max(min, item.quantity - step) },
                          });
                        }}
                        disabled={
                          item.quantity <= minQtyFor(item) || updateM.isPending
                        }
                        aria-label="Decrease quantity"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <span className="px-3 text-sm w-10 text-center">{item.quantity}</span>
                      <button
                        type="button"
                        className="px-2 py-1.5 hover:bg-muted disabled:opacity-40"
                        onClick={() =>
                          updateM.mutate({
                            itemId: item.id,
                            data: {
                              quantity: item.quantity + (item.fabricIsStripe ? 2 : 1),
                            },
                          })
                        }
                        disabled={updateM.isPending}
                        aria-label="Increase quantity"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="text-xs uppercase tracking-widest text-muted-foreground hover:text-destructive inline-flex items-center gap-1.5"
                      onClick={() => removeM.mutate({ itemId: item.id })}
                      disabled={removeM.isPending}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                  {item.minQtyFromFinish && (item.minOrderQty ?? 0) > 1 ? (
                    <div className="mt-3 border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground">
                      <span className="font-semibold">
                        Minimum order quantity of {item.minOrderQty}.
                      </span>{" "}
                      The quantity cannot be reduced below {minQtyFor(item)} due
                      to the selected finish.
                      {item.fabricIsStripe
                        ? " Striped fabrics are also sold in pairs, so the quantity adjusts in multiples of two."
                        : ""}
                    </div>
                  ) : item.fabricIsStripe ? (
                    <div className="mt-3 border border-border bg-secondary px-4 py-3 text-sm text-secondary-foreground">
                      <span className="font-semibold">Striped fabrics are sold in pairs.</span>{" "}
                      This canopy must be ordered in even quantities (2, 4, 6…), so
                      the quantity is set in multiples of two.
                    </div>
                  ) : null}
                </div>
                <div className="font-serif text-lg shrink-0 text-right">
                  {formatMoney(item.lineTotal)}
                </div>
              </div>
              {(accessoriesByParent.get(item.id) ?? []).map((cover) => (
                <div
                  key={cover.id}
                  className="ml-10 sm:ml-14 border-l-2 border-border pl-4 flex gap-4"
                >
                  <div className="shrink-0 w-16 h-16 bg-card overflow-hidden">
                    {cover.primaryImageUrl ? (
                      <img
                        src={cover.primaryImageUrl}
                        alt={cover.name}
                        className="w-full h-full object-cover mix-blend-multiply"
                      />
                    ) : (
                      <div className="w-full h-full bg-muted flex items-center justify-center text-[9px] text-muted-foreground text-center px-1">
                        No image available
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-0.5">
                      Aluminum Top Cover
                    </p>
                    <p className="font-serif text-base">{cover.name}</p>
                    {cover.finishName ? (
                      <p className="text-xs text-foreground/80 mt-0.5">
                        <span className="text-muted-foreground">Finish:</span>{" "}
                        {cover.finishName}
                      </p>
                    ) : null}
                    <p className="text-sm mt-1">
                      {formatMoney(cover.unitPrice)} each
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Qty {cover.quantity} — matches the base; removed with it.
                    </p>
                  </div>
                  <div className="font-serif text-base shrink-0 text-right">
                    {formatMoney(cover.lineTotal)}
                  </div>
                </div>
              ))}
              </li>
            ))}
          </ul>

          <aside className="lg:col-span-1">
            <div className="border border-border bg-card p-6 sticky top-32">
              <h2 className="font-serif text-xl mb-4">Order Summary</h2>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd>{formatMoney(String(subtotal))}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Shipping</dt>
                  <dd>{formatMoney(String(shipping))}</dd>
                </div>
                {shippingWeightLbs > 0 ? (
                  <p className="text-[11px] text-muted-foreground -mt-1">
                    {shippingWeightLbs.toFixed(1)} lb estimated
                  </p>
                ) : null}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Tax</dt>
                  <dd className="text-muted-foreground">Calculated at checkout</dd>
                </div>
              </dl>
              <div className="border-t border-border mt-4 pt-4 flex justify-between font-serif text-lg">
                <span>Total</span>
                <span>{formatMoney(String(total))}</span>
              </div>
              {isDemoUser ? (
                <Button
                  asChild
                  className="w-full rounded-none mt-6 font-serif tracking-widest uppercase"
                >
                  <Link href="/checkout">Proceed to Checkout</Link>
                </Button>
              ) : (
                <>
                  <Button
                    disabled
                    className="w-full rounded-none mt-6 font-serif tracking-widest uppercase opacity-50 cursor-not-allowed"
                  >
                    Proceed to Checkout
                  </Button>
                  <p className="text-xs text-muted-foreground mt-3 text-center">
                    This site is still under construction and not available for
                    online purchasing. Please visit{" "}
                    <a
                      href="https://www.oasispatioumbrellas.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      oasispatioumbrellas.com
                    </a>{" "}
                    to make a purchase.
                  </p>
                </>
              )}
              <Link
                href="/shop"
                className="block text-center text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground mt-4"
              >
                Continue Shopping
              </Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
