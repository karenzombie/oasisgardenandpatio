import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Printer } from "lucide-react";
import {
  useAdminGetOrder,
  useAdminUpdateOrderStatus,
  useAdminUpdateOrderNotes,
  useAdminUpdateOrderTotals,
  useAdminReviewCancellationRequest,
  useAdminGenerateVendorOrders,
  useAdminUpdateOrderItemFabricVendor,
  useAdminListManufacturers,
  useAdminRefundOrder,
  getAdminGetOrderQueryKey,
  getAdminListOrdersQueryKey,
  getAdminListCancellationRequestsQueryKey,
  getAdminListVendorOrdersQueryKey,
  type AdminOrderDetail,
  type AdminOrderAddress,
  type AdminOrderItem,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import PaymentsPanel from "./PaymentsPanel";

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

  const [printCopies, setPrintCopies] = useState<Set<"customer" | "store" | "delivery">>(
    new Set(["customer"]),
  );
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
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [grossRefundAmt, setGrossRefundAmt] = useState("");
  const [restockingFeeType, setRestockingFeeType] = useState<"none" | "flat" | "percent">("none");
  const [restockingFeeValue, setRestockingFeeValue] = useState("");
  const [refundNote, setRefundNote] = useState("");

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
  const refundOrder = useAdminRefundOrder();
  const updateFabricVendor = useAdminUpdateOrderItemFabricVendor();
  // Manufacturer list for the per-line "alternate fabric vendor"
  // dialog. The list is small and cached by react-query, so a single
  // unconditional fetch is fine.
  const [fabricVendorEditing, setFabricVendorEditing] =
    useState<AdminOrderItem | null>(null);
  const [fabricVendorDraft, setFabricVendorDraft] = useState<string>("none");
  const manufacturersQuery = useAdminListManufacturers();
  const manufacturers = manufacturersQuery.data ?? [];

  function openFabricVendorDialog(item: AdminOrderItem) {
    setFabricVendorEditing(item);
    setFabricVendorDraft(
      item.fabricVendorId != null ? String(item.fabricVendorId) : "none",
    );
  }

  async function handleFabricVendorSave() {
    if (!fabricVendorEditing || !order) return;
    try {
      await updateFabricVendor.mutateAsync({
        orderId: order.id,
        itemId: fabricVendorEditing.id,
        data: {
          fabricVendorId:
            fabricVendorDraft === "none" ? null : Number(fabricVendorDraft),
        },
      });
      toast({ title: "Fabric vendor updated" });
      setFabricVendorEditing(null);
      invalidate();
    } catch (err) {
      toast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

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
                  ? `${skipped} item${skipped === 1 ? "" : "s"} skipped (no vendor set on the product).`
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

  function performStatusUpdate() {
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
          setConfirmCancel(false);
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

  function handleStatusUpdate() {
    if (!order || pendingStatus === order.status) return;
    if (pendingStatus === "canceled") {
      setConfirmCancel(true);
      return;
    }
    if (pendingStatus === "refunded") {
      setGrossRefundAmt(String(order.total));
      setRestockingFeeType("none");
      setRestockingFeeValue("");
      setRefundNote(statusNote);
      setRefundOpen(true);
      return;
    }
    performStatusUpdate();
  }

  function handleRefundSubmit() {
    if (!order) return;
    const gross = Number(grossRefundAmt);
    if (!Number.isFinite(gross) || gross < 0) {
      toast({ title: "Invalid refund amount", variant: "destructive" });
      return;
    }
    if (restockingFeeType !== "none") {
      const feeVal = Number(restockingFeeValue);
      if (!Number.isFinite(feeVal) || feeVal < 0) {
        toast({ title: "Invalid restocking fee value", variant: "destructive" });
        return;
      }
      if (restockingFeeType === "percent" && feeVal > 100) {
        toast({
          title: "Percentage must be between 0 and 100",
          variant: "destructive",
        });
        return;
      }
    }
    refundOrder.mutate(
      {
        id: orderId,
        data: {
          grossRefundAmount: gross,
          restockingFeeType:
            restockingFeeType === "none" ? null : restockingFeeType,
          restockingFeeValue:
            restockingFeeType !== "none"
              ? Number(restockingFeeValue) || 0
              : null,
          note: refundNote || null,
        },
      },
      {
        onSuccess: (res) => {
          const warning = (res as unknown as { _authnetWarning?: string | null })
            ._authnetWarning;
          toast({
            title: "Order marked as refunded",
            description: warning ?? undefined,
            variant: warning ? "destructive" : "default",
          });
          setRefundOpen(false);
          setGrossRefundAmt("");
          setRestockingFeeType("none");
          setRestockingFeeValue("");
          setRefundNote("");
          setPendingStatus("refunded");
          setStatusNote("");
          invalidate();
        },
        onError: (e: unknown) => {
          toast({
            title: "Refund failed",
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
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <Link
            href="/admin/orders"
            className="text-sm text-slate-600 hover:underline inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-3" />
            Back to orders
          </Link>
          <div className="flex items-center gap-3 flex-wrap">
            {(
              [
                { id: "customer", label: "Customer copy" },
                { id: "store", label: "Store copy" },
                { id: "delivery", label: "Delivery copy" },
              ] as const
            ).map(({ id, label }) => (
              <label
                key={id}
                className="flex items-center gap-1.5 cursor-pointer select-none text-sm text-slate-700"
              >
                <Checkbox
                  checked={printCopies.has(id)}
                  onCheckedChange={(checked) => {
                    setPrintCopies((prev) => {
                      const next = new Set(prev);
                      checked ? next.add(id) : next.delete(id);
                      return next;
                    });
                  }}
                />
                {label}
              </label>
            ))}
            <Button
              type="button"
              size="sm"
              disabled={printCopies.size === 0}
              className="bg-[#F4A982] hover:bg-[#EE9468] text-black border-0 shadow-sm disabled:opacity-50"
              onClick={() => {
                for (const copy of printCopies) {
                  window.open(
                    `/api/admin/orders/${order.id}/pdf?copy=${copy}`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                }
              }}
            >
              <Printer className="size-4 mr-1.5" />
              Print
            </Button>
          </div>
        </div>
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

            <div className="rounded-md border bg-white overflow-x-auto">
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
                        {/* Show alt fabric vendor inline. The "Change"
                            link is always available when the line has a
                            fabric so admins can also clear an existing
                            override or assign one for the first time. */}
                        {it.fabricId != null && (
                          <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                            <span>
                              Fabric vendor:{" "}
                              {it.fabricVendorName ? (
                                <span className="text-slate-700 font-medium">
                                  {it.fabricVendorName}
                                </span>
                              ) : (
                                <span className="text-slate-400">
                                  product default
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              className="text-blue-700 hover:underline"
                              onClick={() => openFabricVendorDialog(it)}
                            >
                              Change
                            </button>
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

            <PaymentsPanel
              orderId={orderId}
              total={order.total}
              amountPaid={order.amountPaid}
              balanceDue={order.balanceDue}
              paidInFull={order.paidInFull}
              payments={order.payments}
            />

            <DeliveryPanel
              orderId={orderId}
              shippingMethod={order.shippingMethod}
              scheduledDeliveryDate={order.scheduledDeliveryDate ?? null}
              scheduledDeliveryTime={order.scheduledDeliveryTime ?? null}
              items={order.items}
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
                  group unassigned items by vendor.
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

        {/* Process Refund dialog */}
        {order && (
          <Dialog
            open={refundOpen}
            onOpenChange={(open) => {
              if (!open) {
                setRefundOpen(false);
                setGrossRefundAmt("");
                setRestockingFeeType("none");
                setRestockingFeeValue("");
                setRefundNote("");
              }
            }}
          >
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>Process Refund</DialogTitle>
              </DialogHeader>
              {(() => {
                const grossNum = Number(grossRefundAmt) || 0;
                const feeNum = Number(restockingFeeValue) || 0;
                const computedFee =
                  restockingFeeType === "flat"
                    ? Math.min(feeNum, grossNum)
                    : restockingFeeType === "percent"
                      ? (grossNum * Math.min(feeNum, 100)) / 100
                      : 0;
                const netRefund = Math.max(0, grossNum - computedFee);
                const hasRestockingFee =
                  restockingFeeType !== "none" && computedFee > 0;
                return (
                  <div className="space-y-4">
                    {order.orderType === "online" && (
                      <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900 text-sm">
                        <strong>Online order:</strong> If a card transaction is
                        on file, the net refund will be submitted to
                        Authorize.net automatically.
                      </div>
                    )}
                    {order.orderType !== "online" && (
                      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 text-sm">
                        <strong>In-store / staff order:</strong> No payment
                        gateway is called — process any refund manually through
                        your payment terminal or check.
                      </div>
                    )}

                    <div>
                      <Label htmlFor="gross-refund">Refund amount (USD)</Label>
                      <Input
                        id="gross-refund"
                        inputMode="decimal"
                        value={grossRefundAmt}
                        onChange={(e) => setGrossRefundAmt(e.target.value)}
                        className="mt-1"
                      />
                      <p className="text-xs text-slate-500 mt-1">
                        Order total: {fmtMoney(order.total)}
                      </p>
                    </div>

                    <div>
                      <Label>Restocking fee</Label>
                      <Select
                        value={restockingFeeType}
                        onValueChange={(v) =>
                          setRestockingFeeType(
                            v as "none" | "flat" | "percent",
                          )
                        }
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No restocking fee</SelectItem>
                          <SelectItem value="flat">Flat amount ($)</SelectItem>
                          <SelectItem value="percent">Percentage (%)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {restockingFeeType !== "none" && (
                      <div>
                        <Label htmlFor="fee-value">
                          {restockingFeeType === "flat"
                            ? "Restocking fee ($)"
                            : "Restocking fee (%)"}
                        </Label>
                        <Input
                          id="fee-value"
                          inputMode="decimal"
                          value={restockingFeeValue}
                          onChange={(e) => setRestockingFeeValue(e.target.value)}
                          className="mt-1"
                          placeholder={
                            restockingFeeType === "flat" ? "e.g. 25.00" : "e.g. 15"
                          }
                        />
                      </div>
                    )}

                    {hasRestockingFee && (
                      <div className="rounded border border-slate-200 bg-slate-50 px-3 py-2 text-sm space-y-1">
                        <div className="flex justify-between">
                          <span className="text-slate-600">Gross refund</span>
                          <span>{fmtMoney(grossNum)}</span>
                        </div>
                        <div className="flex justify-between text-red-700">
                          <span>
                            Restocking fee
                            {restockingFeeType === "percent"
                              ? ` (${feeNum}%)`
                              : ""}
                          </span>
                          <span>− {fmtMoney(computedFee)}</span>
                        </div>
                        <div className="flex justify-between font-semibold border-t border-slate-200 pt-1 mt-1">
                          <span>Net refund to customer</span>
                          <span>{fmtMoney(netRefund)}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-1">
                          The customer email will note the reduction per the
                          refund &amp; restocking policy.
                        </p>
                      </div>
                    )}

                    {!hasRestockingFee && grossNum > 0 && (
                      <div className="text-sm text-slate-600">
                        Net refund to customer:{" "}
                        <span className="font-semibold">{fmtMoney(grossNum)}</span>
                      </div>
                    )}

                    <div>
                      <Label htmlFor="refund-note">Note (optional)</Label>
                      <Input
                        id="refund-note"
                        value={refundNote}
                        onChange={(e) => setRefundNote(e.target.value)}
                        placeholder="e.g. customer requested, damage on delivery"
                        className="mt-1"
                      />
                    </div>
                  </div>
                );
              })()}
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setRefundOpen(false)}
                  disabled={refundOrder.isPending}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleRefundSubmit}
                  disabled={
                    refundOrder.isPending || Number(grossRefundAmt) <= 0
                  }
                >
                  {refundOrder.isPending ? "Processing…" : "Process Refund"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Cancel customer order confirmation */}
        <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel this order?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>
                The order will be moved to{" "}
                <span className="font-medium">canceled</span>. The record is
                kept for reporting and the cancellation is logged with your
                name and the time.
              </p>
              <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-amber-900">
                <strong>Heads up:</strong> if the customer was already charged,
                you may need to issue a refund manually through the payment
                processor — cancelling here does not refund the card
                automatically.
              </div>
              {statusNote && (
                <p className="text-xs text-slate-600">
                  Note that will be saved: <em>"{statusNote}"</em>
                </p>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmCancel(false)}
                disabled={updateStatus.isPending}
              >
                Keep order
              </Button>
              <Button
                variant="destructive"
                onClick={performStatusUpdate}
                disabled={updateStatus.isPending}
              >
                {updateStatus.isPending ? "Cancelling…" : "Cancel order"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {Number.isFinite(orderId) ? (
          <div className="mt-6">
            <HistoryPanel entityType="order" entityId={orderId} />
          </div>
        ) : null}

        {/* Per-line alternate fabric vendor dialog. Saving regroups the
            line under a separate fabric-only PO; the server enforces
            that any currently-linked PO must still be `pending`. */}
        <Dialog
          open={fabricVendorEditing !== null}
          onOpenChange={(open) => {
            if (!open) setFabricVendorEditing(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set alternate fabric vendor</DialogTitle>
            </DialogHeader>
            {fabricVendorEditing && (
              <div className="space-y-3 text-sm">
                <div className="text-slate-600">
                  Line:{" "}
                  <span className="font-medium text-slate-900">
                    {fabricVendorEditing.description ??
                      fabricVendorEditing.variantNameSnapshot ??
                      "—"}
                  </span>
                </div>
                {fabricVendorEditing.fabricNameSnapshot && (
                  <div className="text-slate-600">
                    Fabric:{" "}
                    <span className="font-medium">
                      {fabricVendorEditing.fabricNameSnapshot}
                    </span>
                  </div>
                )}
                <div>
                  <Label>Fabric vendor</Label>
                  <Select
                    value={fabricVendorDraft}
                    onValueChange={setFabricVendorDraft}
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue placeholder="Use product's vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        Use product's vendor (default)
                      </SelectItem>
                      {manufacturers.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="mt-2 text-xs text-slate-500">
                    Saving will regroup any related vendor orders. This
                    is only allowed while every linked PO is still in
                    "pending" status.
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setFabricVendorEditing(null)}
                disabled={updateFabricVendor.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={handleFabricVendorSave}
                disabled={updateFabricVendor.isPending}
              >
                {updateFabricVendor.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </>
  );
}
