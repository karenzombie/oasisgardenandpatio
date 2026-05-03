import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight } from "lucide-react";
import {
  useAdminGetOrder,
  useAdminUpdateOrderStatus,
  useAdminUpdateOrderNotes,
  useAdminUpdateOrderTotals,
  useAdminReviewCancellationRequest,
  useAdminGenerateVendorOrders,
  getAdminGetOrderQueryKey,
  getAdminListOrdersQueryKey,
  getAdminListCancellationRequestsQueryKey,
  getAdminListVendorOrdersQueryKey,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";
import HistoryPanel from "../../components/HistoryPanel";
import DeliveryPanel from "./DeliveryPanel";

const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "in_production",
  "ready_for_delivery",
  "out_for_delivery",
  "delivered",
  "completed",
  "canceled",
  "refunded",
] as const;

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDateTime(s: string): string {
  return new Date(s).toLocaleString();
}

function AddressBlock({
  label,
  address,
}: {
  label: string;
  address: AdminOrderAddress | null;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-slate-500 uppercase mb-1">
        {label}
      </div>
      {address ? (
        <div className="text-sm">
          <div>{address.recipientName}</div>
          <div>{address.street1}</div>
          {address.street2 && <div>{address.street2}</div>}
          <div>
            {address.city}, {address.state} {address.zip}
          </div>
          {address.country && address.country !== "US" && (
            <div>{address.country}</div>
          )}
          {address.phone && (
            <div className="text-slate-500">{address.phone}</div>
          )}
        </div>
      ) : (
        <div className="text-sm text-slate-400">Not provided</div>
      )}
    </div>
  );
}

