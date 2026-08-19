import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { formatStatusLabel } from "../../lib/statusLabel";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Printer, Pencil, Flag, Plus, Search, X } from "lucide-react";
import {
  useAdminGetVendorOrder,
  useAdminUpdateVendorOrder,
  useAdminEditVendorOrder,
  useAdminSendVendorOrder,
  useAdminUpdateVendorOrderStatus,
  useAdminReceiveVendorOrder,
  useAdminCancelVendorOrder,
  useAdminCancelPendingVendorOrder,
  useAdminListProducts,
  useAdminGetProductPicker,
  getAdminGetVendorOrderQueryKey,
  getAdminListVendorOrdersQueryKey,
  getAdminGetOrderQueryKey,
  getAdminGetProductPickerQueryKey,
  type AdminVendorOrderDetail,
  type AdminProduct,
  type AdminProductPickerDetail,
  type CatalogProductVariant,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
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
  partially_received: "secondary",
  received: "outline",
  canceled: "destructive",
};

const STATUS_EXTRA_CLASS: Record<string, string> = {
  partially_received: "bg-amber-100 text-amber-800 border-amber-300",
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

// An editable line-item row in edit mode. `id` is the existing order_item id,
// or null for a freshly added line. `removed` strikes an existing line from the
// PO (kept on the customer order). `cost` is read-only (from the product).
type EditRow = {
  key: string;
  id: number | null;
  // Read-only display: from the existing item (for existing lines) or
  // derived by the picker (for new lines). Never free-typed.
  sku: string | null;
  description: string;
  subDescription: string | null;
  quantity: string;
  cost: number | null;
  removed: boolean;
  kind: string;
  // Picker payload — only populated for new (id == null) lines.
  productId: number | null;
  variantId: number | null;
  grade: string | null;
  finishId: number | null;
  notes: string | null;
};

// Stable string signature of the whole edit form, used to detect whether the
// staff user has actually changed anything (drives the change-note box).
function serializeEdit(
  rows: EditRow[],
  notes: string,
  noteToVendor: string,
  eta: string,
): string {
  return JSON.stringify({
    rows: rows.map((r) => ({
      id: r.id,
      quantity: r.quantity.trim(),
      removed: r.removed,
      ...(r.id == null
        ? { productId: r.productId, variantId: r.variantId, grade: r.grade, finishId: r.finishId }
        : {}),
    })),
    notes,
    noteToVendor,
    eta,
  });
}

// Distinct blue input styling so staff can clearly see active/editable fields.
const EDIT_INPUT_CLS =
  "bg-blue-50 border-blue-300 focus-visible:ring-blue-400";

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
  const [noteToVendorDraft, setNoteToVendorDraft] = useState("");
  const [etaDraft, setEtaDraft] = useState("");
  const [sendOpen, setSendOpen] = useState(false);
  const [sendEmail, setSendEmail] = useState("");
  const [sendNote, setSendNote] = useState("");
  // "plain" = send / resend-as-is; "editResend" = the two-phase flow launched
  // after editing a sent PO (email confirm → optional PO correction note).
  const [sendFlow, setSendFlow] = useState<"plain" | "editResend">("plain");
  const [sendPhase, setSendPhase] = useState<"email" | "correction">("email");
  const [correctionEnabled, setCorrectionEnabled] = useState(false);
  const [correctionNote, setCorrectionNote] = useState("");
  // Inline "this order was already sent — how do you want to proceed?" prompt
  // shown when saving edits on a SENT PO.
  const [sentSavePromptOpen, setSentSavePromptOpen] = useState(false);
  const [confirmReceive, setConfirmReceive] = useState(false);
  const [receiveItems, setReceiveItems] = useState<Map<number, string>>(new Map());
  const [receiveNotes, setReceiveNotes] = useState("");
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelScope, setCancelScope] = useState<"full" | "partial">("full");
  const [cancelItemIds, setCancelItemIds] = useState<Set<number>>(new Set());
  const [cancelReason, setCancelReason] = useState("");
  const [cancelSendEmail, setCancelSendEmail] = useState(true);
  const [cancelEmail, setCancelEmail] = useState("");
  const [confirmCancelPending, setConfirmCancelPending] = useState(false);
  const [cancelPendingScope, setCancelPendingScope] = useState<"full" | "partial">("full");
  const [cancelPendingItemIds, setCancelPendingItemIds] = useState<Set<number>>(new Set());
  const [cancelPendingReason, setCancelPendingReason] = useState("");

  // ── Edit mode ──────────────────────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editRows, setEditRows] = useState<EditRow[]>([]);
  const [changeNote, setChangeNote] = useState("");
  const [noteError, setNoteError] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const editBaselineRef = useRef<string>("");

  useEffect(() => {
    // Don't clobber in-flight edits when the query refetches.
    if (vo && !editMode) {
      setNotesDraft(vo.notes ?? "");
      setNoteToVendorDraft(vo.noteToVendor ?? "");
      setEtaDraft(isoToDateInput(vo.vendorEstimatedDeliveryDate));
    }
  }, [vo, editMode]);

  const update = useAdminUpdateVendorOrder();
  const editOrder = useAdminEditVendorOrder();
  const send = useAdminSendVendorOrder();
  const updateStatus = useAdminUpdateVendorOrderStatus();
  const receive = useAdminReceiveVendorOrder();
  const cancelMut = useAdminCancelVendorOrder();
  const cancelPendingMut = useAdminCancelPendingVendorOrder();

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
        data: {
          notes: notesDraft || null,
          noteToVendor: noteToVendorDraft || null,
          vendorEstimatedDeliveryDate: etaIso,
        },
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

  function enterEditMode() {
    if (!vo) return;
    const rows: EditRow[] = vo.items.map((it) => ({
      key: `r${it.id}`,
      id: it.id,
      sku: it.sku ?? null,
      description: it.description,
      subDescription: it.subDescription ?? null,
      quantity: String(it.quantity),
      cost: it.cost,
      removed: false,
      kind: it.kind,
      productId: null,
      variantId: null,
      grade: null,
      finishId: null,
      notes: null,
    }));
    const notes = vo.notes ?? "";
    const noteToVendor = vo.noteToVendor ?? "";
    const eta = isoToDateInput(vo.vendorEstimatedDeliveryDate);
    setEditRows(rows);
    setNotesDraft(notes);
    setNoteToVendorDraft(noteToVendor);
    setEtaDraft(eta);
    setChangeNote("");
    setNoteError(false);
    setSentSavePromptOpen(false);
    editBaselineRef.current = serializeEdit(rows, notes, noteToVendor, eta);
    setEditMode(true);
  }

  function cancelEditMode() {
    setEditMode(false);
    setEditRows([]);
    setChangeNote("");
    setNoteError(false);
    setSentSavePromptOpen(false);
    if (vo) {
      setNotesDraft(vo.notes ?? "");
      setNoteToVendorDraft(vo.noteToVendor ?? "");
      setEtaDraft(isoToDateInput(vo.vendorEstimatedDeliveryDate));
    }
  }

  function updateRow(key: string, patch: Partial<EditRow>) {
    setEditRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  function toggleRemoveRow(key: string) {
    setEditRows((rs) =>
      rs.flatMap((r) => {
        if (r.key !== key) return [r];
        // A never-persisted (added) row is dropped outright; an existing line
        // is flagged removed so the backend keeps it on the customer order.
        if (r.id == null) return [];
        return [{ ...r, removed: !r.removed }];
      }),
    );
  }

  function handlePickerApply(
    product: AdminProduct,
    variant: CatalogProductVariant | null,
    grade: string | null,
    finishId: number | null,
    gradeLabel: string | null,
  ) {
    const description = variant
      ? `${product.name} — ${variant.name}`
      : product.name;
    setEditRows((rs) => [
      ...rs,
      {
        key: `new-${Date.now()}-${rs.length}`,
        id: null,
        sku: variant?.sku ?? product.sku,
        description,
        subDescription: gradeLabel,
        quantity: "1",
        cost: null,
        removed: false,
        kind: "product",
        productId: product.id,
        variantId: variant?.id ?? null,
        grade,
        finishId,
        notes: null,
      },
    ]);
    setPickerOpen(false);
  }

  function buildEditData() {
    const note = changeNote.trim();
    if (!note) {
      setNoteError(true);
      return null;
    }
    const items = editRows.map((r) => {
      if (r.id != null) {
        return {
          id: r.id,
          removed: r.removed,
          quantity: Number(r.quantity) || 0,
        };
      }
      return {
        productId: r.productId!,
        ...(r.variantId != null ? { variantId: r.variantId } : {}),
        ...(r.grade != null ? { grade: r.grade } : {}),
        ...(r.finishId != null ? { finishId: r.finishId } : {}),
        ...(r.notes != null ? { notes: r.notes } : {}),
        quantity: Number(r.quantity) || 0,
      };
    });
    return {
      changeNote: note,
      notes: notesDraft || null,
      noteToVendor: noteToVendorDraft || null,
      vendorEstimatedDeliveryDate: etaDraft
        ? new Date(etaDraft).toISOString()
        : null,
      items,
    };
  }

  function exitEditState() {
    setEditMode(false);
    setEditRows([]);
    setChangeNote("");
    setNoteError(false);
    setSentSavePromptOpen(false);
  }

  // "Save changes" click. Pending POs save immediately; sent POs first surface
  // the "save & resend vs. save without resending" choice.
  function handleEditSaveClick() {
    if (vo?.status === "sent") {
      if (!buildEditData()) return;
      setSentSavePromptOpen(true);
      return;
    }
    submitEdit();
  }

  // Save only (pending POs, and the sent-PO "save without resending" choice).
  function submitEdit() {
    const data = buildEditData();
    if (!data) return;
    editOrder.mutate(
      { id, data },
      {
        onSuccess: () => {
          toast({ title: "Changes saved" });
          exitEditState();
          invalidate();
        },
        onError: handleErr("Save failed"),
      },
    );
  }

  // Sent-PO "save and resend": persist the edit first, then open the resend
  // flow (email confirm → optional PO correction note).
  function saveAndResend() {
    const data = buildEditData();
    if (!data) return;
    editOrder.mutate(
      { id, data },
      {
        onSuccess: () => {
          toast({ title: "Changes saved" });
          exitEditState();
          invalidate();
          setSendFlow("editResend");
          setSendPhase("email");
          setSendEmail(vo?.manufacturerOrderEmail ?? "");
          setCorrectionEnabled(false);
          setCorrectionNote("");
          setSendOpen(true);
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
          noChanges: vo?.sentAt != null,
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

  function continueToCorrection() {
    setSendPhase("correction");
  }

  // Sent-PO resend after an edit: sends the updated PO, optionally with a
  // one-off correction note printed at the very top for the vendor.
  function submitEditResend() {
    if (correctionEnabled && correctionNote.trim().length === 0) {
      toast({
        title: "Enter the correction note or uncheck the option",
        variant: "destructive",
      });
      return;
    }
    send.mutate(
      {
        id,
        data: {
          sentToEmail: sendEmail.trim() || null,
          correctionNote: correctionEnabled ? correctionNote.trim() : null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Order resent to vendor" });
          setSendOpen(false);
          setSendFlow("plain");
          setSendPhase("email");
          setCorrectionEnabled(false);
          setCorrectionNote("");
          invalidate();
        },
        onError: handleErr("Resend failed"),
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

  function openReceiveDialog() {
    if (!vo) return;
    const initMap = new Map<number, string>();
    for (const item of vo.items) {
      const remaining = item.quantity - item.receivedQuantity;
      if (remaining > 0) initMap.set(item.id, String(remaining));
    }
    setReceiveItems(initMap);
    setReceiveNotes("");
    setConfirmReceive(true);
  }

  function submitReceive() {
    const items: { orderItemId: number; quantity: number }[] = [];
    for (const [orderItemId, qtyStr] of receiveItems) {
      const qty = parseInt(qtyStr, 10);
      if (Number.isFinite(qty) && qty > 0) items.push({ orderItemId, quantity: qty });
    }
    if (items.length === 0) {
      toast({ title: "Enter at least one quantity to receive", variant: "destructive" });
      return;
    }
    receive.mutate(
      { id, data: { items, notes: receiveNotes.trim() || null } },
      {
        onSuccess: () => {
          toast({ title: "Items received" });
          setConfirmReceive(false);
          setReceiveItems(new Map());
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
              ? "Vendor order cancelled"
              : `${cancelItemIds.size} item(s) cancelled`;
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

  function openCancelPendingDialog() {
    setCancelPendingScope("full");
    setCancelPendingItemIds(new Set());
    setCancelPendingReason("");
    setConfirmCancelPending(true);
  }

  function toggleCancelPendingItem(itemId: number) {
    setCancelPendingItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  function submitCancelPending() {
    if (cancelPendingScope === "partial" && cancelPendingItemIds.size === 0) {
      toast({ title: "Select at least one item to cancel", variant: "destructive" });
      return;
    }
    cancelPendingMut.mutate(
      {
        id,
        data: {
          scope: cancelPendingScope,
          ...(cancelPendingScope === "partial"
            ? { itemIds: Array.from(cancelPendingItemIds) }
            : {}),
          reason: cancelPendingReason.trim() || null,
        },
      },
      {
        onSuccess: () => {
          const msg =
            cancelPendingScope === "full"
              ? "Vendor order cancelled"
              : `${cancelPendingItemIds.size} item(s) removed from order`;
          toast({ title: msg });
          setConfirmCancelPending(false);
          invalidate();
        },
        onError: handleErr("Cancel failed"),
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

  const itemsCostTotal = vo.items.reduce(
    (sum, it) => sum + (it.cost != null ? it.cost * it.quantity : 0),
    0,
  );
  const isPending = vo.status === "pending";
  const isTerminal = vo.status === "received" || vo.status === "canceled";
  const canCancel = !isTerminal;
  const canReceive =
    vo.status === "sent" ||
    vo.status === "acknowledged" ||
    vo.status === "fulfilled" ||
    vo.status === "partially_received";

  const editDirty =
    editMode &&
    serializeEdit(editRows, notesDraft, noteToVendorDraft, etaDraft) !==
      editBaselineRef.current;

  // Merge sends + edits + status changes into one reverse-chronological activity timeline.
  const activity = [
    ...vo.sends.map((s) => ({ type: "send" as const, at: s.sentAt, send: s })),
    ...vo.edits.map((e) => ({ type: "edit" as const, at: e.editedAt, edit: e })),
    ...vo.statusChanges.map((c) => ({
      type: "status" as const,
      at: c.changedAt,
      statusChange: c,
    })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <>
      <PageHeader
        title={vo.vendorOrderNumber}
        subtitle={`${formatStatusLabel(vo.status)} · ${vo.manufacturerName ?? "No vendor"}`}
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
            {/* Edit-mode banner */}
            {editMode && (
              <div className="rounded-md border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                <span className="font-medium">Edit mode</span> — all changes
                require a note before saving.
              </div>
            )}

            {/* Items */}
            <div className="rounded-md border bg-white overflow-x-auto">
              <div className="px-4 py-3 border-b font-medium">Items</div>
              {editMode ? (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="px-3 py-2 font-medium text-right">Qty</th>
                        <th className="px-3 py-2 font-medium text-right">Unit cost</th>
                        <th className="px-3 py-2 font-medium w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editRows.map((r) => (
                        <tr
                          key={r.key}
                          className={`border-t ${r.removed ? "bg-red-50 opacity-60" : ""}`}
                        >
                          <td className="px-3 py-1.5 align-middle">
                            <div className="font-medium">{r.description}</div>
                            {r.sku && (
                              <div className="text-xs font-mono text-slate-500">
                                {r.sku}
                              </div>
                            )}
                            {r.subDescription && (
                              <div className="text-xs text-slate-500">
                                {r.subDescription}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1.5 align-middle w-20">
                            <Input
                              type="number"
                              min={0}
                              value={r.quantity}
                              onChange={(e) =>
                                updateRow(r.key, { quantity: e.target.value })
                              }
                              disabled={r.removed}
                              className={`h-8 text-right ${EDIT_INPUT_CLS}`}
                            />
                          </td>
                          <td className="px-3 py-1.5 align-middle text-right whitespace-nowrap">
                            {r.cost != null ? (
                              fmtMoney(r.cost)
                            ) : (
                              <span className="italic text-slate-400">
                                on save
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-1.5 align-middle text-center">
                            <button
                              type="button"
                              onClick={() => toggleRemoveRow(r.key)}
                              className="text-slate-400 hover:text-red-600"
                              aria-label={
                                r.removed ? "Restore line" : "Remove line"
                              }
                              title={r.removed ? "Restore line" : "Remove line"}
                            >
                              <X className="size-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {editRows.length === 0 && (
                        <tr className="border-t">
                          <td
                            colSpan={4}
                            className="px-3 py-6 text-center text-sm text-slate-500"
                          >
                            No line items. Add one below.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                  <div className="border-t px-3 py-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setPickerOpen(true)}
                    >
                      <Plus className="size-4 mr-1" />
                      Add product
                    </Button>
                  </div>
                </>
              ) : vo.items.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-slate-500">
                  No items assigned to this vendor order.
                </div>
              ) : (
                <>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium w-8"></th>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="px-3 py-2 font-medium text-right">Qty</th>
                        <th className="px-3 py-2 font-medium text-right">Unit cost</th>
                        <th className="px-3 py-2 font-medium text-right">Total cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vo.items.map((it) => (
                        <tr key={it.id} className="border-t">
                          <td className="px-3 py-2 align-top">
                            {it.edited && (
                              <Flag
                                className="size-4 text-red-600 fill-red-600"
                                aria-label="Differs from original order"
                              />
                            )}
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">
                            {it.sku ??
                              it.variantSkuSnapshot ??
                              it.productSkuSnapshot ??
                              "—"}
                          </td>
                          <td className="px-3 py-2">
                            <div>{it.description}</div>
                            {(it.subDescription || it.fabricNameSnapshot) && (
                              <div className="text-xs text-slate-500">
                                {[it.subDescription, it.fabricNameSnapshot]
                                  .filter(Boolean)
                                  .join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {it.quantity}
                          </td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            {it.cost != null ? fmtMoney(it.cost) : ""}
                          </td>
                          <td className="px-3 py-2 text-right font-medium">
                            {it.cost != null
                              ? fmtMoney(it.cost * it.quantity)
                              : ""}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t bg-slate-50">
                        <td
                          colSpan={5}
                          className="px-3 py-2 text-right font-medium"
                        >
                          Total
                        </td>
                        <td className="px-3 py-2 text-right font-medium">
                          {fmtMoney(itemsCostTotal)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  {vo.items.some((it) => it.edited) && (
                    <div className="border-t px-4 py-2 text-xs italic text-slate-500">
                      <Flag className="inline size-3 text-red-600 fill-red-600 mr-1 align-[-1px]" />
                      Flagged items indicate differences from the original order.
                      Original order remains unchanged.
                    </div>
                  )}
                </>
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
                    disabled={isTerminal || (isPending && !editMode)}
                    className={editMode ? EDIT_INPUT_CLS : undefined}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="vo-note-to-vendor" className="text-xs uppercase">
                  Note to Vendor
                </Label>
                <Textarea
                  id="vo-note-to-vendor"
                  value={noteToVendorDraft}
                  onChange={(e) => setNoteToVendorDraft(e.target.value)}
                  placeholder="Message to the vendor — printed in bold, ALL CAPS at the top of the PO"
                  disabled={isTerminal || (isPending && !editMode)}
                  rows={2}
                  className={editMode ? EDIT_INPUT_CLS : undefined}
                />
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
                  disabled={isTerminal || (isPending && !editMode)}
                  rows={3}
                  className={editMode ? EDIT_INPUT_CLS : undefined}
                />
              </div>

              {/* Pending orders are edited through the audited edit mode; the
                  quick "Save details" path stays for non-pending (sent+) POs. */}
              {!isTerminal && !isPending && !editMode && (
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

              {/* Change-note box appears as soon as anything is edited. */}
              {editMode && editDirty && (
                <div className="rounded-md border border-red-300 bg-red-50 p-3 space-y-1.5">
                  <Label htmlFor="vo-change-note" className="text-sm font-medium">
                    Why are you making this change? (required)
                  </Label>
                  <p className="text-xs text-slate-500">
                    Logged with your name and a timestamp.
                  </p>
                  <Textarea
                    id="vo-change-note"
                    value={changeNote}
                    onChange={(e) => {
                      setChangeNote(e.target.value);
                      if (e.target.value.trim()) setNoteError(false);
                    }}
                    rows={2}
                    className="bg-white"
                  />
                  {noteError && (
                    <p className="text-xs text-red-600">
                      A change note is required before saving.
                    </p>
                  )}
                </div>
              )}

              {editMode &&
                (sentSavePromptOpen ? (
                  <div className="rounded-md border border-amber-300 bg-amber-50 p-3 space-y-2">
                    <div className="text-sm font-medium">
                      This order was already sent to the vendor.
                    </div>
                    <div className="text-sm text-slate-600">
                      Choose how to proceed:
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        type="button"
                        onClick={saveAndResend}
                        disabled={editOrder.isPending || send.isPending}
                      >
                        Save and resend to vendor
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={submitEdit}
                        disabled={editOrder.isPending}
                      >
                        Save without resending
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSentSavePromptOpen(false)}
                        disabled={editOrder.isPending}
                      >
                        Back
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={cancelEditMode}
                      disabled={editOrder.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      onClick={handleEditSaveClick}
                      disabled={
                        editOrder.isPending ||
                        !editDirty ||
                        changeNote.trim().length === 0
                      }
                    >
                      Save changes
                    </Button>
                  </div>
                ))}
            </div>

            {/* Receive history */}
            {vo.receives.length > 0 && (
              <div className="rounded-md border bg-white">
                <div className="px-4 py-3 border-b font-medium text-green-700">
                  Receive history
                </div>
                <ul className="divide-y">
                  {vo.receives.map((r) => (
                    <li key={r.id} className="px-4 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-green-700">
                          {r.items.reduce(
                            (s: number, it: { quantityReceived: number }) => s + it.quantityReceived,
                            0,
                          )}{" "}
                          unit(s) received
                        </span>
                        <span className="ml-auto text-xs text-slate-500">
                          {fmtDateTime(r.receivedAt)}
                        </span>
                      </div>
                      {r.receivedByEmail && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          by {r.receivedByEmail}
                        </div>
                      )}
                      {r.notes && (
                        <div className="text-slate-600 mt-0.5">Notes: {r.notes}</div>
                      )}
                      {Array.isArray(r.items) && r.items.length > 0 && (
                        <div className="mt-1 rounded border bg-slate-50 overflow-hidden">
                          <table className="w-full text-xs">
                            <thead className="bg-slate-100">
                              <tr>
                                <th className="px-2 py-1 text-left font-medium">SKU</th>
                                <th className="px-2 py-1 text-left font-medium">Description</th>
                                <th className="px-2 py-1 text-right font-medium">Qty</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(r.items as { orderItemId: number; sku: string | null; description: string; quantityReceived: number }[]).map((it) => (
                                <tr key={it.orderItemId} className="border-t">
                                  <td className="px-2 py-1 font-mono">{it.sku ?? "—"}</td>
                                  <td className="px-2 py-1 text-slate-700">{it.description}</td>
                                  <td className="px-2 py-1 text-right">{it.quantityReceived}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

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

            {/* Send & edit history (one timeline) */}
            <div className="rounded-md border bg-white">
              <div className="px-4 py-3 border-b font-medium">
                Send &amp; edit history
              </div>
              {activity.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-500">
                  No sends or edits yet.
                </div>
              ) : (
                <ul className="divide-y">
                  {activity.map((entry) =>
                    entry.type === "status" ? (
                      <li
                        key={`c${entry.statusChange.id}`}
                        className="px-4 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Badge variant="outline">
                            {entry.statusChange.note ?? "status change"}
                          </Badge>
                          <span className="ml-auto text-xs text-slate-500">
                            {fmtDateTime(entry.statusChange.changedAt)}
                          </span>
                        </div>
                        {entry.statusChange.changedByEmail && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            by {entry.statusChange.changedByEmail}
                          </div>
                        )}
                      </li>
                    ) : entry.type === "send" ? (
                      <li key={`s${entry.send.id}`} className="px-4 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge
                            variant={entry.send.isResend ? "outline" : "default"}
                          >
                            {!entry.send.isResend
                              ? "sent"
                              : entry.send.correctionNote
                                ? "resent with correction"
                                : "resent"}
                          </Badge>
                          <span className="text-slate-600">
                            {entry.send.sentToEmail ?? "(no email recorded)"}
                          </span>
                          <span className="ml-auto flex items-center gap-2">
                            {entry.send.pdfStorageUrl && (
                              <a
                                href={`/api/storage${entry.send.pdfStorageUrl}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-600 hover:underline"
                              >
                                View PO
                              </a>
                            )}
                            <span className="text-xs text-slate-500">
                              {fmtDateTime(entry.send.sentAt)}
                            </span>
                          </span>
                        </div>
                        {entry.send.sentByEmail && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            by {entry.send.sentByEmail}
                          </div>
                        )}
                        {entry.send.resendNote && (
                          <div className="text-slate-600 mt-0.5">
                            Note: {entry.send.resendNote}
                          </div>
                        )}
                        {entry.send.correctionNote && (
                          <div className="text-slate-600 mt-0.5">
                            PO correction note: {entry.send.correctionNote}
                          </div>
                        )}
                      </li>
                    ) : (
                      <li key={`e${entry.edit.id}`} className="px-4 py-2 text-sm">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">edited</Badge>
                          <span className="ml-auto text-xs text-slate-500">
                            {fmtDateTime(entry.edit.editedAt)}
                          </span>
                        </div>
                        {entry.edit.editedByEmail && (
                          <div className="text-xs text-slate-500 mt-0.5">
                            by {entry.edit.editedByEmail}
                          </div>
                        )}
                        <div className="text-slate-600 mt-0.5">
                          Note: {entry.edit.note}
                        </div>
                      </li>
                    ),
                  )}
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
                    {formatStatusLabel(vo.customerOrderStatus)}
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
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() =>
                  window.open(`/api/admin/vendor-orders/${id}/pdf`, "_blank")
                }
              >
                <Printer className="size-4 mr-2" />
                Print PO
              </Button>
              {(!isTerminal || vo.sentAt) && (
                <div>
                  <Button
                    type="button"
                    className="w-full"
                    disabled={editMode}
                    onClick={() => {
                      setSendFlow("plain");
                      setSendPhase("email");
                      setSendEmail(vo.manufacturerOrderEmail ?? "");
                      setSendNote("");
                      setSendOpen(true);
                    }}
                  >
                    {vo.sentAt ? "Resend (no changes)" : "Send to vendor"}
                  </Button>
                  {vo.sentAt && (
                    <p className="text-xs text-slate-500 mt-1">
                      Vendor didn't receive it? Resend the original PO as-is.
                    </p>
                  )}
                </div>
              )}
              {(isPending || vo.status === "sent") && !editMode && (
                <div>
                  <Button
                    type="button"
                    variant={vo.status === "sent" ? "outline" : "secondary"}
                    className="w-full"
                    onClick={enterEditMode}
                  >
                    <Pencil className="size-4 mr-2" />
                    Edit order
                  </Button>
                  {vo.status === "sent" && (
                    <p className="text-xs text-slate-500 mt-1">
                      Need to correct something? Edit the order and resend an
                      updated PO.
                    </p>
                  )}
                </div>
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
              {canReceive && (
                <Button
                  type="button"
                  variant="default"
                  className="w-full"
                  onClick={openReceiveDialog}
                >
                  {vo.status === "partially_received"
                    ? "Record more received"
                    : "Mark received"}
                </Button>
              )}
              {isPending && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-red-200 text-red-700 hover:bg-red-50"
                  onClick={openCancelPendingDialog}
                >
                  Cancel order
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
        <Dialog
          open={sendOpen}
          onOpenChange={(o) => {
            setSendOpen(o);
            if (!o) {
              setSendFlow("plain");
              setSendPhase("email");
            }
          }}
        >
          <DialogContent>
            {sendFlow === "editResend" ? (
              sendPhase === "email" ? (
                <>
                  <DialogHeader>
                    <DialogTitle>Resend updated PO to vendor</DialogTitle>
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
                        The updated purchase order will be emailed to this
                        address. If left blank, the vendor's configured order
                        email will be used (if set).
                      </p>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setSendOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button onClick={continueToCorrection}>Continue</Button>
                  </DialogFooter>
                </>
              ) : (
                <>
                  <DialogHeader>
                    <DialogTitle>Add a correction note?</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id="correction-enabled"
                        checked={correctionEnabled}
                        onCheckedChange={(v) => setCorrectionEnabled(v === true)}
                        className="mt-0.5"
                      />
                      <div className="space-y-1">
                        <Label
                          htmlFor="correction-enabled"
                          className="text-sm font-medium"
                        >
                          Include a correction note at the top of the PO
                        </Label>
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <p className="text-xs text-slate-500 underline decoration-dotted cursor-help w-fit">
                                What's this?
                              </p>
                            </TooltipTrigger>
                            <TooltipContent>
                              Example: "Updated PO, disregard previously sent
                              PO."
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </div>
                    {correctionEnabled && (
                      <div>
                        <Label htmlFor="correction-note">Correction note</Label>
                        <Textarea
                          id="correction-note"
                          value={correctionNote}
                          onChange={(e) => setCorrectionNote(e.target.value)}
                          placeholder="Updated PO, disregard previously sent PO"
                          rows={3}
                        />
                        <p className="text-xs text-slate-500 mt-1">
                          Printed in bold at the very top of the resent PO.
                        </p>
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setSendPhase("email")}
                    >
                      Back
                    </Button>
                    <Button onClick={submitEditResend} disabled={send.isPending}>
                      Send updated PO
                    </Button>
                  </DialogFooter>
                </>
              )
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle>
                    {vo.sentAt ? "Resend (no changes)" : "Send to vendor"}
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
                      An email with the purchase order details will be sent to
                      this address. If left blank, the vendor's configured
                      order email will be used (if set).
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
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Receive dialog — partial receive, per-item quantities */}
        <Dialog open={confirmReceive} onOpenChange={setConfirmReceive}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record items received</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p className="text-slate-600">
                Enter the quantity received for each item in this shipment.
                Leave a line at 0 if those items weren't in this delivery.
                The order moves to <span className="font-medium">received</span>{" "}
                once all quantities are fulfilled.
              </p>
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">SKU</th>
                      <th className="px-3 py-2 text-left font-medium">Description</th>
                      <th className="px-3 py-2 text-right font-medium">Received / Ordered</th>
                      <th className="px-3 py-2 text-right font-medium w-28">Qty now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vo.items.map((item) => {
                      const remaining = item.quantity - item.receivedQuantity;
                      const qtyStr = receiveItems.get(item.id) ?? "0";
                      const isFullyReceived = remaining <= 0;
                      return (
                        <tr
                          key={item.id}
                          className={`border-t ${isFullyReceived ? "opacity-50" : ""}`}
                        >
                          <td className="px-3 py-2 font-mono text-xs">
                            {item.sku ?? item.variantSkuSnapshot ?? item.productSkuSnapshot ?? "—"}
                          </td>
                          <td className="px-3 py-2 text-slate-700 max-w-[240px]">
                            <div>{item.description}</div>
                            {item.subDescription && (
                              <div className="text-slate-500 text-xs">{item.subDescription}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right text-slate-600">
                            {item.receivedQuantity} / {item.quantity}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {isFullyReceived ? (
                              <span className="text-green-600 font-medium text-xs">Done</span>
                            ) : (
                              <Input
                                type="number"
                                min={0}
                                max={remaining}
                                value={qtyStr}
                                onChange={(e) => {
                                  const next = new Map(receiveItems);
                                  next.set(item.id, e.target.value);
                                  setReceiveItems(next);
                                }}
                                className="w-20 text-right h-7 text-sm ml-auto"
                              />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div>
                <Label htmlFor="receive-notes">Receipt notes (optional)</Label>
                <Textarea
                  id="receive-notes"
                  value={receiveNotes}
                  onChange={(e) => setReceiveNotes(e.target.value)}
                  placeholder="e.g. 2 chairs on back-order, rest delivered"
                  rows={2}
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
                {receive.isPending ? "Saving…" : "Save receipt"}
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
                      <span className="font-medium">cancelled</span>.
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
                      Defaults to the vendor's configured order email. The
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

        {/* Cancel-pending dialog — for pending (unsent) orders only */}
        <Dialog open={confirmCancelPending} onOpenChange={setConfirmCancelPending}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Cancel this vendor order?</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p className="text-slate-600">
                The order is still <span className="font-medium">pending</span> and
                hasn't been sent to the vendor yet. Canceling will un-assign its items
                so they can be regrouped onto a different vendor order. The record will
                be retained with a <span className="font-medium">cancelled</span> status.
              </p>

              {vo && vo.items.length > 1 && (
                <div className="rounded-md border p-3 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cancel-pending-scope"
                      checked={cancelPendingScope === "full"}
                      onChange={() => setCancelPendingScope("full")}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium">Cancel entire order</div>
                      <div className="text-xs text-slate-500">
                        All {vo.items.length} items will be un-assigned and the PO
                        will be marked <span className="font-medium">cancelled</span>.
                      </div>
                    </div>
                  </label>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="cancel-pending-scope"
                      checked={cancelPendingScope === "partial"}
                      onChange={() => setCancelPendingScope("partial")}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-medium">Remove specific items</div>
                      <div className="text-xs text-slate-500">
                        Only the selected items are un-assigned; the rest stay on this PO.
                      </div>
                    </div>
                  </label>
                </div>
              )}

              {vo && cancelPendingScope === "partial" && vo.items.length > 1 && (
                <div className="rounded-md border max-h-48 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 sticky top-0">
                      <tr>
                        <th className="px-2 py-1 w-8"></th>
                        <th className="px-2 py-1 text-left">SKU</th>
                        <th className="px-2 py-1 text-left">Description</th>
                        <th className="px-2 py-1 text-right">Qty</th>
                      </tr>
                    </thead>
                    <tbody>
                      {vo.items.map((it) => {
                        const checked = cancelPendingItemIds.has(it.id);
                        return (
                          <tr
                            key={it.id}
                            className={`border-t cursor-pointer ${checked ? "bg-red-50" : ""}`}
                            onClick={() => toggleCancelPendingItem(it.id)}
                          >
                            <td className="px-2 py-1">
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleCancelPendingItem(it.id)}
                                aria-label={`Cancel item ${it.id}`}
                              />
                            </td>
                            <td className="px-2 py-1 font-mono">
                              {it.sku ?? it.variantSkuSnapshot ?? it.productSkuSnapshot ?? "—"}
                            </td>
                            <td className="px-2 py-1 text-slate-700">{it.description}</td>
                            <td className="px-2 py-1 text-right">{it.quantity}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div>
                <Label htmlFor="cancel-pending-reason">Reason (optional)</Label>
                <Textarea
                  id="cancel-pending-reason"
                  value={cancelPendingReason}
                  onChange={(e) => setCancelPendingReason(e.target.value)}
                  placeholder="e.g. customer cancelled order, wrong vendor"
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setConfirmCancelPending(false)}
              >
                Keep order
              </Button>
              <Button
                variant="destructive"
                onClick={submitCancelPending}
                disabled={cancelPendingMut.isPending}
              >
                {cancelPendingMut.isPending
                  ? "Canceling…"
                  : cancelPendingScope === "full"
                  ? "Cancel order"
                  : "Remove items"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {editMode && (
          <ProductPickerDialog
            open={pickerOpen}
            onOpenChange={setPickerOpen}
            onApply={handlePickerApply}
          />
        )}

        {Number.isFinite(id) ? (
          <div className="mt-6">
            <HistoryPanel entityType="vendor_order" entityId={id} />
          </div>
        ) : null}
      </PageBody>
    </>
  );
}

// ---------------------------------------------------------------------------
// Product picker dialog — mirrors the one in VendorOrderNew.tsx.
// Searches admin products, then asks for variant / grade / finish as needed
// so the server can freeze a meaningful cost snapshot on creation.
// ---------------------------------------------------------------------------
function ProductPickerDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (
    product: AdminProduct,
    variant: CatalogProductVariant | null,
    grade: string | null,
    finishId: number | null,
    gradeLabel: string | null,
  ) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<AdminProduct | null>(null);
  const [variantId, setVariantId] = useState<string>("");
  const [gradeKey, setGradeKey] = useState<string>("");
  const [finishIdStr, setFinishIdStr] = useState<string>("");

  // Debounced search so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset when dialog closes.
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setVariantId("");
      setGradeKey("");
      setFinishIdStr("");
      setSearchInput("");
      setSearch("");
    }
  }, [open]);

  // Reset grade/finish when variant changes.
  useEffect(() => {
    setGradeKey("");
    setFinishIdStr("");
  }, [variantId]);

  const list = useAdminListProducts({
    page: 1,
    pageSize: 20,
    ...(search ? { q: search } : {}),
  });

  const pickedId = picked?.id ?? 0;
  const detail = useAdminGetProductPicker(pickedId, {
    query: {
      queryKey: getAdminGetProductPickerQueryKey(pickedId),
      enabled: !!picked,
      staleTime: 0,
    },
  });
  const variants = detail.data?.variants ?? [];
  const finishes: AdminProductPickerDetail["finishes"] =
    detail.data?.finishes ?? [];
  const selectedVariant =
    variants.find((x) => String(x.id) === variantId) ?? null;

  const needsVariant = variants.length > 0;
  const needsFinish = finishes.length > 0;
  const needsGrade =
    !needsFinish && (selectedVariant?.gradePrices.length ?? 0) > 0;

  const detailReady = !!picked && !detail.isLoading && !!detail.data;
  const canAdd =
    detailReady &&
    (!needsVariant || !!variantId) &&
    (!needsFinish || !!finishIdStr) &&
    (!needsGrade || !!gradeKey);

  function handleAdd() {
    if (!picked || !detailReady) return;
    if (needsVariant && !variantId) return;
    if (needsFinish && !finishIdStr) return;
    if (needsGrade && !gradeKey) return;

    const v = needsVariant ? selectedVariant : null;
    const resolvedGrade = needsGrade && gradeKey ? gradeKey : null;
    const resolvedFinishId =
      needsFinish && finishIdStr ? Number(finishIdStr) : null;

    let resolvedLabel: string | null = null;
    if (needsGrade && gradeKey) {
      resolvedLabel = `Grade ${gradeKey}`;
    } else if (needsFinish && finishIdStr) {
      const f = finishes.find((x) => String(x.id) === finishIdStr);
      resolvedLabel = f ? f.name : null;
    }

    onApply(picked, v, resolvedGrade, resolvedFinishId, resolvedLabel);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pick a product</DialogTitle>
        </DialogHeader>

        {!picked ? (
          <>
            <div className="relative">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                autoFocus
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, SKU, or slug…"
                className="pl-8"
              />
            </div>
            <div className="border rounded max-h-96 overflow-y-auto">
              {list.isLoading ? (
                <div className="p-6 flex justify-center">
                  <Spinner />
                </div>
              ) : (list.data?.products ?? []).length === 0 ? (
                <div className="p-6 text-sm text-slate-500 text-center">
                  No products match.
                </div>
              ) : (
                (list.data?.products ?? []).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 border-t first:border-t-0"
                    onClick={() => setPicked(p)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium text-sm">{p.name}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {p.sku}
                        </div>
                      </div>
                      <div className="text-sm tabular-nums text-slate-600">
                        cost{" "}
                        {p.cost != null && p.cost !== ""
                          ? fmtMoney(Number(p.cost))
                          : "—"}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="rounded border bg-slate-50 p-3 flex justify-between items-start">
              <div>
                <div className="font-medium">{picked.name}</div>
                <div className="text-xs text-slate-500 font-mono">
                  {picked.sku}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Cost resolved on save
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPicked(null);
                  setVariantId("");
                  setGradeKey("");
                  setFinishIdStr("");
                }}
              >
                Change product
              </Button>
            </div>

            {detail.isLoading && (
              <div className="flex justify-center py-3">
                <Spinner />
              </div>
            )}

            {needsVariant && (
              <div>
                <Label className="text-xs">
                  {variants[0]?.optionLabel || "Variant"}{" "}
                  <span className="text-red-600">*</span>
                </Label>
                <Select value={variantId} onValueChange={setVariantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a variant" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!needsVariant && !detail.isLoading && (
              <div className="text-xs text-slate-500">
                No variants required for this product.
              </div>
            )}

            {needsGrade && (
              <div>
                <Label className="text-xs">
                  Grade <span className="text-red-600">*</span>
                </Label>
                <Select value={gradeKey} onValueChange={setGradeKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedVariant?.gradePrices ?? []).map((gp) => (
                      <SelectItem key={gp.grade} value={gp.grade}>
                        Grade {gp.grade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsFinish && (
              <div>
                <Label className="text-xs">
                  Finish / Tile <span className="text-red-600">*</span>
                </Label>
                <Select value={finishIdStr} onValueChange={setFinishIdStr}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a finish" />
                  </SelectTrigger>
                  <SelectContent>
                    {finishes.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {picked && (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={!canAdd} onClick={handleAdd}>
              Add to PO
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
