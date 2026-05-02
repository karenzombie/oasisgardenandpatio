import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight } from "lucide-react";
import {
  useAdminGetOrder,
  useAdminUpdateOrderStatus,
  useAdminUpdateOrderNotes,
  getAdminGetOrderQueryKey,
  getAdminListOrdersQueryKey,
  type AdminOrderDetail,
  type AdminOrderAddress,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";

const ORDER_STATUSES = [
  "pending", "confirmed", "in_production", "ready_for_delivery",
  "out_for_delivery", "delivered", "completed",
] as const;

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
function fmtDateTime(s: string): string { return new Date(s).toLocaleString(); }

function AddressBlock({ label, address }: { label: string; address: AdminOrderAddress | null }) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 uppercase mb-1">{label}</div>
      {address ? (
        <div className="text-sm">
          <div>{address.recipientName}</div>
          <div>{address.street1}</div>
          {address.street2 && <div>{address.street2}</div>}
          <div>{address.city}, {address.state} {address.zip}</div>
          {address.phone && <div className="text-slate-500">{address.phone}</div>}
        </div>
      ) : (
        <div className="text-sm text-slate-400">Not provided</div>
      )}
    </div>
  );
}

export default function AgentOrderDetail() {
  const params = useParams<{ id?: string }>();
  const orderId = params.id ? Number(params.id) : NaN;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const detail = useAdminGetOrder(orderId, {
    query: { queryKey: getAdminGetOrderQueryKey(orderId), enabled: Number.isFinite(orderId) },
  });
  const order: AdminOrderDetail | undefined = detail.data;

  const [pendingStatus, setPendingStatus] = useState<string>("");
  const [statusNote, setStatusNote] = useState("");
  const [notesDraft, setNotesDraft] = useState("");

  useEffect(() => {
    if (order) {
      setNotesDraft(order.notes ?? "");
      setPendingStatus(order.status);
    }
  }, [order]);

  const updateStatus = useAdminUpdateOrderStatus();
  const updateNotes = useAdminUpdateOrderNotes();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getAdminGetOrderQueryKey(orderId) });
    queryClient.invalidateQueries({ queryKey: getAdminListOrdersQueryKey() });
  }

  function handleStatusUpdate() {
    if (!order || pendingStatus === order.status) return;
    updateStatus.mutate(
      { id: orderId, data: { toStatus: pendingStatus, note: statusNote || null } },
      {
        onSuccess: () => { toast({ title: "Status updated" }); setStatusNote(""); invalidate(); },
        onError: (e: unknown) => toast({
          title: "Update failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        }),
      },
    );
  }

  function handleNotesSave() {
    updateNotes.mutate(
      { id: orderId, data: { notes: notesDraft || null } },
      {
        onSuccess: () => { toast({ title: "Notes saved" }); invalidate(); },
        onError: (e: unknown) => toast({
          title: "Save failed",
          description: e instanceof Error ? e.message : "Unknown error",
          variant: "destructive",
        }),
      },
    );
  }

  if (!Number.isFinite(orderId)) {
    return (<><PageHeader title="Order" /><PageBody>Invalid order id.</PageBody></>);
  }
  if (detail.isLoading) {
    return (<><PageHeader title="Order" /><PageBody><div className="flex justify-center py-16"><Spinner /></div></PageBody></>);
  }
  if (!order) {
    return (
      <>
        <PageHeader title="Order not found" />
        <PageBody>
          <Link href="/agent/orders" className="text-blue-700 hover:underline inline-flex items-center gap-1">
            <ArrowLeft className="size-4" /> Back to orders
          </Link>
        </PageBody>
      </>
    );
  }

  return (
    <>
      <PageHeader title={`Order ${order.orderNumber}`} />
      <PageBody>
        <Link href="/agent/orders" className="text-sm text-slate-600 hover:underline inline-flex items-center gap-1 mb-3">
          <ArrowLeft className="size-3" /> Back to orders
        </Link>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-md border bg-white p-4">
              <div className="text-xs font-medium text-slate-500 uppercase mb-2">Status</div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[200px]">
                  <Label htmlFor="status">Move to</Label>
                  <Select value={pendingStatus} onValueChange={setPendingStatus}>
                    <SelectTrigger id="status"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ORDER_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-[2] min-w-[240px]">
                  <Label htmlFor="status-note">Note (optional)</Label>
                  <Input id="status-note" value={statusNote} onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="e.g. customer confirmed via phone" />
                </div>
                <Button type="button" onClick={handleStatusUpdate}
                  disabled={pendingStatus === order.status || updateStatus.isPending}>
                  {updateStatus.isPending ? "Saving…" : "Update"}
                </Button>
              </div>
              <div className="mt-3 text-sm text-slate-600">
                Current status: <Badge variant="secondary">{order.status.replace(/_/g, " ")}</Badge>
              </div>
            </div>

            <div className="rounded-md border bg-white">
              <div className="px-4 py-3 border-b font-medium">Items</div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-3 py-2 font-medium">Description</th>
                    <th className="px-3 py-2 font-medium">SKU</th>
                    <th className="px-3 py-2 font-medium text-right">Qty</th>
                    <th className="px-3 py-2 font-medium text-right">Unit</th>
                    <th className="px-3 py-2 font-medium text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((it) => (
                    <tr key={it.id} className="border-t">
                      <td className="px-3 py-2">
                        <div>{it.description ?? it.variantNameSnapshot ?? "—"}</div>
                        {it.fabricNameSnapshot && (
                          <div className="text-xs text-slate-500">Fabric: {it.fabricNameSnapshot}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {it.variantSkuSnapshot ?? it.productSkuSnapshot ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right">{it.quantity}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(it.unitPrice)}</td>
                      <td className="px-3 py-2 text-right">{fmtMoney(it.amount)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 text-sm">
                  <tr className="border-t"><td className="px-3 py-2 text-right" colSpan={4}>Subtotal</td><td className="px-3 py-2 text-right">{fmtMoney(order.subtotal)}</td></tr>
                  <tr><td className="px-3 py-2 text-right" colSpan={4}>Tax</td><td className="px-3 py-2 text-right">{fmtMoney(order.taxAmount)}</td></tr>
                  <tr><td className="px-3 py-2 text-right" colSpan={4}>Delivery</td><td className="px-3 py-2 text-right">{fmtMoney(order.deliveryAmount)}</td></tr>
                  <tr className="font-medium"><td className="px-3 py-2 text-right" colSpan={4}>Total</td><td className="px-3 py-2 text-right">{fmtMoney(order.total)}</td></tr>
                  <tr><td className="px-3 py-2 text-right" colSpan={4}>Deposit</td><td className="px-3 py-2 text-right">{fmtMoney(order.depositAmount)}</td></tr>
                  <tr className="font-medium"><td className="px-3 py-2 text-right" colSpan={4}>Balance due</td><td className="px-3 py-2 text-right">{fmtMoney(order.balanceDue)}</td></tr>
                </tfoot>
              </table>
            </div>

            <div className="rounded-md border bg-white p-4">
              <div className="text-xs font-medium text-slate-500 uppercase mb-2">Internal notes</div>
              <Textarea rows={3} value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Add internal notes (not shown to customer)" />
              <div className="mt-2 flex justify-end">
                <Button size="sm" onClick={handleNotesSave}
                  disabled={updateNotes.isPending || notesDraft === (order.notes ?? "")}>
                  {updateNotes.isPending ? "Saving…" : "Save notes"}
                </Button>
              </div>
            </div>

            <div className="rounded-md border bg-white">
              <div className="px-4 py-3 border-b font-medium">Status history</div>
              <ul className="divide-y">
                {order.statusHistory.length === 0 && (
                  <li className="px-4 py-3 text-sm text-slate-500">No transitions recorded yet.</li>
                )}
                {order.statusHistory.map((h) => (
                  <li key={h.id} className="px-4 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">{h.fromStatus ?? "(new)"}</span>
                      <ChevronRight className="size-3 text-slate-400" />
                      <span className="font-medium">{h.toStatus}</span>
                      <span className="ml-auto text-xs text-slate-500">{fmtDateTime(h.createdAt)}</span>
                    </div>
                    {h.note && <div className="text-slate-600 mt-0.5">{h.note}</div>}
                    {h.changedByEmail && (
                      <div className="text-xs text-slate-500 mt-0.5">by {h.changedByEmail}</div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-md border bg-white p-4 space-y-3">
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase mb-1">Customer</div>
                <div className="text-sm">
                  <div>{order.customerName ?? "—"}</div>
                  <div className="text-slate-500">{order.customerEmail ?? ""}</div>
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase mb-1">Order info</div>
                <div className="text-sm space-y-0.5">
                  <div>Type: <span className="capitalize">{order.orderType.replace(/_/g, " ")}</span></div>
                  <div>Placed: {fmtDateTime(order.placedAt)}</div>
                  {order.salespersonName && <div>Salesperson: {order.salespersonName}</div>}
                  {order.shippingMethod && <div>Shipping: {order.shippingMethod}</div>}
                </div>
              </div>
              <AddressBlock label="Shipping" address={order.shippingAddress} />
              <AddressBlock label="Billing" address={order.billingAddress} />
            </div>
          </div>
        </div>
      </PageBody>
    </>
  );
}
