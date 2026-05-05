import { useEffect, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import {
  useAdminGetVendorOrder,
  useAdminUpdateVendorOrder,
  useAdminSendVendorOrder,
  useAdminUpdateVendorOrderStatus,
  useAdminReceiveVendorOrder,
  useAdminCancelVendorOrder,
  useAdminDeleteVendorOrder,
  getAdminGetVendorOrderQueryKey,
  getAdminListVendorOrdersQueryKey,
  getAdminGetOrderQueryKey,
  type AdminVendorOrderDetail,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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

const STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "outline" | "destructive"
> = {
  pending: "secondary",
  sent: "default",
  acknowledged: "default",
  fulfilled: "default",
  received: "outline",
  canceled: "destructive",
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}

// HTML <input type="date"> wants YYYY-MM-DD; convert from ISO string.
function isoToDateInput(s: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function VendorOrderDetail() {
  const params = useParams<{ id?: string }>();
  const id = params.id ? Number(params.id) : NaN;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const detail = useAdminGetVendorOrder(id, {
    query: {
      queryKey: getAdminGetVendorOrderQueryKey(id),
      enabled: Number.isFinite(id),
    },
  });
  const vo: AdminVendorOrderDetail | undefined = detail.data;

  const [notesDraft, setNotesDraft] = useState("");
  const [etaDraft, setEtaDraft] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState("");
  const [sendNote, setSendNote] = useState("");
  const [confirmReceive, setConfirmReceive] = useState(false);
  const [receiveNotes, setReceiveNotes] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelScope, setCancelScope] = useState<"full" | "partial">("full");
  const [cancelItemIds, setCancelItemIds] = useState<Set<number>>(new Set());
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSendEmail, setCancelSendEmail] = useState(true);
  const [cancelEmail, setCancelEmail] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (vo) {
      setNotesDraft(vo.notes ?? "");
      setEtaDraft(isoToDateInput(vo.vendorEstimatedDeliveryDate));
    }
  }, [vo]);

  const update = useAdminUpdateVendorOrder();
  const send = useAdminSendVendorOrder();
  const updateStatus = useAdminUpdateVendorOrderStatus();
  const receive = useAdminReceiveVendorOrder();
  const cancelMut = useAdminCancelVendorOrder();
  const deleteMut = useAdminDeleteVendorOrder();

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: getAdminGetVendorOrderQueryKey(id),
    });
    queryClient.invalidateQueries({
      queryKey: getAdminListVendorOrdersQueryKey(),
    });
    if (vo?.customerOrderId) {
      queryClient.invalidateQueries({
        queryKey: getAdminGetOrderQueryKey(vo.customerOrderId),
      });
    }
  }

  function handleErr(title: string) {
    return (e: unknown) =>
      toast({
        title,
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
  }

  function saveNotesAndEta() {
    if (!vo) return;
    const etaIso = etaDraft ? new Date(etaDraft).toISOString() : null;
    update.mutate(
      {
        id,
        data: { notes: notesDraft || null, vendorEstimatedDeliveryDate: etaIso },
      },
      {
        onSuccess: () => {
          toast({ title: "Saved" });
          invalidate();
        },
        onError: handleErr("Save failed"),
      },
    );
  }

  function submitSend() {
    send.mutate(
      {
        id,
        data: {
          sentToEmail: sendEmail.trim() || null,
          resendNote: sendNote.trim() || null,
        },
      },
      {
        onSuccess: () => {
          const wasResend = vo?.sentAt !== null;
          toast({ title: wasResend ? "Order resent to vendor" : "Vendor order sent" });
          setSendOpen(false);
          setSendNote("");
          invalidate();
        },
        onError: handleErr("Send failed"),
      },
    );
  }

  function transitionTo(toStatus: "acknowledged" | "fulfilled") {
    updateStatus.mutate(
      { id, data: { toStatus } },
      {
        onSuccess: () => {
          toast({ title: `Marked ${toStatus}` });
          invalidate();
        },
        onError: handleErr("Status update failed"),
      },
    );
  }

  function submitReceive() {
    receive.mutate(
      { id, data: { notes: receiveNotes.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Marked received" });
          setConfirmReceive(false);
          setReceiveNotes("");
          invalidate();
        },
        onError: handleErr("Receive failed"),
      },
    );
  }

  function openCancelDialog() {
    setCancelScope("full");
    setCancelItemIds(new Set());
    setCancelReason("");
    setCancelSendEmail(true);
    setCancelEmail(vo?.manufacturerOrderEmail ?? "");
    setConfirmCancel(true);
  }

  function toggleCancelItem(itemId: number) {
    setCancelItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function submitCancel() {
    if (cancelScope === "partial" && cancelItemIds.size === 0) {
      toast({
        title: "Select at least one item to cancel",
        variant: "destructive",
      });
      return;
    }
    cancelMut.mutate(
      {
        id,
        data: {
          scope: cancelScope,
          ...(cancelScope === "partial"
            ? { itemIds: Array.from(cancelItemIds) }
            : {}),
          reason: cancelReason.trim() || null,
          sendEmail: cancelSendEmail,
          sentToEmail: cancelSendEmail ? cancelEmail.trim() || null : null,
        },
      },
      {
        onSuccess: (resp) => {
          const r = resp as unknown as {
            emailStatus?: "skipped" | "sent" | "failed" | "no_address";
            emailError?: string | null;
          };
          const status = r?.emailStatus;
          const baseTitle =
            cancelScope === "full"
              ? "Vendor order canceled"
              : `${cancelItemIds.size} item(s) canceled`;
          let description = "Cancellation PDF generated.";
          let variant: "default" | "destructive" = "default";
          if (status === "sent") {
            description = "Cancellation notice emailed to vendor.";
          } else if (status === "failed") {
            description = `PDF generated, but email failed: ${r.emailError ?? "unknown error"}`;
            variant = "destructive";
          } else if (status === "no_address") {
            description =
              "PDF generated, but no vendor email address was available.";
            variant = "destructive";
          }
          toast({ title: baseTitle, description, variant });
          setConfirmCancel(false);
          invalidate();
        },
        onError: handleErr("Cancel failed"),
      },
    );
  }

  function submitDelete() {
    deleteMut.mutate(
      { id },
      {
        onSuccess: () => {
          toast({ title: "Vendor order deleted" });
          setConfirmDelete(false);
          invalidate();
          window.history.back();
        },
        onError: handleErr("Delete failed"),
      },
    );
  }

  if (!Number.isFinite(id)) {
    return (
      <>
        <PageHeader title="Vendor order" />
        <PageBody>Invalid id.</PageBody>
      </>
    );
  }

  if (detail.isLoading) {
    return (
      <>
        <PageHeader title="Vendor order" />
        <PageBody>
          <div className="flex justify-center py-16">
            <Spinner />
          </div>
        </PageBody>
      </>
    );
  }

  if (!vo) {
    return (
      <>
        <PageHeader title="Vendor order" />
        <PageBody>Vendor order not found.</PageBody>
      </>
    );
  }

  const itemsTotal = vo.items.reduce((sum, it) => sum + it.amount, 0);
  const isPending = vo.status === "pending";
  const isTerminal = vo.status === "received" || vo.status === "canceled";
  const canCancel = !isTerminal;
  const canReceive =
    vo.status === "sent" ||
    vo.status === "acknowledged" ||
    vo.status === "fulfilled";

  return (
    <>
      <PageHeader
        title={vo.vendorOrderNumber}
        subtitle={`${vo.status.replace(/_/g, " ")} · ${vo.manufacturerName ?? "No manufacturer"}`}
      />
      <PageBody>
        <div className="mb-4">
          <Link
            href="/admin/vendor-orders"
            className="text-sm text-slate-500 hover:text-slate-700 inline-flex items-center gap-1"
          >
            <ArrowLeft className="size-4" />
            All vendor orders
          </Link>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            {/* Items */}
            <div className="rounded-md border bg-white overflow-x-auto">
              <div className="px-4 py-3 border-b font-medium">Items</div>
              {vo.items.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  No items assigned to this vendor order.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">SKU</th>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium text-right">Qty</th>
                      <th className="px-3 py-2 font-medium text-right">
                        Unit
                      </th>
                      <th className="px-3 py-2 font-medium text-right">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {vo.items.map((it) => (
                      <tr key={it.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs">
                          {it.variantSkuSnapshot ??
                            it.productSkuSnapshot ??
                            "—"}
                        </td>
                        <td className="px-3 py-2">
                          <div>{it.description}</div>
                          {(it.variantNameSnapshot ||
                            it.fabricNameSnapshot) && (
                            <div className="text-xs text-slate-500">
                              {[it.variantNameSnapshot, it.fabricNameSnapshot]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">{it.quantity}</td>
                        <td className="px-3 py-2 text-right">
                          {fmtMoney(it.unitPrice)}
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {fmtMoney(it.amount)}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t bg-slate-50">
                      <td colSpan={4} className="px-3 py-2 text-right font-medium">
                        Total
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        {fmtMoney(itemsTotal)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>

            {/* Notes + ETA */}
            <div className="rounded-md border bg-white p-4 space-y-3">
              <div className="font-medium">Vendor order details</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="vo-eta" className="text-xs uppercase">
                    Vendor ETA
                  </Label>
                  <Input
                    id="vo-eta"
                    type="date"
                    value={etaDraft}
                    onChange={(e) => setEtaDraft(e.target.value)}
                    disabled={isTerminal}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="vo-notes" className="text-xs uppercase">
                  Notes
                </Label>
                <Textarea
                  id="vo-notes"
                  value={notesDraft}
                  onChange={(e) => setNotesDraft(e.target.value)}
                  placeholder="Internal notes about this vendor order"
                  disabled={isTerminal}
                  rows={3}
                />
              </div>
              {!isTerminal && (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={saveNotesAndEta}
                    disabled={update.isPending}
                  >
                    Save details
                  </Button>
                </div>
              )}
            </div>

            {/* Cancellations */}
            {vo.cancellations.length > 0 && (
              <div className="rounded-md border bg-white">
                <div className="px-4 py-3 border-b font-medium text-red-700">
                  Cancellation history
                </div>
                <ul className="divide-y">
                  {vo.cancellations.map((c) => (
                    <li key={c.id} className="px-4 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={c.scope === "full" ? "destructive" : "outline"}
                        >
                          {c.scope === "full"
                            ? "full cancel"
                            : `partial · ${c.itemCount} item${c.itemCount === 1 ? "" : "s"}`}
                        </Badge>
                        <span className="ml-auto flex items-center gap-2">
                          {c.pdfStorageUrl && (
                            <a
                              href={`/api/storage${c.pdfStorageUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              View PDF
                            </a>
                          )}
                          <span className="text-xs text-slate-500">
                            {fmtDateTime(c.cancelledAt)}
                          </span>
                        </span>
                      </div>
                      {c.cancelledByEmail && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          by {c.cancelledByEmail}
                        </div>
                      )}
                      {c.emailedAt && c.emailedTo && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          Emailed to {c.emailedTo} at {fmtDateTime(c.emailedAt)}
                        </div>
                      )}
                      {c.reason && (
                        <div className="text-slate-600 mt-0.5">
                          Reason: {c.reason}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Sends */}
            <div className="rounded-md border bg-white">
              <div className="px-4 py-3 border-b font-medium">Send history</div>
              {vo.sends.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500">
                  Not sent to vendor yet.
                </div>
              ) : (
                <ul className="divide-y">
                  {vo.sends.map((s) => (
                    <li key={s.id} className="px-4 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <Badge variant={s.isResend ? "outline" : "default"}>
                          {s.isResend ? "resend" : "sent"}
                        </Badge>
                        <span className="text-slate-600">
                          {s.sentToEmail ?? "(no email recorded)"}
                        </span>
                        <span className="ml-auto flex items-center gap-2">
                          {s.pdfStorageUrl && (
                            <a
                              href={`/api/storage${s.pdfStorageUrl}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline"
                            >
                              View PO
                            </a>
                          )}
                          <span className="text-xs text-slate-500">
                            {fmtDateTime(s.sentAt)}
                          </span>
                        </span>
                      </div>
                      {s.sentByEmail && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          by {s.sentByEmail}
                        </div>
                      )}
                      {s.resendNote && (
                        <div className="text-slate-600 mt-0.5">
                          Note: {s.resendNote}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            <div className="rounded-md border bg-white p-4 space-y-3 text-sm">
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase mb-1">
                  Customer order
                </div>
                {vo.customerOrderNumber ? (
                  <Link
                    href={`/admin/orders/${vo.customerOrderId}`}
                    className="text-blue-700 hover:underline font-medium"
                  >
                    {vo.customerOrderNumber}
                  </Link>
                ) : (
                  <div>—</div>
                )}
                {vo.customerOrderStatus && (
                  <div className="text-xs text-slate-500 capitalize">
                    {vo.customerOrderStatus.replace(/_/g, " ")}
                  </div>
                )}
                {vo.customerName && (
                  <div className="text-slate-600 mt-1">{vo.customerName}</div>
                )}
              </div>
              <div>
                <div className="text-xs font-medium text-slate-500 uppercase mb-1">
                  Timeline
                </div>
                <div className="space-y-0.5">
                  <div>Created: {fmtDateTime(vo.createdAt)}</div>
                  <div>Sent: {fmtDateTime(vo.sentAt)}</div>
                  <div>Acknowledged: {fmtDateTime(vo.acknowledgedAt)}</div>
                  <div>Fulfilled: {fmtDateTime(vo.fulfilledAt)}</div>
                  <div>Received: {fmtDateTime(vo.receivedAt)}</div>
                </div>
              </div>
              {(vo.createdByEmail || vo.receivedByEmail) && (
                <div>
                  <div className="text-xs font-medium text-slate-500 uppercase mb-1">
                    People
                  </div>
                  {vo.createdByEmail && (
                    <div>Created by {vo.createdByEmail}</div>
                  )}
                  {vo.receivedByEmail && (
                    <div>Received by {vo.receivedByEmail}</div>
                  )}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="rounded-md border bg-white p-4 space-y-2">
              <div className="text-xs font-medium text-slate-500 uppercase">
                Actions
              </div>
              {(!isTerminal || vo.sentAt) && (
                <Button
                  type="button"
                  className="w-full"
                  onClick={() => {
                    setSendEmail(vo.manufacturerOrderEmail ?? "");
                    setSendOpen(true);
                  }}
                >
                  {vo.sentAt ? "Resend to vendor" : "Send to vendor"}
                </Button>
              )}
              {vo.status === "sent" && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => transitionTo("acknowledged")}
                  disabled={updateStatus.isPending}
                >
                  Mark acknowledged
                </Button>
              )}
              {(vo.status === "sent" || vo.status === "acknowledged") && (
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  onClick={() => transitionTo("fulfilled")}
                  disabled={updateStatus.isPending}
                >
                  Mark fulfilled
                </Button>
              )}
              {canReceive && (
                <Button
                  type="button"
                  variant="default"
                  className="w-full"
                  onClick={() => setConfirmReceive(true)}
                >
                  Mark received
                </Button>
              )}
              {isPending && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete (un-assign items)
                </Button>
              )}
              {canCancel && !isPending && (
                <Button
                  type="button"
                  variant="destructive"
                  className="w-full"
                  onClick={openCancelDialog}
                >
                  Cancel vendor order
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Send dialog */}
        <Dialog open={sendOpen} onOpenChange={setSendOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {vo.sentAt ? "Resend to vendor" : "Send to vendor"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="send-email">Vendor email</Label>
                <Input
                  id="send-email"
                  type="email"
                  value={sendEmail}
                  onChange={(e) => setSendEmail(e.target.value)}
                  placeholder="orders@vendor.com"
                />
                <p className="text-xs text-slate-500 mt-1">
                  An email with the purchase order details will be sent to this
                  address. If left blank, the manufacturer's configured order
                  email will be used (if set).
                </p>
              </div>
              {vo.sentAt && (
                <div>
                  <Label htmlFor="send-note">Resend reason</Label>
                  <Textarea
                    id="send-note"
                    value={sendNote}
                    onChange={(e) => setSendNote(e.target.value)}
                    placeholder="Why are you resending?"
                    rows={3}
                  />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSendOpen(false)}>
                Cancel
              </Button>
              <Button onClick={submitSend} disabled={send.isPending}>
                {vo.sentAt ? "Resend" : "Send"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Receive dialog */}
        <Dialog open={confirmReceive} onOpenChange={setConfirmReceive}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Mark items received?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>
                This records receipt of all items on this vendor order. The
                status will move to <span className="font-medium">received</span>{" "}
                and a receipt will be logged.
              </p>
              <div>
                <Label htmlFor="receive-notes">Receipt notes (optional)</Label>
                <Textarea
                  id="receive-notes"
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmReceive(false)}
              >
                Cancel
              </Button>
              <Button onClick={submitReceive} disabled={receive.isPending}>
                Mark received
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel dialog */}
        <Dialog open={confirmCancel} onOpenChange={setConfirmCancel}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Cancel vendor order</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p className="text-slate-600">
                Choose whether to cancel the entire purchase order or only specific
                line items. The cancelled items will be un-assigned from this PO so
                they can be regrouped onto a different vendor order. A revised PO
                PDF will be generated and stored, and (optionally) emailed to the
                vendor. The cancellation is logged with your name and the time.
              </p>

              {/* Scope */}
              <div className="rounded-md border p-3 space-y-2">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cancel-scope"
                    checked={cancelScope === "full"}
                    onChange={() => setCancelScope("full")}
                    className="mt-1"
                  />
                  <div>
                    <div className="font-medium">Cancel entire PO</div>
                    <div className="text-xs text-slate-500">
                      All {vo.items.length} item(s) will be cancelled and the PO
                      status will move to{" "}
                      <span className="font-medium">canceled</span>.
                    </div>
                  </div>
                </label>
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="cancel-scope"
                    checked={cancelScope === "partial"}
                    onChange={() => setCancelScope("partial")}
                    className="mt-1"
                    disabled={vo.items.length < 2}
                  />
                  <div>
                    <div className="font-medium">Cancel specific items</div>
                    <div className="text-xs text-slate-500">
                      Pick the line items to remove. The remaining items stay on
                      this PO and the vendor receives a revised purchase order.
                      {vo.items.length < 2 && " (Need at least 2 items.)"}
                    </div>
                  </div>
                </label>
              </div>

              {/* Item picker (partial only) */}
              {cancelScope === "partial" && (
                <div className="rounded-md border max-h-56 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 w-8"></th>
                        <th className="px-2 py-1 text-left">SKU</th>
                        <th className="px-2 py-1 text-left">Description</th>
                        <th className="px-2 py-1 text-right">Qty</th>
                        <th className="px-2 py-1 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vo.items.map((it) => {
                        const checked = cancelItemIds.has(it.id);
                        return (
                          <tr
                            key={it.id}
                            className={`border-t cursor-pointer ${
                              checked ? "bg-red-50" : ""
                            }`}
                            onClick={() => toggleCancelItem(it.id)}
                          >
                            <td className="px-2 py-1">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleCancelItem(it.id)}
                                aria-label={`Cancel item ${it.id}`}
                              />
                            </td>
                            <td className="px-2 py-1 font-mono">
                              {it.variantSkuSnapshot ??
                                it.productSkuSnapshot ??
                                "—"}
                            </td>
                            <td className="px-2 py-1">
                              <div className={checked ? "line-through" : ""}>
                                {it.description}
                              </div>
                            </td>
                            <td className="px-2 py-1 text-right">
                              {it.quantity}
                            </td>
                            <td className="px-2 py-1 text-right">
                              {fmtMoney(it.amount)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Reason */}
              <div>
                <Label htmlFor="cancel-reason">Reason (optional)</Label>
                <Textarea
                  id="cancel-reason"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Customer request, vendor unable to fulfill, etc."
                  rows={2}
                />
                <p className="text-xs text-slate-500 mt-1">
                  Shown to the vendor on the cancellation PDF and email.
                </p>
              </div>

              {/* Email */}
              <div className="rounded-md border bg-slate-50 p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={cancelSendEmail}
                    onCheckedChange={(v) => setCancelSendEmail(v === true)}
                  />
                  <span className="font-medium">
                    Email cancellation notice to vendor
                  </span>
                </label>
                {cancelSendEmail && (
                  <div>
                    <Label htmlFor="cancel-email" className="text-xs">
                      Vendor email
                    </Label>
                    <Input
                      id="cancel-email"
                      type="email"
                      value={cancelEmail}
                      onChange={(e) => setCancelEmail(e.target.value)}
                      placeholder="orders@vendor.com"
                    />
                    <p className="text-xs text-slate-500 mt-1">
                      Defaults to the manufacturer's configured order email. The
                      revised PO PDF will be attached.
                    </p>
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmCancel(false)}
              >
                Keep
              </Button>
              <Button
                variant="destructive"
                onClick={submitCancel}
                disabled={cancelMut.isPending}
              >
                {cancelScope === "full"
                  ? "Cancel entire PO"
                  : `Cancel ${cancelItemIds.size || ""} item${cancelItemIds.size === 1 ? "" : "s"}`.trim()}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete dialog */}
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete this vendor order?</DialogTitle>
            </DialogHeader>
            <p className="text-sm">
              The vendor order is still in <span className="font-medium">pending</span>{" "}
              status, so it can be deleted. Its items will be un-assigned and
              available to regroup.
            </p>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmDelete(false)}
              >
                Keep
              </Button>
              <Button
                variant="destructive"
                onClick={submitDelete}
                disabled={deleteMut.isPending}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {Number.isFinite(id) ? (
          <div className="mt-6">
            <HistoryPanel entityType="vendor_order" entityId={id} />
          </div>
        ) : null}
      </PageBody>
    </>
  );
}