export default function OrderDetail() {
  const params = useParams<{ id?: string }>();
  const orderId = params.id ? Number(params.id) : NaN;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const detail = useAdminGetOrder(orderId, {
    query: {
      queryKey: getAdminGetOrderQueryKey(orderId),
      enabled: Number.isFinite(orderId),
    },
  });
  const order: AdminOrderDetail | undefined = detail.data;

  const [pendingStatus, setPendingStatus] = useState<string>("");
  const [statusNote, setStatusNote] = useState("");
  const [notesDraft, setNotesDraft] = useState("");
  const [reviewing, setReviewing] = useState<{
    id: number;
    decision: "approved" | "denied" | null;
  } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const [refundAmt, setRefundAmt] = useState("");
  const [shippingDraft, setShippingDraft] = useState("");
  const [taxDraft, setTaxDraft] = useState("");
  const [totalsNote, setTotalsNote] = useState("");

  useEffect(() => {
    if (order) {
      setNotesDraft(order.notes ?? "");
      setPendingStatus(order.status);
      setShippingDraft(String(order.deliveryAmount));
      setTaxDraft(String(order.taxAmount));
      setTotalsNote("");
    }
  }, [order]);

  const updateStatus = useAdminUpdateOrderStatus();
  const updateNotes = useAdminUpdateOrderNotes();
  const updateTotals = useAdminUpdateOrderTotals();
  const reviewCancellation = useAdminReviewCancellationRequest();
  const generateVendorOrders = useAdminGenerateVendorOrders();

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: getAdminGetOrderQueryKey(orderId),
    });
    queryClient.invalidateQueries({ queryKey: getAdminListOrdersQueryKey() });
    queryClient.invalidateQueries({
      queryKey: getAdminListCancellationRequestsQueryKey(),
    });
    queryClient.invalidateQueries({
      queryKey: getAdminListVendorOrdersQueryKey(),
    });
  }

  function handleGenerateVendorOrders() {
    generateVendorOrders.mutate(
      { orderId, data: {} },
      {
        onSuccess: (res) => {
          const created = res.created.length;
          const skipped = res.skippedItemCount;
          if (created === 0 && skipped === 0) {
            toast({
              title: "Nothing to generate",
              description: "All items are already on a vendor order.",
            });
          } else {
            toast({
              title: `Generated ${created} vendor order${created === 1 ? "" : "s"}`,
              description:
                skipped > 0
                  ? `${skipped} item${skipped === 1 ? "" : "s"} skipped (no manufacturer set on the product).`
                  : undefined,
            });
          }
          invalidate();
        },
        onError: (e: unknown) => {
          toast({
            title: "Generate failed",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          });
        },
      },
    );
  }

  function handleStatusUpdate() {
    if (!order || pendingStatus === order.status) return;
    updateStatus.mutate(
      {
        id: orderId,
        data: { toStatus: pendingStatus, note: statusNote || null },
      },
      {
        onSuccess: () => {
          toast({ title: "Status updated" });
          setStatusNote("");
          invalidate();
        },
        onError: (e: unknown) => {
          toast({
            title: "Update failed",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          });
        },
      },
    );
  }

  function handleTotalsSave() {
    if (!order) return;
    const newDelivery = Number(shippingDraft);
    const newTax = Number(taxDraft);
    if (
      !Number.isFinite(newDelivery) ||
      newDelivery < 0 ||
      !Number.isFinite(newTax) ||
      newTax < 0
    ) {
      toast({
        title: "Invalid amount",
        description: "Shipping and tax must be non-negative numbers.",
        variant: "destructive",
      });
      return;
    }
    const deliveryChanged = newDelivery !== Number(order.deliveryAmount);
    const taxChanged = newTax !== Number(order.taxAmount);
    if (!deliveryChanged && !taxChanged) return;
    updateTotals.mutate(
      {
        id: orderId,
        data: {
          deliveryAmount: deliveryChanged ? newDelivery : undefined,
          taxAmount: taxChanged ? newTax : undefined,
          note: totalsNote || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Totals updated" });
          setTotalsNote("");
          invalidate();
        },
        onError: (e: unknown) => {
          toast({
            title: "Update failed",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          });
        },
      },
    );
  }

  function handleNotesSave() {
    updateNotes.mutate(
      { id: orderId, data: { notes: notesDraft || null } },
      {
        onSuccess: () => {
          toast({ title: "Notes saved" });
          invalidate();
        },
        onError: (e: unknown) => {
          toast({
            title: "Save failed",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          });
        },
      },
    );
  }

  function submitReview() {
    if (!reviewing?.decision) return;
    const refundNum = refundAmt.trim() ? Number(refundAmt) : null;
    if (refundNum !== null && (!Number.isFinite(refundNum) || refundNum < 0)) {
      toast({
        title: "Invalid refund amount",
        variant: "destructive",
      });
      return;
    }
    reviewCancellation.mutate(
      {
        id: reviewing.id,
        data: {
          decision: reviewing.decision,
          reviewNote: reviewNote || null,
          refundAmount: refundNum,
        },
      },
      {
        onSuccess: () => {
          toast({
            title:
              reviewing.decision === "approved"
                ? "Cancellation approved"
                : "Cancellation denied",
          });
          setReviewing(null);
          setReviewNote("");
          setRefundAmt("");
          invalidate();
        },
        onError: (e: unknown) => {
          toast({
            title: "Review failed",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          });
        },
      },
    );
  }

  if (!Number.isFinite(orderId)) {
    return (
      <>
        <PageHeader title="Order" />
        <PageBody>Invalid order id.</PageBody>
      </>
    );
  }

  if (detail.isLoading) {
    return (
      <>
        <PageHeader title="Order" />
        <PageBody>
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        </PageBody>
      </>
    );
  }

  if (!order) {
    return (
      <>
        <PageHeader title="Order not found" />
        <PageBody>
          <Link
            href="/admin/orders"
            className="text-blue-700 hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-4" />
            Back to orders
          </Link>
        </PageBody>
      </>
    );
  }

  const pendingCancellation = order.cancellationRequests.find(
    (c) => c.status === "pending",
  );

  return (
    <>
      <PageHeader title={`Order ${order.orderNumber}`} />
      <PageBody>
        <Link
          href="/admin/orders"
          className="text-sm text-slate-600 hover:underline inline-flex items-center gap-1 mb-3"
        >
          <ArrowLeft className="size-3" />
          Back to orders
        </Link>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Header / status / financials */}
          <div className="lg:col-span-2 space-y-4">
            {pendingCancellation && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-4">
                <div className="font-medium text-amber-900 mb-1">
                  Cancellation request pending
                </div>
                <div className="text-sm text-amber-900 mb-3">
                  Reason: {pendingCancellation.reason ?? "—"} (requested by{" "}
                  {pendingCancellation.requestedByEmail ?? "system"})
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => {
                      setReviewing({
                        id: pendingCancellation.id,
                        decision: "approved",
                      });
                      setRefundAmt(String(order.total));
                    }}
                  >
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setReviewing({
                        id: pendingCancellation.id,
                        decision: "denied",
                      })
                    }
                  >
                    Deny
                  </Button>
                </div>
              </div>
            )}

            <div className="rounded-md border bg-white p-4">
              <div className="text-xs font-medium text-slate-500 uppercase mb-2">
                Status
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[200px]">
                  <Label htmlFor="status">Move to</Label>
                  <Select
                    value={pendingStatus}
                    onValueChange={setPendingStatus}
                  >
                    <SelectTrigger id="status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s.replace(/_/g, " ")}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-[2] min-w-[240px]">
                  <Label htmlFor="status-note">Note (optional)</Label>
                  <Input
                    id="status-note"
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="e.g. customer confirmed via phone"
                  />
                </div>
                <Button
                  type="button"
                  onClick={handleStatusUpdate}
                  disabled={
                    pendingStatus === order.status || updateStatus.isPending
                  }
                >
                  {updateStatus.isPending ? "Saving…" : "Update"}
                </Button>
              </div>
              <div className="mt-3 text-sm text-slate-600">
                Current status:{" "}
                <Badge variant="secondary">
                  {order.status.replace(/_/g, " ")}
                </Badge>
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
                          <div className="text-xs text-slate-500">
                            Fabric: {it.fabricNameSnapshot}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-500">
                        {it.variantSkuSnapshot ?? it.productSkuSnapshot ?? "—"}
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
                <tfoot className="bg-slate-50 text-sm">
                  <tr className="border-t">
                    <td className="px-3 py-2 text-right" colSpan={4}>
                      Subtotal
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtMoney(order.subtotal)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-right" colSpan={4}>
                      Tax
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtMoney(order.taxAmount)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-right" colSpan={4}>
                      Delivery
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtMoney(order.deliveryAmount)}
                    </td>
                  </tr>
                  <tr className="font-medium">
                    <td className="px-3 py-2 text-right" colSpan={4}>
                      Total
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtMoney(order.total)}
                    </td>
                  </tr>
                  <tr>
                    <td className="px-3 py-2 text-right" colSpan={4}>
                      Deposit
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtMoney(order.depositAmount)}
                    </td>
                  </tr>
                  <tr className="font-medium">
                    <td className="px-3 py-2 text-right" colSpan={4}>
                      Balance due
                    </td>
                    <td className="px-3 py-2 text-right">
                      {fmtMoney(order.balanceDue)}
                    </td>
                  </tr>
                </tfoot>
              </table>
              <div className="border-t px-4 py-3">
                <div className="text-xs font-medium text-slate-500 uppercase mb-2">
                  Override shipping &amp; tax
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="w-32">
                    <Label htmlFor="override-shipping">Shipping ($)</Label>
                    <Input
                      id="override-shipping"
                      inputMode="decimal"
                      value={shippingDraft}
                      onChange={(e) => setShippingDraft(e.target.value)}
                    />
                  </div>
                  <div className="w-32">
                    <Label htmlFor="override-tax">Tax ($)</Label>
                    <Input
                      id="override-tax"
                      inputMode="decimal"
                      value={taxDraft}
                      onChange={(e) => setTaxDraft(e.target.value)}
                    />
                  </div>
                  <div className="flex-1 min-w-[200px]">
                    <Label htmlFor="override-note">Note (optional)</Label>
                    <Input
                      id="override-note"
                      value={totalsNote}
                      onChange={(e) => setTotalsNote(e.target.value)}
                      placeholder="e.g. waived shipping per manager"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleTotalsSave}
                    disabled={
                      updateTotals.isPending ||
                      (Number(shippingDraft) === Number(order.deliveryAmount) &&
                        Number(taxDraft) === Number(order.taxAmount))
                    }
                  >
                    {updateTotals.isPending ? "Saving…" : "Save totals"}
                  </Button>
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Total and balance due will recalculate from subtotal + these
                  values; deposit is preserved.
                </p>
              </div>
            </div>

            <div className="rounded-md border bg-white p-4">
              <div className="text-xs font-medium text-slate-500 uppercase mb-2">
                Internal notes
              </div>
              <Textarea
                rows={3}
                value={notesDraft}
                onChange={(e) => setNotesDraft(e.target.value)}
                placeholder="Add internal notes (not shown to customer)"
              />
              <div className="mt-2 flex justify-end">
                <Button
                  size="sm"
                  onClick={handleNotesSave}
                  disabled={
                    updateNotes.isPending || notesDraft === (order.notes ?? "")
                  }
                >
                  {updateNotes.isPending ? "Saving…" : "Save notes"}
                </Button>
              </div>
            </div>

            <div className="rounded-md border bg-white">
              <div className="px-4 py-3 border-b font-medium">
                Status history
              </div>
              <ul className="divide-y">
                {order.statusHistory.length === 0 && (
                  <li className="px-4 py-3 text-sm text-slate-500">
                    No transitions recorded yet.
                  </li>
                )}
                {order.statusHistory.map((h) => (
                  <li key={h.id} className="px-4 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">
                        {h.fromStatus ?? "(new)"}
                      </span>
                      <ChevronRight className="size-3 text-slate-400" />
                      <span className="font-medium">{h.toStatus}</span>
                      <span className="ml-auto text-xs text-slate-500">
                        {fmtDateTime(h.createdAt)}
                      </span>
                    </div>
                    {h.note && (
                      <div className="text-slate-600 mt-0.5">{h.note}</div>
                    )}
                    {h.changedByEmail && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        by {h.changedByEmail}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {order.cancellationRequests.length > 0 && (
              <div className="rounded-md border bg-white">
                <div className="px-4 py-3 border-b font-medium">
                  Cancellation requests
                </div>
                <ul className="divide-y">
                  {order.cancellationRequests.map((c) => (
                    <li key={c.id} className="px-4 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            c.status === "approved"
                              ? "default"
                              : c.status === "denied"
                                ? "outline"
                                : "secondary"
                          }
                        >
                          {c.status}
                        </Badge>
                        <span className="text-slate-500">
                          requested by {c.requestedByEmail ?? "system"}
                        </span>
                        <span className="ml-auto text-xs text-slate-500">
                          {fmtDateTime(c.createdAt)}
                        </span>
                      </div>
                      {c.reason && (
                        <div className="text-slate-600 mt-0.5">
                          Reason: {c.reason}
                        </div>
                      )}
                      {c.reviewNote && (
                        <div className="text-slate-600 mt-0.5">
                          Review: {c.reviewNote}
                        </div>
                      )}
                      {c.refundAmount !== null && (
                        <div className="text-slate-600 mt-0.5">
                          Refund: {fmtMoney(c.refundAmount)}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="rounded-md border bg-white p-4 space-y-3">
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase mb-1 flex items-center gap-2">
                  Customer
                  {order.isQuickOrder && (
                    <span className="rounded bg-amber-100 text-amber-800 px-1.5 py-0.5 text-[10px] font-semibold normal-case">
                      Quick order
                    </span>
                  )}
                </div>
                <div className="text-sm">
                  {order.customerName ? (
                    <>
                      <div>{order.customerName}</div>
                      <div className="text-slate-500">
                        {order.customerEmail ?? ""}
                      </div>
                    </>
                  ) : order.isQuickOrder ? (
                    <>
                      <div>{order.walkInName ?? "Walk-in customer"}</div>
                      {order.walkInEmail && (
                        <div className="text-slate-500">{order.walkInEmail}</div>
                      )}
                      {order.walkInPhone && (
                        <div className="text-slate-500">{order.walkInPhone}</div>
                      )}
                    </>
                  ) : (
                    <div>—</div>
                  )}
                </div>
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase mb-1">
                  Order info
                </div>
                <div className="text-sm space-y-0.5">
                  <div>
                    Type:{" "}
                    <span className="capitalize">
                      {order.orderType.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div>Placed: {fmtDateTime(order.placedAt)}</div>
                  {order.salespersonName && (
                    <div>Salesperson: {order.salespersonName}</div>
                  )}
                </div>
              </div>
              <AddressBlock label="Shipping" address={order.shippingAddress} />
              <AddressBlock label="Billing" address={order.billingAddress} />
            </div>

            <DeliveryPanel
              orderId={orderId}
              shippingMethod={order.shippingMethod}
              shipments={order.shipments}
            />

            <div className="rounded-md border bg-white p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-slate-500 uppercase">
                  Vendor orders
                </div>
                {!order.skipVendorOrder && (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={handleGenerateVendorOrders}
                    disabled={generateVendorOrders.isPending}
                  >
                    Generate vendor orders
                  </Button>
                )}
              </div>
              {order.skipVendorOrder ? (
                <div className="text-sm text-slate-500">
                  This order is flagged as an in-stock sale —
                  vendor restock orders are skipped.
                </div>
              ) : order.vendorOrders.length === 0 ? (
                <div className="text-sm text-slate-500">
                  No vendor orders yet. Click{" "}
                  <span className="font-medium">Generate vendor orders</span> to
                  group unassigned items by manufacturer.
                </div>
              ) : (
                <ul className="space-y-2 text-sm">
                  {order.vendorOrders.map((vo) => (
                    <li
                      key={vo.id}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <Link
                          href={`/admin/vendor-orders/${vo.id}`}
                          className="font-medium text-blue-700 hover:underline"
                        >
                          {vo.vendorOrderNumber}
                        </Link>
                        <div className="text-slate-500">
                          {vo.manufacturerName ?? "—"}
                        </div>
                      </div>
                      <Badge variant="secondary">{vo.status}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <Dialog
          open={reviewing !== null}
          onOpenChange={(open) => {
            if (!open) {
              setReviewing(null);
              setReviewNote("");
              setRefundAmt("");
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {reviewing?.decision === "approved"
                  ? "Approve cancellation"
                  : "Deny cancellation"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {reviewing?.decision === "approved" && (
                <div>
                  <Label htmlFor="refund">Refund amount (USD)</Label>
                  <Input
                    id="refund"
                    inputMode="decimal"
                    value={refundAmt}
                    onChange={(e) => setRefundAmt(e.target.value)}
                  />
                </div>
              )}
              <div>
                <Label htmlFor="rev-note">Note (optional)</Label>
                <Textarea
                  id="rev-note"
                  rows={3}
                  value={reviewNote}
                  onChange={(e) => setReviewNote(e.target.value)}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setReviewing(null)}
                disabled={reviewCancellation.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={submitReview}
                disabled={reviewCancellation.isPending}
              >
                {reviewCancellation.isPending
                  ? "Submitting…"
                  : reviewing?.decision === "approved"
                    ? "Approve"
                    : "Deny"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {Number.isFinite(orderId) ? (
          <div className="mt-6">
            <HistoryPanel entityType="order" entityId={orderId} />
          </div>
        ) : null}
      </PageBody>
    </>
  );
}
