import { useParams, Link } from "wouter";
import { ArrowLeft, Printer } from "lucide-react";
import {
  useAdminGetWishlist,
  getAdminGetWishlistQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import logoImg from "@/assets/logo.png";

/**
 * Staff-only printable "Wishlist Copy" (Brief 7, Step 5).
 *
 * Renders as a regular authenticated in-app page (reuses the existing staff
 * session via the normal React Query fetch, same tab/browsing context) and
 * triggers the browser's native print dialog via `window.print()`. This
 * avoids opening the raw `/pdf` endpoint in a new tab, whose top-level
 * browsing context does not carry the session cookie (see
 * `.agents/memory/staff-customer-session-collision.md` for related cookie
 * context). Mirrors the layout of `wishlistPdf.tsx`.
 */

function fmtMoney(n: number | null): string {
  if (n === null) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function WishlistPrint() {
  const params = useParams<{ id: string }>();
  const customerId = Number(params.id);

  const q = useAdminGetWishlist(customerId, {
    query: {
      queryKey: getAdminGetWishlistQueryKey(customerId),
      enabled: Number.isFinite(customerId),
    },
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner />
      </div>
    );
  }

  if (q.error || !q.data) {
    return (
      <div className="p-6 text-sm text-red-600">Wishlist not found.</div>
    );
  }

  const data = q.data;

  return (
    <div className="bg-white">
      {/* Screen-only toolbar; hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-white px-6 py-3">
        <Link
          href={`/admin/wishlists/${customerId}`}
          className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"
        >
          <ArrowLeft className="size-3.5" />
          Back to Wishlist
        </Link>
        <Button onClick={() => window.print()}>
          <Printer className="size-4 mr-1.5" />
          Print
        </Button>
      </div>

      {/* Printable content */}
      <div className="mx-auto max-w-3xl px-8 py-8 print:max-w-none print:p-0">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col items-center">
            <img src={logoImg} alt="Oasis Garden & Patio" className="h-16 object-contain" />
            <div className="mt-1 text-center text-[10px] leading-tight text-slate-700">
              <div>21182 Centre Pointe Pkwy #100</div>
              <div>Santa Clarita, CA 91350</div>
              <div>(661) 255-9909</div>
            </div>
          </div>
          <div className="flex flex-col items-end">
            <div className="text-2xl font-bold tracking-tight">WISHLIST</div>
            <div className="mt-1.5 min-w-[160px] border border-slate-900 px-3 py-1 text-center text-sm font-bold">
              {data.wishlistNumber}
            </div>
          </div>
        </div>

        <div className="mt-3 border border-amber-700 bg-amber-100 px-3 py-1.5 text-center text-sm font-bold text-amber-900">
          WISHLIST -- Not an order. No payment or delivery arranged.
        </div>

        <div className="mt-4 border border-slate-900 text-sm">
          <div className="flex border-b border-slate-900">
            <div className="w-1/2 border-r border-slate-900 px-2 py-1.5">
              <span className="mr-1.5 text-[9px] font-bold uppercase text-slate-500">
                Date
              </span>
              {fmtDate(data.createdAt)}
            </div>
            <div className="w-1/2 px-2 py-1.5">
              <span className="mr-1.5 text-[9px] font-bold uppercase text-slate-500">
                Salesperson
              </span>
              —
            </div>
          </div>
          <div className="px-2 py-1.5">
            <span className="mr-1.5 text-[9px] font-bold uppercase text-slate-500">
              Name
            </span>
            {data.customerName}
          </div>
        </div>

        <table className="mt-4 w-full border border-slate-900 text-sm">
          <thead>
            <tr className="bg-slate-900 text-left text-[10px] uppercase tracking-wide text-white">
              <th className="px-2 py-1.5 font-bold">Description</th>
              <th className="px-2 py-1.5 font-bold">SKU</th>
              <th className="px-2 py-1.5 text-center font-bold">Qty</th>
              <th className="px-2 py-1.5 text-right font-bold">Price</th>
              <th className="px-2 py-1.5 text-right font-bold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((it) => (
              <tr key={it.id} className="border-b border-slate-400">
                <td className="px-2 py-1.5 align-top">
                  <div>{it.description}</div>
                  {it.variantLabel && (
                    <div className="text-xs text-slate-500">
                      {it.variantLabel}
                    </div>
                  )}
                </td>
                <td className="px-2 py-1.5 align-top text-slate-600">
                  {it.sku ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-center align-top">
                  {it.quantity}
                </td>
                <td className="px-2 py-1.5 text-right align-top">
                  {fmtMoney(it.unitPrice)}
                </td>
                <td className="px-2 py-1.5 text-right align-top">
                  {fmtMoney(it.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-3 ml-auto w-[45%] border border-slate-900">
          <div className="flex justify-between bg-slate-50 px-2 py-1.5 text-sm font-bold uppercase">
            <span>Subtotal</span>
            <span>{fmtMoney(data.subtotal)}</span>
          </div>
        </div>
        {data.hasUnpricedItems && (
          <div className="mt-1 text-right text-[10px] text-slate-500">
            Subtotal does not include items with no listed price.
          </div>
        )}

        <div className="mt-10 text-center text-sm font-bold uppercase tracking-[0.3em]">
          Wishlist Copy
        </div>
      </div>
    </div>
  );
}
