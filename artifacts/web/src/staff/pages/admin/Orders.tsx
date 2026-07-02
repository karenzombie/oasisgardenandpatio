import { useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Plus, Search, ShoppingCart } from "lucide-react";
import {
  useAdminListOrders,
  type AdminOrderSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PageBody, PageHeader } from "../../StaffShell";

const PAGE_SIZE = 50;

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "in_production",
  "ready_for_store_delivery",
  "carrier_delivery_update",
  "out_for_local_delivery",
  "delivered",
  "completed",
  "canceled",
  "refunded",
] as const;

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "secondary",
  confirmed: "default",
  in_production: "default",
  ready_for_store_delivery: "default",
  carrier_delivery_update: "default",
  out_for_local_delivery: "default",
  delivered: "default",
  completed: "outline",
  canceled: "destructive",
  refunded: "destructive",
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDate(s: string): string {
  return new Date(s).toLocaleDateString();
}

export default function Orders() {
  const [q, setQ] = useState("");
  const [committedQ, setCommittedQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [page, setPage] = useState(0);

  const params = useMemo(
    () => ({
      ...(committedQ ? { q: committedQ } : {}),
      ...(status !== "all" ? { status } : {}),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [committedQ, status, page],
  );

  const list = useAdminListOrders(params);
  const rows: AdminOrderSummary[] = list.data?.rows ?? [];
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
        title="Orders"
        subtitle="All customer orders."
        action={
          <Button asChild size="sm">
            <Link href="/admin/new-order">
              <Plus className="size-4 mr-1" /> New order
            </Link>
          </Button>
        }
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
              placeholder="Search by order #, customer name, or email…"
              className="pl-8"
            />
          </div>
          <Select
            value={status}
            onValueChange={(v) => {
              setPage(0);
              setStatus(v);
            }}
          >
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>

        {list.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Spinner />
          </div>
        ) : list.error ? (
          <div className="text-sm text-red-600">Failed to load orders.</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-slate-500">
            <ShoppingCart className="size-10 opacity-40" />
            <div>No orders match your filters.</div>
          </div>
        ) : (
          <>
            <div className="rounded-md border bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Order #</th>
                    <th className="px-3 py-2 font-medium">Status</th>
                    <th className="px-3 py-2 font-medium">Type</th>
                    <th className="px-3 py-2 font-medium">Customer</th>
                    <th className="px-3 py-2 font-medium">Items</th>
                    <th className="px-3 py-2 font-medium text-right">Total</th>
                    <th className="px-3 py-2 font-medium text-right">Balance</th>
                    <th className="px-3 py-2 font-medium">Placed</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t hover:bg-slate-50">
                      <td className="px-3 py-2">
                        <Link
                          href={`/admin/orders/${r.id}`}
                          className="text-blue-700 hover:underline"
                        >
                          {r.orderNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>
                          {r.status.replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 capitalize">
                        {r.orderType.replace(/_/g, " ")}
                      </td>
                      <td className="px-3 py-2">
                        <div>{r.customerName ?? "—"}</div>
                        <div className="text-xs text-slate-500">
                          {r.customerEmail ?? ""}
                        </div>
                      </td>
                      <td className="px-3 py-2">{r.itemCount}</td>
                      <td className="px-3 py-2 text-right font-medium">
                        {fmtMoney(r.total)}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {fmtMoney(r.balanceDue)}
                      </td>
                      <td className="px-3 py-2">{fmtDate(r.placedAt)}</td>
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
