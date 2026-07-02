import { useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Search, PackageSearch, Plus } from "lucide-react";
import {
  useAdminListVendorOrders,
  type AdminVendorOrderSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageBody, PageHeader } from "../../StaffShell";

const PAGE_SIZE = 50;

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  sent: "default",
  acknowledged: "default",
  fulfilled: "default",
  partially_received: "secondary",
  received: "outline",
  canceled: "destructive",
};

const STATUS_EXTRA_CLASS: Record<string, string> = {
  partially_received: "bg-amber-100 text-amber-800 border-amber-300",
};

function fmtDate(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleDateString();
}

export default function VendorOrders() {
  const [bucket, setBucket] = useState<"needs_action" | "sent">("needs_action");
  const [q, setQ] = useState("");
  const [committedQ, setCommittedQ] = useState("");
  const [page, setPage] = useState(0);

  const params = useMemo(
    () => ({
      bucket,
      ...(committedQ ? { q: committedQ } : {}),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [bucket, committedQ, page],
  );

  const list = useAdminListVendorOrders(params);
  const rows: AdminVendorOrderSummary[] = list.data?.rows ?? [];
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
        title="Vendor Orders"
        subtitle="Generate and track purchase orders sent to vendors."
        action={
          <Button asChild>
            <Link href="/admin/vendor-orders/new">
              <Plus className="size-4 mr-1" />
              New vendor order
            </Link>
          </Button>
        }
      />
      <PageBody>
        <Tabs
          value={bucket}
          onValueChange={(v) => {
            setBucket(v as "needs_action" | "sent");
            setPage(0);
          }}
          className="mb-4"
        >
          <TabsList>
            <TabsTrigger value="needs_action">Needs Action</TabsTrigger>
            <TabsTrigger value="sent">Sent to Vendor</TabsTrigger>
          </TabsList>
        </Tabs>

        <form
          onSubmit={applyFilter}
          className="flex flex-wrap items-center gap-2 mb-4"
        >
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by vendor order # or customer order #…"
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
          <div className="text-sm text-red-600">
            Failed to load vendor orders.
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-500">
            <PackageSearch className="size-10 opacity-40" />
            <div>
              {bucket === "needs_action"
                ? "No vendor orders waiting to be sent."
                : "No vendor orders have been sent yet."}
            </div>
            <div className="text-xs">
              Open a customer order and click{" "}
              <span className="font-medium">Generate vendor orders</span>, or{" "}
              <Link
                href="/admin/vendor-orders/new"
                className="text-blue-700 hover:underline"
              >
                create one directly
              </Link>
              .
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-md border bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">VO #</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Vendor</th>
                    <th className="px-3 py-2 font-medium">Customer order</th>
                    <th className="px-3 py-2 font-medium">Items</th>
                    <th className="px-3 py-2 font-medium">Vendor ETA</th>
                    <th className="px-3 py-2 font-medium">Sent</th>
                    <th className="px-3 py-2 font-medium">Created</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/vendor-orders/${r.id}`}
                          className="text-blue-700 hover:underline font-medium"
                        >
                          {r.vendorOrderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge
                          variant={STATUS_VARIANT[r.status] ?? "secondary"}
                          className={STATUS_EXTRA_CLASS[r.status] ?? ""}
                        >
                          {r.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-3 py-2">
                        {r.manufacturerName ?? "—"}
                      </td>
                      <td className="px-3 py-2">
                        {r.customerOrderNumber ? (
                          <Link
                            href={`/admin/orders/${r.customerOrderId}`}
                            className="text-blue-700 hover:underline"
                          >
                            {r.customerOrderNumber}
                          </Link>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-3 py-2">{r.itemCount}</td>
                      <td className="px-3 py-2">
                        {fmtDate(r.vendorEstimatedDeliveryDate)}
                      </td>
                      <td className="px-3 py-2">{fmtDate(r.sentAt)}</td>
                      <td className="px-3 py-2">{fmtDate(r.createdAt)}</td>
                    </tr>
                  ))}
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
