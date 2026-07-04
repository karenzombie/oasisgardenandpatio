import { useMemo, useState } from "react";
import { Link } from "wouter";
import { Truck } from "lucide-react";
import {
  useAdminListLocalDeliveries,
  useAdminListDirectShipDeliveries,
  useAdminListCompletedDeliveries,
  type AdminLocalDeliverySummary,
  type AdminDirectShipSummary,
  type AdminCompletedDeliverySummary,
} from "@workspace/api-client-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { deliveryTimeWindowLabel } from "../../lib/deliveryTimeWindows";
import { PageBody, PageHeader } from "../../StaffShell";

const TAB_STORAGE_KEY = "admin-deliveries-tab";
const PAGE_SIZE = 50;

type DeliveriesTab = "local" | "direct-ship" | "completed";

function initialTab(): DeliveriesTab {
  if (typeof window === "undefined") return "local";
  const stored = window.sessionStorage.getItem(TAB_STORAGE_KEY);
  if (stored === "local" || stored === "direct-ship" || stored === "completed") {
    return stored;
  }
  return "local";
}

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  ready_for_store_delivery: "default",
  out_for_local_delivery: "default",
  carrier_delivery_update: "default",
  delivered: "default",
};

const STATUS_LABEL: Record<string, string> = {
  ready_for_store_delivery: "Ready for Delivery",
  out_for_local_delivery: "Out for Delivery",
  carrier_delivery_update: "In Transit",
  delivered: "Delivered",
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

function fmtScheduledDate(s: string | null | undefined): string {
  if (!s) return "Not scheduled";
  const [year, month, day] = s.split("-").map(Number);
  const d = new Date(year, (month ?? 1) - 1, day ?? 1);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function LocalDeliveriesTab() {
  const [filter, setFilter] = useState<"all" | "unscheduled">("all");
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const params = useMemo(
    () => ({
      ...(filter !== "all" ? { filter } : {}),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [filter, page],
  );

  const list = useAdminListLocalDeliveries(params);
  const rows: AdminLocalDeliverySummary[] = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function toggleRow(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select
          value={filter}
          onValueChange={(v) => {
            setPage(0);
            setSelected(new Set());
            setFilter(v as "all" | "unscheduled");
          }}
        >
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unscheduled">Unscheduled</SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          disabled={selected.size === 0}
          title="Generate Delivery Manifest"
          onClick={() => {
            const orderIds = Array.from(selected).join(",");
            // Browsers only allow one window.open() new-tab per user gesture;
            // a second call is silently blocked as a popup. So the summary
            // opens for on-screen viewing, and the merged copies file is
            // triggered as a direct download instead of a second tab -- a
            // same-origin <a download> click isn't subject to the popup
            // limit, so both PDFs reliably reach the user from one click.
            window.open(
              `/api/admin/deliveries/manifest-summary?orderIds=${orderIds}`,
              "_blank",
              "noopener,noreferrer",
            );
            const link = document.createElement("a");
            link.href = `/api/admin/deliveries/manifest-copies?orderIds=${orderIds}`;
            link.download = "delivery-copies-merged.pdf";
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }}
        >
          Generate Delivery Manifest
        </Button>
      </div>

      {list.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : list.error ? (
        <div className="text-sm text-red-600">Failed to load deliveries.</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-slate-500">
          <Truck className="size-10 opacity-40" />
          <div>No local deliveries in progress.</div>
        </div>
      ) : (
        <>
          <div className="rounded-md border bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium w-8"></th>
                  <th className="px-3 py-2 font-medium">Scheduled Date/Time</th>
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
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggleRow(r.id)}
                        aria-label={`Select order ${r.orderNumber}`}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div>{fmtScheduledDate(r.scheduledDeliveryDate)}</div>
                      <div className="text-xs text-slate-500">
                        {deliveryTimeWindowLabel(r.scheduledDeliveryTime)}
                      </div>
                    </td>
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
                        {STATUS_LABEL[r.status] ?? r.status.replace(/_/g, " ")}
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
    </>
  );
}

function DirectShipTab() {
  const [page, setPage] = useState(0);

  const params = useMemo(
    () => ({
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [page],
  );

  const list = useAdminListDirectShipDeliveries(params);
  const rows: AdminDirectShipSummary[] = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      {list.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : list.error ? (
        <div className="text-sm text-red-600">Failed to load deliveries.</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-slate-500">
          <Truck className="size-10 opacity-40" />
          <div>No direct-ship deliveries in progress.</div>
        </div>
      ) : (
        <>
          <div className="rounded-md border bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Order #</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Carrier</th>
                  <th className="px-3 py-2 font-medium">Tracking Number</th>
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
                  <tr
                    key={r.shipmentId}
                    className="border-t hover:bg-slate-50"
                  >
                    <td className="px-3 py-2">
                      <Link
                        href={`/admin/orders/${r.orderId}`}
                        className="text-blue-700 hover:underline"
                      >
                        {r.orderNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant={STATUS_VARIANT[r.status] ?? "secondary"}>
                        {STATUS_LABEL[r.status] ?? r.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">{r.carrierName ?? "Unknown"}</td>
                    <td className="px-3 py-2">{r.trackingNumber ?? "—"}</td>
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
    </>
  );
}

function CompletedTab() {
  const [filter, setFilter] = useState<"all" | "local" | "direct-ship">(
    "all",
  );
  const [page, setPage] = useState(0);

  const params = useMemo(
    () => ({
      ...(filter !== "all" ? { filter } : {}),
      limit: PAGE_SIZE,
      offset: page * PAGE_SIZE,
    }),
    [filter, page],
  );

  const list = useAdminListCompletedDeliveries(params);
  const rows: AdminCompletedDeliverySummary[] = list.data?.rows ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Select
          value={filter}
          onValueChange={(v) => {
            setPage(0);
            setFilter(v as "all" | "local" | "direct-ship");
          }}
        >
          <SelectTrigger className="w-[220px]">
            <SelectValue placeholder="Filter" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="local">Local Deliveries only</SelectItem>
            <SelectItem value="direct-ship">Direct Ship only</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {list.isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner />
        </div>
      ) : list.error ? (
        <div className="text-sm text-red-600">Failed to load deliveries.</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-slate-500">
          <Truck className="size-10 opacity-40" />
          <div>
            {filter === "all"
              ? "No completed deliveries yet."
              : "No completed deliveries match this filter."}
          </div>
        </div>
      ) : (
        <>
          <div className="rounded-md border bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Order #</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Delivery Type</th>
                  <th className="px-3 py-2 font-medium">Carrier / Tracking</th>
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
                        {STATUS_LABEL[r.status] ?? r.status.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      {r.deliveryType === "direct_ship"
                        ? "Direct Ship"
                        : "Local Delivery"}
                    </td>
                    <td className="px-3 py-2">
                      {r.deliveryType === "direct_ship" &&
                      r.shipments.length > 0 ? (
                        r.shipments.map((s, i) => (
                          <div key={i}>
                            {s.carrierName ?? "Unknown"} — {s.trackingNumber}
                          </div>
                        ))
                      ) : (
                        <span>—</span>
                      )}
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
    </>
  );
}

export default function Deliveries() {
  const [tab, setTab] = useState<DeliveriesTab>(initialTab);

  function handleTabChange(value: string) {
    const next = value as DeliveriesTab;
    setTab(next);
    window.sessionStorage.setItem(TAB_STORAGE_KEY, next);
  }

  return (
    <>
      <PageHeader title="Deliveries" />
      <PageBody>
        <Tabs value={tab} onValueChange={handleTabChange}>
          <TabsList>
            <TabsTrigger value="local">Local Deliveries</TabsTrigger>
            <TabsTrigger value="direct-ship">Direct Ship</TabsTrigger>
            <TabsTrigger value="completed">Recently Completed Deliveries</TabsTrigger>
          </TabsList>
          <TabsContent value="local" className="mt-4">
            <LocalDeliveriesTab />
          </TabsContent>
          <TabsContent value="direct-ship" className="mt-4">
            <DirectShipTab />
          </TabsContent>
          <TabsContent value="completed" className="mt-4">
            <CompletedTab />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}
