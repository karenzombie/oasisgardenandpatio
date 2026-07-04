import { useState } from "react";
import { Link, useParams } from "wouter";
import { ArrowLeft, Mail, Printer } from "lucide-react";
import {
  useAdminGetWishlist,
  getAdminGetWishlistQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { PageBody, PageHeader } from "../../StaffShell";
import {
  WishlistOptOutBadge,
  formatOptOutDate,
} from "../../components/WishlistOptOutBadge";

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export default function WishlistDetail() {
  const params = useParams<{ id: string }>();
  const customerId = Number(params.id);
  const [comingSoonOpen, setComingSoonOpen] = useState(false);

  const q = useAdminGetWishlist(customerId, {
    query: {
      queryKey: getAdminGetWishlistQueryKey(customerId),
      enabled: Number.isFinite(customerId),
    },
  });

  if (q.isLoading) {
    return (
      <PageBody>
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      </PageBody>
    );
  }

  if (q.error || !q.data) {
    return (
      <PageBody>
        <div className="text-sm text-red-600">Wishlist not found.</div>
      </PageBody>
    );
  }

  const data = q.data;
  const optOutNote = data.marketingOptOut
    ? formatOptOutDate(data.marketingOptOutAt)
    : null;

  return (
    <>
      <PageHeader
        title={data.wishlistNumber}
        subtitle={`${data.customerName} · Saved ${fmtDate(data.createdAt)}`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant={data.marketingOptOut ? "outline" : "default"}
              disabled={data.marketingOptOut}
              onClick={() => setComingSoonOpen(true)}
              title={
                data.marketingOptOut ? "Opted out -- cannot send" : undefined
              }
            >
              <Mail className="size-4 mr-1.5" />
              {data.marketingOptOut
                ? "Opted out -- cannot send"
                : "Send Reach-Out Email"}
            </Button>
            <Button asChild variant="outline">
              <a
                href={`/api/admin/wishlists/${customerId}/pdf`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Printer className="size-4 mr-1.5" />
                Print Wishlist
              </a>
            </Button>
          </div>
        }
      />
      <PageBody>
        <Link
          href="/admin/wishlists"
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline mb-3"
        >
          <ArrowLeft className="size-3.5" />
          Back to Wishlists
        </Link>

        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 mb-4">
          <div className="font-medium text-amber-900">
            WISHLIST -- This is not an order. No payment or delivery has been
            arranged.
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          <div className="lg:col-span-2 rounded-md border bg-white p-4 space-y-1">
            <div className="text-sm font-semibold text-slate-700 mb-2">
              Customer
            </div>
            <div className="text-sm">{data.customerName}</div>
            <div className="text-sm text-slate-600">{data.customerEmail}</div>
            {data.customerPhone && (
              <div className="text-sm text-slate-600">
                {data.customerPhone}
              </div>
            )}
          </div>
          <div className="rounded-md border bg-white p-4">
            <div className="text-sm font-semibold text-slate-700 mb-2">
              Marketing contact
            </div>
            <WishlistOptOutBadge optedOut={data.marketingOptOut} />
            {optOutNote && (
              <div className="text-xs text-slate-500 mt-1">{optOutNote}</div>
            )}
            {data.marketingOptOut && (
              <div className="text-xs text-slate-500 mt-2">
                This customer has opted out of marketing contact. The
                reach-out email button is disabled.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-md border bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Description</th>
                <th className="px-3 py-2 font-medium">SKU</th>
                <th className="px-3 py-2 font-medium text-right">Qty</th>
                <th className="px-3 py-2 font-medium text-right">
                  Unit price
                </th>
                <th className="px-3 py-2 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((it) => (
                <tr key={it.id} className="border-t">
                  <td className="px-3 py-2">
                    <div>{it.description}</div>
                    {it.variantLabel && (
                      <div className="text-xs text-slate-500">
                        {it.variantLabel}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-slate-600">
                    {it.sku ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{it.quantity}</td>
                  <td className="px-3 py-2 text-right">
                    {fmtMoney(it.unitPrice)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {fmtMoney(it.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end mt-3">
          <div className="w-full max-w-xs rounded-md border bg-white p-3 space-y-1">
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>Subtotal</span>
              <span>{fmtMoney(data.subtotal)}</span>
            </div>
            {data.hasUnpricedItems && (
              <div className="text-xs text-slate-500">
                Subtotal does not include items with no listed price.
              </div>
            )}
          </div>
        </div>
      </PageBody>

      <Dialog open={comingSoonOpen} onOpenChange={setComingSoonOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Coming in Step 6</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Sending the reach-out email is not wired up yet -- this will be
            completed in Step 6.
          </p>
          <DialogFooter>
            <Button onClick={() => setComingSoonOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
