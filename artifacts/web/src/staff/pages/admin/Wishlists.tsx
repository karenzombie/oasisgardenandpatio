import { useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Heart, Search } from "lucide-react";
import {
  useAdminListWishlists,
  type AdminWishlistSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { PageBody, PageHeader } from "../../StaffShell";
import {
  WishlistOptOutBadge,
  formatOptOutDate,
} from "../../components/WishlistOptOutBadge";

const PAGE_SIZE = 50;

function fmtPacific(iso: string): string {
  return (
    new Date(iso).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " PT"
  );
}

export default function Wishlists() {
  const [q, setQ] = useState("");
  const [committedQ, setCommittedQ] = useState("");
  const [page, setPage] = useState(0);

  const params = useMemo(
    () => ({
      ...(committedQ ? { q: committedQ } : {}),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [committedQ, page],
  );

  const list = useAdminListWishlists(params);
  const rows: AdminWishlistSummary[] = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function applyFilter(e: FormEvent) {
    e.preventDefault();
    setPage(0);
    setCommittedQ(q.trim());
  }

  return (
    <>
      <PageHeader
        title="Customer Wishlists"
        subtitle="Wishlists saved by signed-in customers."
      />
      <PageBody>
        <form
          onSubmit={applyFilter}
          className="flex flex-wrap items-center gap-2 mb-4"
        >
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by wishlist #, customer name, or email…"
              className="pl-8"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        {list.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : list.error ? (
          <div className="text-sm text-red-600">Failed to load wishlists.</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-500">
            <Heart className="size-10 opacity-40" />
            <div>No wishlists match your filters.</div>
          </div>
        ) : (
          <>
            <div className="rounded-md border bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Wishlist #</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">Email</th>
                    <th className="px-3 py-2 font-medium text-right">
                      Items saved
                    </th>
                    <th className="px-3 py-2 font-medium">Most recent save</th>
                    <th className="px-3 py-2 font-medium">Marketing contact</th>
                    <th className="px-3 py-2 font-medium text-right">
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const optOutNote = r.marketingOptOut
                      ? formatOptOutDate(r.marketingOptOutAt)
                      : null;
                    return (
                      <tr key={r.customerId} className="border-t hover:bg-slate-50">
                        <td className="px-3 py-2">
                          <Link
                            href={`/admin/wishlists/${r.customerId}`}
                            className="text-blue-700 hover:underline font-medium"
                          >
                            {r.wishlistNumber}
                          </Link>
                        </td>
                        <td className="px-3 py-2">
                          <Link
                            href={`/admin/wishlists/${r.customerId}`}
                            className="text-blue-700 hover:underline"
                          >
                            {r.customerName}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {r.customerEmail}
                        </td>
                        <td className="px-3 py-2 text-right">{r.itemCount}</td>
                        <td className="px-3 py-2">
                          {fmtPacific(r.mostRecentSaveAt)}
                        </td>
                        <td className="px-3 py-2">
                          <WishlistOptOutBadge optedOut={r.marketingOptOut} />
                          {optOutNote && (
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {optOutNote}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/admin/wishlists/${r.customerId}`}>
                              View Wishlist
                            </Link>
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-3 text-sm">
                <div className="text-slate-500">
                  Page {page + 1} of {totalPages} · {total} total
                </div>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page === 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={page + 1 >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </PageBody>
    </>
  );
}
