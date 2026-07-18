import { useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Package } from "lucide-react";
import {
  useListAccountOrders,
  getListAccountOrdersQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

function formatMoney(v: string | number | null | undefined): string {
  if (v == null || v === "") return "$0.00";
  const n = Number(v);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function statusLabel(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function PaymentBadge({ kind }: { kind: string | undefined }) {
  if (!kind) return null;
  if (kind === "api_paid") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded-none font-normal">
        Paid
      </Badge>
    );
  }
  if (kind === "manual") {
    return (
      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white text-[10px] px-1.5 py-0.5 rounded-none font-normal">
        Processed manually
      </Badge>
    );
  }
  if (kind === "api_held") {
    return (
      <Badge className="bg-amber-500 hover:bg-amber-500 text-white text-[10px] px-1.5 py-0.5 rounded-none font-normal">
        Under review
      </Badge>
    );
  }
  if (kind === "api_not_completed") {
    return (
      <Badge variant="destructive" className="text-[10px] px-1.5 py-0.5 rounded-none font-normal">
        Payment not completed, please contact us
      </Badge>
    );
  }
  if (kind === "balance_due") {
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0.5 rounded-none font-normal">
        Balance due
      </Badge>
    );
  }
  return null;
}

export default function AccountOrders() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!authLoading && !isAuthenticated)
      navigate("/login?next=%2Faccount%2Forders");
  }, [authLoading, isAuthenticated, navigate]);

  const { data, isLoading } = useListAccountOrders({
    query: {
      queryKey: getListAccountOrdersQueryKey(),
      enabled: isAuthenticated,
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

  const orders = data?.orders ?? [];

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
        <Link href="/account" className="hover:text-foreground">Account</Link>
        <span>/</span>
        <span className="text-foreground">Orders</span>
      </nav>
      <div className="flex items-center gap-3 mb-8">
        <Package className="w-6 h-6 text-primary" />
        <h1 className="font-serif text-3xl md:text-4xl">My Orders</h1>
      </div>

      {orders.length === 0 ? (
        <div className="border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground mb-4">
            You haven't placed any orders yet.
          </p>
          <Button asChild className="rounded-none">
            <Link href="/shop">Browse Products</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {orders.map((o) => (
            <li
              key={o.orderNumber}
              className="py-5 flex flex-col sm:flex-row sm:items-center gap-4"
            >
              <div className="flex-1 min-w-0">
                <Link
                  href={`/account/orders/${encodeURIComponent(o.orderNumber)}`}
                  className="font-serif text-lg hover:text-primary transition-colors"
                >
                  {o.orderNumber}
                </Link>
                <p className="text-xs text-muted-foreground mt-1">
                  Placed {formatDate(o.placedAt)} · {o.itemCount} item
                  {o.itemCount === 1 ? "" : "s"}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-block px-2 py-0.5 border border-border bg-background uppercase text-[11px] tracking-widest">
                  {statusLabel(o.status)}
                </span>
                <PaymentBadge kind={o.paymentState?.kind} />
              </div>
              <div className="font-serif text-lg sm:w-28 sm:text-right">
                {formatMoney(o.total)}
              </div>
              <Button asChild variant="outline" className="rounded-none">
                <Link
                  href={`/account/orders/${encodeURIComponent(o.orderNumber)}`}
                >
                  View
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
