import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Pencil, Plus, X } from "lucide-react";
import {
  useAdminGetOrder,
  useAdminUpdateOrderStatus,
  useAdminUpdateOrderNotes,
  useAdminEditOrderItems,
  getAdminGetOrderQueryKey,
  getAdminListOrdersQueryKey,
  type AdminOrderDetail,
  type AdminOrderAddress,
  type CatalogProductVariant,
  type CatalogFabricOption,
  type CatalogFinishOption,
  type CatalogFinialOption,
  type CatalogStemOption,
  type CatalogCoverPicker,
  type CatalogCoverFinish,
  type AdminProduct,
} from "@workspace/api-client-react";
import { ProductPickerDialog } from "./NewOrder";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";

interface KeptItem {
  id: number;
  description: string;
  quantity: number;
  unitPrice: number;
  sku: string | null;
  fabricName: string | null;
  manufacturerName: string | null;
}

interface DraftNewItem {
  productId: number | null;
  variantId: number | null;
  finishId: number | null;
  finialId: number | null;
  grade: string | null;
  fabricId: number | null;
  fabricVendorId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  parentLocalIdx: number | null;
  sku: string | null;
  fabricName: string | null;
  manufacturerName: string | null;
}

const ORDER_STATUSES = [
  "new_online_order",
  "pending", "confirmed", "in_production", "ready_for_store_delivery",
  "carrier_delivery_update", "out_for_local_delivery", "delivered", "completed",
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
  const [confirmBackward, setConfirmBackward] = useState(false);

  // Edit-items mode (staff-created orders only)
  const [editingItems, setEditingItems] = useState(false);
  const [keptItems, setKeptItems] = useState<KeptItem[]>([]);
  const [newDraftItems, setNewDraftItems] = useState<DraftNewItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const newDraftItemsRef = useRef<DraftNewItem[]>([]);
  newDraftItemsRef.current = newDraftItems;
  const editItems = useAdminEditOrderItems();

  useEffect(() => {
    if (order) {
      setNotesDraft(order.notes ?? "");
      setPendingStatus(order.status === "new_online_order" ? "pending" : order.status);
    }
  }, [order]);

  const updateStatus = useAdminUpdateOrderStatus();
  const updateNotes = useAdminUpdateOrderNotes();

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getAdminGetOrderQueryKey(orderId) });
    queryClient.invalidateQueries({ queryKey: getAdminListOrdersQueryKey() });
  }

  function enterEditMode() {
    if (!order) return;
    setKeptItems(
      order.items.map((it) => ({
        id: it.id,
        description: it.description ?? it.variantNameSnapshot ?? "",
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        sku: it.variantSkuSnapshot ?? it.productSkuSnapshot ?? null,
        fabricName: it.fabricNameSnapshot ?? null,
        manufacturerName: it.manufacturerName ?? null,
      })),
    );
    setNewDraftItems([]);
    setEditingItems(true);
  }

  function exitEditMode() {
    setEditingItems(false);
    setKeptItems([]);
    setNewDraftItems([]);
    setPickerOpen(false);
  }

  function handlePickerApply(
    p: AdminProduct,
    variant: CatalogProductVariant | null,
    fabric: CatalogFabricOption | null,
    finish: CatalogFinishOption | null,
    finial: CatalogFinialOption | null,
    gradeUnitPrice: number | null,
    unitPrice: number,
    stem: CatalogStemOption | null,
    cover: { picker: CatalogCoverPicker; finish: CatalogCoverFinish } | null,
  ) {
    const isGradeMode = gradeUnitPrice != null;
    const desc = [
      p.name,
      variant ? variant.name : null,
      finish ? finish.name : null,
      finial ? finial.name : null,
      fabric ? `${fabric.name} (${fabric.itemNumber})` : null,
    ]
      .filter(Boolean)
      .join(" — ");
    const minQty =
      isGradeMode && variant?.minOrderQty != null ? variant.minOrderQty : 1;

    const current = newDraftItemsRef.current;
    const baseIdx = current.length;
    const batch: DraftNewItem[] = [];

    batch.push({
      productId: p.id,
      variantId: variant?.id ?? null,
      finishId: finish?.id ?? null,
      finialId: finial?.id ?? null,
      grade: isGradeMode ? (fabric?.grade ?? null) : null,
      fabricId: fabric?.id ?? null,
      fabricVendorId: null,
      description: desc,
      quantity: minQty,
      unitPrice,
      parentLocalIdx: null,
      sku: variant?.sku ?? p.sku ?? null,
      fabricName: fabric?.name ?? null,
      manufacturerName: p.manufacturerName ?? null,
    });

    if (stem) {
      batch.push({
        productId: stem.stemProductId,
        variantId: null,
        finishId: null,
        finialId: null,
        grade: null,
        fabricId: null,
        fabricVendorId: null,
        description: stem.name,
        quantity: minQty,
        unitPrice: Number(stem.unitPrice) || 0,
        parentLocalIdx: null,
        sku: stem.sku ?? null,
        fabricName: null,
        manufacturerName: null,
      });
    }

    if (cover) {
      batch.push({
        productId: cover.picker.coverProductId,
        variantId: null,
        finishId: cover.finish.finishId ?? null,
        finialId: null,
        grade: null,
        fabricId: null,
        fabricVendorId: null,
        description: `${cover.picker.label} — ${cover.finish.finishName}`,
        quantity: minQty,
        unitPrice: Number(cover.finish.unitPrice) || 0,
        parentLocalIdx: baseIdx,
        sku: cover.picker.sku ?? null,
        fabricName: null,
        manufacturerName: null,
      });
    }

    setNewDraftItems((prev) => [...prev, ...batch]);
    setPickerOpen(false);
  }

  function handleSaveItems() {
    if (!order) return;
    const total = keptItems.length + newDraftItems.length;
    if (total === 0) {
      toast({
        title: "Cannot save",
        description: "An order must have at least one item.",
        variant: "destructive",
      });
      return;
    }
    editItems.mutate(
      {
        id: orderId,
        data: {
          keepItems: keptItems.map((it) => ({
            id: it.id,
            quantity: it.quantity,
          })),
          newItems: newDraftItems.map((it) => ({
            ...(it.productId != null ? { productId: it.productId } : {}),
            ...(it.variantId != null ? { variantId: it.variantId } : {}),
            ...(it.finishId != null ? { finishId: it.finishId } : {}),
            ...(it.finialId != null ? { finialId: it.finialId } : {}),
            ...(it.grade != null ? { grade: it.grade } : {}),
            ...(it.fabricId != null ? { fabricId: it.fabricId } : {}),
            description: it.description,
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discountAmount: 0,
            ...(it.parentLocalIdx != null
              ? { parentItemIndex: it.parentLocalIdx }
              : {}),
          })),
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Items updated" });
          exitEditMode();
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

  function performStatusUpdate() {
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

  function handleStatusUpdate() {
    if (!order || pendingStatus === order.status) return;
    const fromIdx = ORDER_STATUSES.indexOf(order.status as (typeof ORDER_STATUSES)[number]);
    const toIdx = ORDER_STATUSES.indexOf(pendingStatus as (typeof ORDER_STATUSES)[number]);
    if (fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx) {
      setConfirmBackward(true);
      return;
    }
    performStatusUpdate();
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
                      {ORDER_STATUSES.filter((s) => s !== "new_online_order").map((s) => (
                        <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-[2] min-w-[240px]">
                  <Label htmlFor="status-note">Note to Customer (optional)</Label>
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

            <div className="rounded-md border bg-white overflow-x-auto">
              <div className="px-4 py-3 border-b font-medium flex items-center justify-between">
                <span>Items</span>
                {order.orderType !== "online" && !editingItems && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={enterEditMode}
                  >
                    <Pencil className="size-3.5 mr-1.5" />
                    Edit Items
                  </Button>
                )}
              </div>

              {editingItems ? (
                <div>
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="px-3 py-2 font-medium">Description</th>
                        <th className="px-3 py-2 font-medium">Manufacturer</th>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium text-right w-24">Qty</th>
                        <th className="px-3 py-2 font-medium text-right">Unit</th>
                        <th className="px-3 py-2 font-medium text-right">Amount</th>
                        <th className="px-3 py-2 w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {keptItems.map((it, idx) => (
                        <tr key={it.id} className="border-t">
                          <td className="px-3 py-2">
                            <div>{it.description || "—"}</div>
                            {it.fabricName && (
                              <div className="text-xs text-slate-500">Fabric: {it.fabricName}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{it.manufacturerName ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-500">{it.sku ?? "—"}</td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min={1}
                              className="w-20 text-right ml-auto"
                              value={it.quantity}
                              onChange={(e) => {
                                const q = Math.max(1, Number(e.target.value) || 1);
                                setKeptItems((prev) =>
                                  prev.map((k, i) => i === idx ? { ...k, quantity: q } : k),
                                );
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">{fmtMoney(it.unitPrice)}</td>
                          <td className="px-3 py-2 text-right">{fmtMoney(it.quantity * it.unitPrice)}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="text-slate-400 hover:text-red-600 transition-colors"
                              aria-label="Remove item"
                              onClick={() => setKeptItems((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              <X className="size-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {newDraftItems.map((it, idx) => (
                        <tr key={`new-${idx}`} className="border-t bg-emerald-50/40">
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 font-semibold">NEW</span>
                              <span>{it.description || "—"}</span>
                            </div>
                            {it.fabricName && (
                              <div className="text-xs text-slate-500">Fabric: {it.fabricName}</div>
                            )}
                          </td>
                          <td className="px-3 py-2 text-slate-600">{it.manufacturerName ?? "—"}</td>
                          <td className="px-3 py-2 text-slate-500">{it.sku ?? "—"}</td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min={1}
                              className="w-20 text-right ml-auto"
                              value={it.quantity}
                              onChange={(e) => {
                                const q = Math.max(1, Number(e.target.value) || 1);
                                setNewDraftItems((prev) =>
                                  prev.map((k, i) => i === idx ? { ...k, quantity: q } : k),
                                );
                              }}
                            />
                          </td>
                          <td className="px-3 py-2 text-right">{fmtMoney(it.unitPrice)}</td>
                          <td className="px-3 py-2 text-right">{fmtMoney(it.quantity * it.unitPrice)}</td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="text-slate-400 hover:text-red-600 transition-colors"
                              aria-label="Remove item"
                              onClick={() => setNewDraftItems((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              <X className="size-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-slate-50 text-sm">
                      <tr className="border-t">
                        <td className="px-3 py-2 text-right text-slate-500" colSpan={6}>
                          New subtotal (est.):{" "}
                          <span className="font-medium text-slate-900">
                            {fmtMoney(
                              [...keptItems.map((k) => k.quantity * k.unitPrice),
                                ...newDraftItems.map((n) => n.quantity * n.unitPrice)]
                                .reduce((s, v) => s + v, 0),
                            )}
                          </span>
                          {" "}items
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                  <div className="border-t px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setPickerOpen(true)}
                    >
                      <Plus className="size-3.5 mr-1.5" />
                      Add Item
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={exitEditMode}
                        disabled={editItems.isPending}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={handleSaveItems}
                        disabled={
                          editItems.isPending ||
                          (keptItems.length === 0 && newDraftItems.length === 0)
                        }
                      >
                        {editItems.isPending ? "Saving…" : "Save Changes"}
                      </Button>
                    </div>
                  </div>
                  <ProductPickerDialog
                    open={pickerOpen}
                    onOpenChange={setPickerOpen}
                    onApply={handlePickerApply}
                  />
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-3 py-2 font-medium">Description</th>
                      <th className="px-3 py-2 font-medium">Manufacturer</th>
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
                        <td className="px-3 py-2 text-slate-600 text-sm">{it.manufacturerName ?? "—"}</td>
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
                    <tr className="border-t"><td className="px-3 py-2 text-right" colSpan={5}>Subtotal</td><td className="px-3 py-2 text-right">{fmtMoney(order.subtotal)}</td></tr>
                    <tr><td className="px-3 py-2 text-right" colSpan={5}>Tax</td><td className="px-3 py-2 text-right">{fmtMoney(order.taxAmount)}</td></tr>
                    <tr><td className="px-3 py-2 text-right" colSpan={5}>Delivery</td><td className="px-3 py-2 text-right">{fmtMoney(order.deliveryAmount)}</td></tr>
                    <tr className="font-medium"><td className="px-3 py-2 text-right" colSpan={5}>Total</td><td className="px-3 py-2 text-right">{fmtMoney(order.total)}</td></tr>
                    <tr><td className="px-3 py-2 text-right" colSpan={5}>Deposit</td><td className="px-3 py-2 text-right">{fmtMoney(order.depositAmount)}</td></tr>
                    <tr className="font-medium"><td className="px-3 py-2 text-right" colSpan={5}>Balance due</td><td className="px-3 py-2 text-right">{fmtMoney(order.balanceDue)}</td></tr>
                  </tfoot>
                </table>
              )}
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
                      <div className="text-slate-500">{order.customerEmail ?? ""}</div>
                    </>
                  ) : order.isQuickOrder ? (
                    <>
                      <div>{order.walkInName ?? "Walk-in customer"}</div>
                      {order.walkInEmail && <div className="text-slate-500">{order.walkInEmail}</div>}
                      {order.walkInPhone && <div className="text-slate-500">{order.walkInPhone}</div>}
                    </>
                  ) : (
                    <div>—</div>
                  )}
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

        <Dialog
          open={confirmBackward}
          onOpenChange={(open) => {
            setConfirmBackward(open);
            if (!open && order) setPendingStatus(order.status);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Move status backward?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p>
                This order is currently{" "}
                <span className="font-medium">{order.status.replace(/_/g, " ")}</span>.
                Moving it back to{" "}
                <span className="font-medium">{pendingStatus.replace(/_/g, " ")}</span>{" "}
                may not be valid for this order. Are you sure you want to continue?
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setConfirmBackward(false);
                  setPendingStatus(order.status);
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  setConfirmBackward(false);
                  performStatusUpdate();
                }}
              >
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </PageBody>
    </>
  );
}
