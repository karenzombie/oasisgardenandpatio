import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import {
  useAdminListCarriers,
  useAdminUpdateOrderShippingMethod,
  useAdminCreateOrderShipment,
  useAdminUpdateOrderShipment,
  useAdminDeleteOrderShipment,
  getAdminGetOrderQueryKey,
  type AdminOrderShipment,
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

const NO_CARRIER = "__none__";

function fmtDateTime(s: string | null): string {
  if (!s) return "—";
  return new Date(s).toLocaleString();
}

function toLocalInputValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInputValue(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type FormState = {
  carrierId: string;
  trackingNumber: string;
  shippedAt: string;
  deliveredAt: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  carrierId: NO_CARRIER,
  trackingNumber: "",
  shippedAt: "",
  deliveredAt: "",
  notes: "",
};

function shipmentToForm(s: AdminOrderShipment): FormState {
  return {
    carrierId: s.carrierId == null ? NO_CARRIER : String(s.carrierId),
    trackingNumber: s.trackingNumber ?? "",
    shippedAt: toLocalInputValue(s.shippedAt),
    deliveredAt: toLocalInputValue(s.deliveredAt),
    notes: s.notes ?? "",
  };
}

export default function DeliveryPanel({
  orderId,
  shippingMethod,
  shipments,
}: {
  orderId: number;
  shippingMethod: string | null;
  shipments: AdminOrderShipment[];
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const carriersQuery = useAdminListCarriers();
  const carriers: Carrier[] = carriersQuery.data ?? [];
  const activeCarriers = carriers.filter((c) => c.isActive);

  const updateMethod = useAdminUpdateOrderShippingMethod();
  const createShipment = useAdminCreateOrderShipment();
  const updateShipment = useAdminUpdateOrderShipment();
  const deleteShipment = useAdminDeleteOrderShipment();

  const [methodDraft, setMethodDraft] = useState<string>(shippingMethod ?? "");
  useEffect(() => {
    setMethodDraft(shippingMethod ?? "");
  }, [shippingMethod]);

  const [editing, setEditing] = useState<
    | { mode: "create" }
    | { mode: "edit"; shipment: AdminOrderShipment }
    | null
  >(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState<AdminOrderShipment | null>(
    null,
  );

  function invalidate() {
    queryClient.invalidateQueries({
      queryKey: getAdminGetOrderQueryKey(orderId),
    });
  }

  function openCreate() {
    setForm(EMPTY_FORM);
    setEditing({ mode: "create" });
  }

  function openEdit(s: AdminOrderShipment) {
    setForm(shipmentToForm(s));
    setEditing({ mode: "edit", shipment: s });
  }

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

  function buildPayload() {
    const carrierId =
      form.carrierId === NO_CARRIER ? null : Number(form.carrierId);
    return {
      carrierId,
      trackingNumber: form.trackingNumber.trim() || null,
      shippedAt: fromLocalInputValue(form.shippedAt),
      deliveredAt: fromLocalInputValue(form.deliveredAt),
      notes: form.notes.trim() || null,
    };
  }

  function handleSave() {
    if (!editing) return;
    const payload = buildPayload();
    if (payload.trackingNumber && payload.carrierId == null) {
      toast({
        title: "Carrier required",
        description: "Select a carrier when entering a tracking number.",
        variant: "destructive",
      });
      return;
    }
    if (
      payload.shippedAt &&
      payload.deliveredAt &&
      new Date(payload.deliveredAt).getTime() <
        new Date(payload.shippedAt).getTime()
    ) {
      toast({
        title: "Invalid dates",
        description: "Delivered date cannot be before shipped date.",
        variant: "destructive",
      });
      return;
    }
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
        {
          id: orderId,
          shipmentId: editing.shipment.id,
          data: payload,
        },
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
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-medium text-slate-500 uppercase">
            Shipments &amp; tracking
          </div>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={openCreate}
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
                    <div className="text-slate-500 text-xs mt-1 space-y-0.5">
                      <div>Shipped: {fmtDateTime(s.shippedAt)}</div>
                      <div>Delivered: {fmtDateTime(s.deliveredAt)}</div>
                      {s.notes && (
                        <div className="text-slate-600">{s.notes}</div>
                      )}
                    </div>
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
        <DialogContent>
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
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, carrierId: v }))
                }
              >
                <SelectTrigger id="ship-carrier">
                  <SelectValue placeholder="Select a carrier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_CARRIER}>
                    No carrier (other / manual)
                  </SelectItem>
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
                placeholder="Optional"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="ship-shipped">Shipped at</Label>
                <Input
                  id="ship-shipped"
                  type="datetime-local"
                  value={form.shippedAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, shippedAt: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="ship-delivered">Delivered at</Label>
                <Input
                  id="ship-delivered"
                  type="datetime-local"
                  value={form.deliveredAt}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, deliveredAt: e.target.value }))
                  }
                />
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
