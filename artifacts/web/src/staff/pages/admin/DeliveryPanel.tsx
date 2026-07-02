import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useAdminListCarriers,
  useAdminUpdateOrderShippingMethod,
  useAdminUpdateOrderScheduledDelivery,
  useAdminCreateOrderShipment,
  useAdminUpdateOrderShipment,
  useAdminDeleteOrderShipment,
  getAdminGetOrderQueryKey,
  type AdminOrderShipment,
  type AdminOrderItem,
  type Carrier,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const NO_CARRIER = "";

function itemLabel(it: AdminOrderItem): string {
  const extras = [
    it.variantNameSnapshot,
    it.finishNameSnapshot,
    it.finialNameSnapshot,
    it.fabricNameSnapshot,
  ].filter((x): x is string => !!x && x.trim().length > 0);
  return extras.length > 0
    ? `${it.description} — ${extras.join(", ")}`
    : it.description;
}

type FormState = {
  carrierId: string;
  trackingNumber: string;
  notes: string;
  quantities: Record<number, string>;
};

export default function DeliveryPanel({
  orderId,
  shippingMethod,
  scheduledDeliveryDate,
  scheduledDeliveryTime,
  items,
  shipments,
}: {
  orderId: number;
  shippingMethod: string | null;
  scheduledDeliveryDate: string | null;
  scheduledDeliveryTime: string | null;
  items: AdminOrderItem[];
  shipments: AdminOrderShipment[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const carriersQuery = useAdminListCarriers();
  const carriers: Carrier[] = carriersQuery.data ?? [];
  const activeCarriers = carriers.filter((c) => c.isActive);

  const updateMethod = useAdminUpdateOrderShippingMethod();
  const updateScheduled = useAdminUpdateOrderScheduledDelivery();
  const createShipment = useAdminCreateOrderShipment();
  const updateShipment = useAdminUpdateOrderShipment();
  const deleteShipment = useAdminDeleteOrderShipment();

  const [methodDraft, setMethodDraft] = useState<string>(shippingMethod ?? "");
  useEffect(() => {
    setMethodDraft(shippingMethod ?? "");
  }, [shippingMethod]);

  const [dateDraft, setDateDraft] = useState<string>(
    scheduledDeliveryDate ?? "",
  );
  const [timeDraft, setTimeDraft] = useState<string>(
    scheduledDeliveryTime ?? "",
  );
  useEffect(() => {
    setDateDraft(scheduledDeliveryDate ?? "");
    setTimeDraft(scheduledDeliveryTime ?? "");
  }, [scheduledDeliveryDate, scheduledDeliveryTime]);

  const [editing, setEditing] = useState<
    | { mode: "create" }
    | { mode: "edit"; shipment: AdminOrderShipment }
    | null
  >(null);
  const [form, setForm] = useState<FormState>({
    carrierId: NO_CARRIER,
    trackingNumber: "",
    notes: "",
    quantities: {},
  });
  const [confirmDelete, setConfirmDelete] = useState<AdminOrderShipment | null>(
    null,
  );

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: getAdminGetOrderQueryKey(orderId),
    });
  }

  // Quantity of an order line already committed to shipments, optionally
  // excluding the shipment currently being edited.
  function assignedFor(orderItemId: number, excludeShipmentId?: number): number {
    let sum = 0;
    for (const s of shipments) {
      if (excludeShipmentId != null && s.id === excludeShipmentId) continue;
      for (const it of s.items) {
        if (it.orderItemId === orderItemId) sum += it.quantity;
      }
    }
    return sum;
  }

  function remainingFor(it: AdminOrderItem, excludeShipmentId?: number): number {
    return Math.max(0, it.quantity - assignedFor(it.id, excludeShipmentId));
  }

  function openCreate() {
    const quantities: Record<number, string> = {};
    for (const it of items) {
      quantities[it.id] = String(remainingFor(it));
    }
    setForm({
      carrierId: NO_CARRIER,
      trackingNumber: "",
      notes: "",
      quantities,
    });
    setEditing({ mode: "create" });
  }

  function openEdit(s: AdminOrderShipment) {
    const currentById = new Map(s.items.map((i) => [i.orderItemId, i.quantity]));
    const quantities: Record<number, string> = {};
    for (const it of items) {
      quantities[it.id] = String(currentById.get(it.id) ?? 0);
    }
    setForm({
      carrierId: s.carrierId == null ? NO_CARRIER : String(s.carrierId),
      trackingNumber: s.trackingNumber ?? "",
      notes: s.notes ?? "",
      quantities,
    });
    setEditing({ mode: "edit", shipment: s });
  }

  const excludeId = editing?.mode === "edit" ? editing.shipment.id : undefined;

  function handleMethodSave() {
    const trimmed = methodDraft.trim();
    if ((shippingMethod ?? "") === trimmed) return;
    updateMethod.mutate(
      { id: orderId, data: { shippingMethod: trimmed || null } },
      {
        onSuccess: () => {
          toast({ title: "Delivery method updated" });
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

  function handleScheduledSave() {
    updateScheduled.mutate(
      {
        id: orderId,
        data: {
          scheduledDeliveryDate: dateDraft.trim() || null,
          scheduledDeliveryTime: timeDraft.trim() || null,
        },
      },
      {
        onSuccess: () => {
          toast({ title: "Scheduled delivery updated" });
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

  const scheduledDirty =
    dateDraft.trim() !== (scheduledDeliveryDate ?? "") ||
    timeDraft.trim() !== (scheduledDeliveryTime ?? "");

  function buildItemsPayload() {
    return items
      .map((it) => ({
        orderItemId: it.id,
        quantity: Number(form.quantities[it.id] ?? "0"),
      }))
      .filter((i) => Number.isFinite(i.quantity) && i.quantity > 0);
  }

  function handleSave() {
    if (!editing) return;
    if (form.carrierId === NO_CARRIER) {
      toast({
        title: "Carrier required",
        description: "Select a carrier for this shipment.",
        variant: "destructive",
      });
      return;
    }
    if (!form.trackingNumber.trim()) {
      toast({
        title: "Tracking number required",
        description: "Enter a tracking number for this shipment.",
        variant: "destructive",
      });
      return;
    }
    const itemsPayload = buildItemsPayload();
    if (itemsPayload.length === 0) {
      toast({
        title: "No items assigned",
        description: "Assign at least one item to this shipment.",
        variant: "destructive",
      });
      return;
    }
    for (const it of items) {
      const qty = Number(form.quantities[it.id] ?? "0");
      const max = remainingFor(it, excludeId);
      if (qty > max) {
        toast({
          title: "Quantity too high",
          description: `"${itemLabel(it)}" has only ${max} left unassigned.`,
          variant: "destructive",
        });
        return;
      }
    }
    const payload = {
      carrierId: Number(form.carrierId),
      trackingNumber: form.trackingNumber.trim(),
      notes: form.notes.trim() || null,
      items: itemsPayload,
    };
    if (editing.mode === "create") {
      createShipment.mutate(
        { id: orderId, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Shipment added" });
            setEditing(null);
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
    } else {
      updateShipment.mutate(
        { id: orderId, shipmentId: editing.shipment.id, data: payload },
        {
          onSuccess: () => {
            toast({ title: "Shipment updated" });
            setEditing(null);
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
  }

  function handleDelete() {
    if (!confirmDelete) return;
    deleteShipment.mutate(
      { id: orderId, shipmentId: confirmDelete.id },
      {
        onSuccess: () => {
          toast({ title: "Shipment removed" });
          setConfirmDelete(null);
          invalidate();
        },
        onError: (e: unknown) => {
          toast({
            title: "Delete failed",
            description: e instanceof Error ? e.message : "Unknown error",
            variant: "destructive",
          });
        },
      },
    );
  }

  const isSaving = createShipment.isPending || updateShipment.isPending;

  const fullyAssigned = useMemo(
    () => items.every((it) => remainingFor(it) === 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, shipments],
  );

  return (
    <div className="rounded-md border bg-white p-4 space-y-4">
      <div>
        <div className="text-xs font-medium text-slate-500 uppercase mb-2">
          Delivery method
        </div>
        <div className="flex gap-2">
          <Input
            value={methodDraft}
            onChange={(e) => setMethodDraft(e.target.value)}
            placeholder="e.g. Local Delivery, UPS Ground, Will Call"
            list={`delivery-method-options-${orderId}`}
          />
          <datalist id={`delivery-method-options-${orderId}`}>
            <option value="Local Delivery" />
            <option value="Will Call" />
            <option value="In-Store Pickup" />
            {activeCarriers.map((c) => (
              <option key={c.id} value={c.name} />
            ))}
          </datalist>
          <Button
            type="button"
            variant="secondary"
            onClick={handleMethodSave}
            disabled={
              updateMethod.isPending ||
              methodDraft.trim() === (shippingMethod ?? "")
            }
          >
            Save
          </Button>
        </div>
      </div>

      <div>
        <div className="text-xs font-medium text-slate-500 uppercase mb-2">
          Scheduled store delivery
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <Label htmlFor={`sched-date-${orderId}`} className="text-xs">
              Date
            </Label>
            <Input
              id={`sched-date-${orderId}`}
              type="date"
              value={dateDraft}
              onChange={(e) => setDateDraft(e.target.value)}
              className="w-40"
            />
          </div>
          <div>
            <Label htmlFor={`sched-time-${orderId}`} className="text-xs">
              Time window
            </Label>
            <Input
              id={`sched-time-${orderId}`}
              value={timeDraft}
              onChange={(e) => setTimeDraft(e.target.value)}
              placeholder="e.g. 2–4 PM"
              className="w-40"
            />
          </div>
          <Button
            type="button"
            variant="secondary"
            onClick={handleScheduledSave}
            disabled={updateScheduled.isPending || !scheduledDirty}
          >
            Save
          </Button>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-slate-500 uppercase">
            Shipments &amp; tracking
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={openCreate}
            disabled={items.length === 0 || fullyAssigned}
          >
            <Plus className="h-3.5 w-3.5 mr-1" /> Add
          </Button>
        </div>
        {shipments.length === 0 ? (
          <div className="text-sm text-slate-500">
            No shipments yet. Add one when the order ships, even for local
            delivery, to track timing.
          </div>
        ) : (
          <ul className="space-y-2 text-sm">
            {shipments.map((s) => (
              <li key={s.id} className="rounded border p-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium">
                      {s.carrierName ?? "Unspecified carrier"}
                    </div>
                    {s.trackingNumber && (
                      <div className="text-slate-700 break-all">
                        {s.trackingUrl ? (
                          <a
                            href={s.trackingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-700 hover:underline inline-flex items-center gap-1"
                          >
                            {s.trackingNumber}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : (
                          s.trackingNumber
                        )}
                      </div>
                    )}
                    {s.items.length > 0 && (
                      <ul className="text-slate-600 text-xs mt-1 list-disc pl-4 space-y-0.5">
                        {s.items.map((it) => (
                          <li key={it.orderItemId}>
                            {it.quantity} × {it.description}
                          </li>
                        ))}
                      </ul>
                    )}
                    {s.notes && (
                      <div className="text-slate-500 text-xs mt-1">
                        {s.notes}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => openEdit(s)}
                      aria-label="Edit shipment"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() => setConfirmDelete(s)}
                      aria-label="Delete shipment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing?.mode === "edit" ? "Edit shipment" : "Add shipment"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label htmlFor="ship-carrier">Carrier</Label>
              <Select
                value={form.carrierId}
                onValueChange={(v) => setForm((f) => ({ ...f, carrierId: v }))}
              >
                <SelectTrigger id="ship-carrier">
                  <SelectValue placeholder="Select a carrier" />
                </SelectTrigger>
                <SelectContent>
                  {activeCarriers.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeCarriers.length === 0 && !carriersQuery.isLoading && (
                <div className="text-xs text-slate-500 mt-1">
                  No active carriers. Add carriers under Admin → Carriers.
                </div>
              )}
            </div>
            <div>
              <Label htmlFor="ship-tracking">Tracking number</Label>
              <Input
                id="ship-tracking"
                value={form.trackingNumber}
                onChange={(e) =>
                  setForm((f) => ({ ...f, trackingNumber: e.target.value }))
                }
                placeholder="Required"
              />
            </div>
            <div>
              <div className="text-xs font-medium text-slate-500 uppercase mb-1">
                Items in this shipment
              </div>
              <div className="space-y-2 rounded border p-2 max-h-64 overflow-y-auto">
                {items.map((it) => {
                  const max = remainingFor(it, excludeId);
                  const assignedElsewhere = it.quantity - max;
                  return (
                    <div
                      key={it.id}
                      className="flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 text-sm">
                        <div className="truncate">{itemLabel(it)}</div>
                        <div className="text-xs text-slate-500">
                          Ordered {it.quantity}
                          {assignedElsewhere > 0 && (
                            <> · {assignedElsewhere} on other shipments</>
                          )}{" "}
                          · {max} available
                        </div>
                      </div>
                      <Input
                        type="number"
                        min={0}
                        max={max}
                        value={form.quantities[it.id] ?? "0"}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            quantities: {
                              ...f.quantities,
                              [it.id]: e.target.value,
                            },
                          }))
                        }
                        className="w-20 shrink-0"
                      />
                    </div>
                  );
                })}
                {items.length === 0 && (
                  <div className="text-sm text-slate-500">
                    This order has no line items.
                  </div>
                )}
              </div>
            </div>
            <div>
              <Label htmlFor="ship-notes">Notes</Label>
              <Textarea
                id="ship-notes"
                rows={2}
                value={form.notes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, notes: e.target.value }))
                }
                placeholder="Optional internal notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleSave} disabled={isSaving}>
              {editing?.mode === "edit" ? "Save changes" : "Add shipment"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmDelete !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete shipment?</DialogTitle>
          </DialogHeader>
          <div className="text-sm text-slate-600">
            This will remove the tracking entry. This action cannot be undone.
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setConfirmDelete(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDelete}
              disabled={deleteShipment.isPending}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
