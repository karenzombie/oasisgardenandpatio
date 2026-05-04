import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Eye } from "lucide-react";
import {
  useAdminListDiscountEvents,
  useAdminCreateDiscountEvent,
  useAdminUpdateDiscountEvent,
  useAdminDeleteDiscountEvent,
  useAdminListCouponCodes,
  useAdminCreateCouponCode,
  useAdminUpdateCouponCode,
  useAdminDeleteCouponCode,
  useAdminListCouponCodeUses,
  getAdminListDiscountEventsQueryKey,
  getAdminListCouponCodesQueryKey,
  getAdminListCouponCodeUsesQueryKey,
  type AdminDiscountEvent,
  type AdminCouponCode,
  type CreateDiscountEventRequest,
  type CreateCouponCodeRequest,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";

type DiscountType = "percentage" | "fixed";

function formatDate(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return d.toLocaleDateString();
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function describeAmount(type: DiscountType, value: number): string {
  return type === "percentage" ? `${value}% off` : `$${value.toFixed(2)} off`;
}

export default function Discounts() {
  return (
    <>
      <PageHeader title="Discounts" />
      <PageBody>
        <Tabs defaultValue="events">
          <TabsList>
            <TabsTrigger value="events">Discount events</TabsTrigger>
            <TabsTrigger value="coupons">Coupon codes</TabsTrigger>
          </TabsList>
          <TabsContent value="events" className="mt-4">
            <EventsPanel />
          </TabsContent>
          <TabsContent value="coupons" className="mt-4">
            <CouponsPanel />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}

// ---------------- Events ----------------

function EventsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useAdminListDiscountEvents();
  const createMut = useAdminCreateDiscountEvent();
  const updateMut = useAdminUpdateDiscountEvent();
  const deleteMut = useAdminDeleteDiscountEvent();

  const [editing, setEditing] = useState<AdminDiscountEvent | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminDiscountEvent | null>(
    null,
  );

  async function refetch() {
    await qc.invalidateQueries({
      queryKey: getAdminListDiscountEventsQueryKey(),
    });
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteMut.mutateAsync({ id: confirmDelete.id });
      await refetch();
      toast.toast({ title: `Deleted "${confirmDelete.name}"` });
      setConfirmDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      toast.toast({
        title: "Could not delete",
        description: msg,
        variant: "destructive",
      });
    }
  }

  const events = list.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4 mr-1.5" />
          New event
        </Button>
      </div>
      <div className="bg-white rounded-lg border overflow-x-auto">
        {list.isLoading ? (
          <div className="p-8 flex justify-center">
            <Spinner />
          </div>
        ) : list.isError ? (
          <div className="p-6 text-sm text-rose-600">
            Failed to load events.
          </div>
        ) : events.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No discount events yet. Create one to start a sale.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Name</th>
                <th className="px-4 py-2 font-semibold">Discount</th>
                <th className="px-4 py-2 font-semibold">Window</th>
                <th className="px-4 py-2 font-semibold">Stackable</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {events.map((e) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium text-slate-900">
                    {e.name}
                  </td>
                  <td className="px-4 py-2">
                    {describeAmount(e.type, e.value)}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {formatDate(e.startDate)} → {formatDate(e.endDate)}
                  </td>
                  <td className="px-4 py-2">
                    {e.isStackable ? "Yes" : "No"}
                  </td>
                  <td className="px-4 py-2">
                    {e.isActive ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-normal">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal text-slate-500">
                        Off
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(e)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDelete(e)}
                      >
                        <Trash2 className="size-3.5 text-rose-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <EventDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={async () => {
          await refetch();
          toast.toast({ title: "Discount event created" });
        }}
        save={(data) => createMut.mutateAsync({ data })}
      />
      <EventDialog
        open={editing !== null}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          await refetch();
          toast.toast({ title: "Discount event updated" });
        }}
        save={(data) =>
          editing
            ? updateMut.mutateAsync({ id: editing.id, data })
            : Promise.reject(new Error("No event"))
        }
      />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this discount event?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.name}" will be permanently removed. This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EventDialog({
  open,
  editing,
  onClose,
  onSaved,
  save,
}: {
  open: boolean;
  editing?: AdminDiscountEvent | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  save: (data: CreateDiscountEventRequest) => Promise<unknown>;
}) {
  const [name, setName] = useState("");
  const [type, setType] = useState<DiscountType>("percentage");
  const [value, setValue] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isStackable, setIsStackable] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setName(editing?.name ?? "");
      setType(editing?.type ?? "percentage");
      setValue(editing ? String(editing.value) : "");
      setStartDate(editing ? toLocalInput(editing.startDate) : "");
      setEndDate(editing ? toLocalInput(editing.endDate) : "");
      setIsStackable(editing?.isStackable ?? false);
      setIsActive(editing?.isActive ?? true);
      setError(null);
    }
  }, [open, editing]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Name is required.");
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0)
      return setError("Value must be a non-negative number.");
    if (type === "percentage" && num > 100)
      return setError("Percentage cannot exceed 100.");
    const startISO = fromLocalInput(startDate);
    const endISO = fromLocalInput(endDate);
    if (startISO && endISO && new Date(endISO) <= new Date(startISO))
      return setError("End date must be after start date.");
    setPending(true);
    try {
      await save({
        name: name.trim(),
        type,
        value: num,
        startDate: startISO,
        endDate: endISO,
        isStackable,
        isActive,
      });
      await onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit discount event" : "New discount event"}
          </DialogTitle>
          <DialogDescription>
            Site-wide promotion that applies automatically while active.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="ev-name">Name</Label>
            <Input
              id="ev-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Spring Sale"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ev-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as DiscountType)}>
                <SelectTrigger id="ev-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="ev-value">
                Value {type === "percentage" ? "(%)" : "($)"}
              </Label>
              <Input
                id="ev-value"
                type="number"
                step="0.01"
                min="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ev-start">Starts</Label>
              <Input
                id="ev-start"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="ev-end">Ends</Label>
              <Input
                id="ev-end"
                type="datetime-local"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Stackable</div>
              <div className="text-xs text-slate-500">
                Allow stacking with other discounts and coupons
              </div>
            </div>
            <Switch checked={isStackable} onCheckedChange={setIsStackable} />
          </div>
          <div className="flex items-center justify-between rounded border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-xs text-slate-500">
                Off events never apply, even within their window
              </div>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------- Coupons ----------------

function CouponsPanel() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useAdminListCouponCodes();
  const createMut = useAdminCreateCouponCode();
  const updateMut = useAdminUpdateCouponCode();
  const deleteMut = useAdminDeleteCouponCode();

  const [editing, setEditing] = useState<AdminCouponCode | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<AdminCouponCode | null>(
    null,
  );
  const [viewingUses, setViewingUses] = useState<AdminCouponCode | null>(null);

  async function refetch() {
    await qc.invalidateQueries({
      queryKey: getAdminListCouponCodesQueryKey(),
    });
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    try {
      await deleteMut.mutateAsync({ id: confirmDelete.id });
      await refetch();
      toast.toast({ title: `Deleted "${confirmDelete.code}"` });
      setConfirmDelete(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete";
      toast.toast({
        title: "Could not delete",
        description: msg,
        variant: "destructive",
      });
    }
  }

  const coupons = list.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus className="size-4 mr-1.5" />
          New coupon
        </Button>
      </div>
      <div className="bg-white rounded-lg border overflow-x-auto">
        {list.isLoading ? (
          <div className="p-8 flex justify-center">
            <Spinner />
          </div>
        ) : list.isError ? (
          <div className="p-6 text-sm text-rose-600">Failed to load coupons.</div>
        ) : coupons.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No coupon codes yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-semibold">Code</th>
                <th className="px-4 py-2 font-semibold">Discount</th>
                <th className="px-4 py-2 font-semibold">Min order</th>
                <th className="px-4 py-2 font-semibold">Uses</th>
                <th className="px-4 py-2 font-semibold">Expires</th>
                <th className="px-4 py-2 font-semibold">Status</th>
                <th className="px-4 py-2 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {coupons.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-mono text-xs font-semibold text-slate-900">
                    {c.code}
                  </td>
                  <td className="px-4 py-2">
                    {describeAmount(c.discountType, c.value)}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {c.minOrderAmount === null
                      ? "—"
                      : `$${c.minOrderAmount.toFixed(2)}`}
                  </td>
                  <td className="px-4 py-2 text-slate-600">
                    {c.currentUses}
                    {c.maxUsesTotal !== null ? ` / ${c.maxUsesTotal}` : ""}
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-600">
                    {formatDate(c.expirationDate)}
                  </td>
                  <td className="px-4 py-2">
                    {c.isActive ? (
                      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-normal">
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="font-normal text-slate-500">
                        Off
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setViewingUses(c)}
                      >
                        <Eye className="size-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(c)}
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirmDelete(c)}
                      >
                        <Trash2 className="size-3.5 text-rose-600" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CouponDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={async () => {
          await refetch();
          toast.toast({ title: "Coupon code created" });
        }}
        save={(data) => createMut.mutateAsync({ data })}
      />
      <CouponDialog
        open={editing !== null}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => {
          await refetch();
          toast.toast({ title: "Coupon code updated" });
        }}
        save={(data) =>
          editing
            ? updateMut.mutateAsync({ id: editing.id, data })
            : Promise.reject(new Error("No coupon"))
        }
      />

      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => !o && setConfirmDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this coupon code?</AlertDialogTitle>
            <AlertDialogDescription>
              "{confirmDelete?.code}" and all its redemption history will be
              permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-rose-600 hover:bg-rose-700"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UsesDialog
        coupon={viewingUses}
        onClose={() => setViewingUses(null)}
      />
    </div>
  );
}

function CouponDialog({
  open,
  editing,
  onClose,
  onSaved,
  save,
}: {
  open: boolean;
  editing?: AdminCouponCode | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  save: (data: CreateCouponCodeRequest) => Promise<unknown>;
}) {
  const [code, setCode] = useState("");
  const [discountType, setDiscountType] = useState<DiscountType>("percentage");
  const [value, setValue] = useState("");
  const [minOrder, setMinOrder] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [singleUse, setSingleUse] = useState(false);
  const [startDate, setStartDate] = useState("");
  const [expirationDate, setExpirationDate] = useState("");
  const [isStackable, setIsStackable] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (open) {
      setCode(editing?.code ?? "");
      setDiscountType(editing?.discountType ?? "percentage");
      setValue(editing ? String(editing.value) : "");
      setMinOrder(
        editing && editing.minOrderAmount !== null
          ? String(editing.minOrderAmount)
          : "",
      );
      setMaxUses(
        editing && editing.maxUsesTotal !== null
          ? String(editing.maxUsesTotal)
          : "",
      );
      setSingleUse(editing?.singleUsePerCustomer ?? false);
      setStartDate(editing ? toLocalInput(editing.startDate) : "");
      setExpirationDate(editing ? toLocalInput(editing.expirationDate) : "");
      setIsStackable(editing?.isStackable ?? false);
      setIsActive(editing?.isActive ?? true);
      setError(null);
    }
  }, [open, editing]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmedCode = code.trim();
    if (!trimmedCode) return setError("Code is required.");
    const num = Number(value);
    if (!Number.isFinite(num) || num < 0)
      return setError("Value must be a non-negative number.");
    if (discountType === "percentage" && num > 100)
      return setError("Percentage cannot exceed 100.");
    const minNum = minOrder.trim() === "" ? null : Number(minOrder);
    if (minNum !== null && (!Number.isFinite(minNum) || minNum < 0))
      return setError("Minimum order must be ≥ 0.");
    const maxNum = maxUses.trim() === "" ? null : Number(maxUses);
    if (maxNum !== null && (!Number.isInteger(maxNum) || maxNum < 1))
      return setError("Max total uses must be a positive integer.");
    const startISO = fromLocalInput(startDate);
    const expISO = fromLocalInput(expirationDate);
    if (startISO && expISO && new Date(expISO) <= new Date(startISO))
      return setError("Expiration must be after start.");
    setPending(true);
    try {
      await save({
        code: trimmedCode,
        discountType,
        value: num,
        minOrderAmount: minNum,
        maxUsesTotal: maxNum,
        singleUsePerCustomer: singleUse,
        startDate: startISO,
        expirationDate: expISO,
        isStackable,
        isActive,
      });
      await onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editing ? "Edit coupon code" : "New coupon code"}
          </DialogTitle>
          <DialogDescription>
            Customers enter the code at checkout to apply the discount.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label htmlFor="cp-code">Code</Label>
            <Input
              id="cp-code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="WELCOME10"
              className="font-mono"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cp-type">Discount type</Label>
              <Select
                value={discountType}
                onValueChange={(v) => setDiscountType(v as DiscountType)}
              >
                <SelectTrigger id="cp-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed">Fixed amount</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="cp-value">
                Value {discountType === "percentage" ? "(%)" : "($)"}
              </Label>
              <Input
                id="cp-value"
                type="number"
                step="0.01"
                min="0"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                required
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cp-min">Minimum order ($)</Label>
              <Input
                id="cp-min"
                type="number"
                step="0.01"
                min="0"
                value={minOrder}
                onChange={(e) => setMinOrder(e.target.value)}
                placeholder="No minimum"
              />
            </div>
            <div>
              <Label htmlFor="cp-max">Max total uses</Label>
              <Input
                id="cp-max"
                type="number"
                step="1"
                min="1"
                value={maxUses}
                onChange={(e) => setMaxUses(e.target.value)}
                placeholder="Unlimited"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cp-start">Starts</Label>
              <Input
                id="cp-start"
                type="datetime-local"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="cp-exp">Expires</Label>
              <Input
                id="cp-exp"
                type="datetime-local"
                value={expirationDate}
                onChange={(e) => setExpirationDate(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded border px-3 py-2">
            <div>
              <div className="text-sm font-medium">One per customer</div>
              <div className="text-xs text-slate-500">
                Each customer may redeem this coupon at most once
              </div>
            </div>
            <Switch checked={singleUse} onCheckedChange={setSingleUse} />
          </div>
          <div className="flex items-center justify-between rounded border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Stackable</div>
              <div className="text-xs text-slate-500">
                Combine with active discount events
              </div>
            </div>
            <Switch checked={isStackable} onCheckedChange={setIsStackable} />
          </div>
          <div className="flex items-center justify-between rounded border px-3 py-2">
            <div>
              <div className="text-sm font-medium">Active</div>
              <div className="text-xs text-slate-500">
                Off coupons cannot be redeemed
              </div>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : editing ? "Save changes" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function UsesDialog({
  coupon,
  onClose,
}: {
  coupon: AdminCouponCode | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const couponId = coupon?.id ?? 0;
  const usesQ = useAdminListCouponCodeUses(couponId, {
    query: {
      queryKey: getAdminListCouponCodeUsesQueryKey(couponId),
      enabled: coupon !== null,
    },
  });
  const uses = usesQ.data ?? [];
  const totalDiscount = useMemo(
    () => uses.reduce((acc, u) => acc + u.discountApplied, 0),
    [uses],
  );

  useEffect(() => {
    if (coupon) {
      void qc.invalidateQueries({
        queryKey: getAdminListCouponCodeUsesQueryKey(coupon.id),
      });
    }
  }, [coupon, qc]);

  return (
    <Dialog open={coupon !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Redemptions — <span className="font-mono">{coupon?.code}</span>
          </DialogTitle>
          <DialogDescription>
            {uses.length} {uses.length === 1 ? "redemption" : "redemptions"} ·
            {" "}
            ${totalDiscount.toFixed(2)} total discount given
          </DialogDescription>
        </DialogHeader>
        <div className="border rounded max-h-96 overflow-auto">
          {usesQ.isLoading ? (
            <div className="p-6 flex justify-center">
              <Spinner />
            </div>
          ) : uses.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              No redemptions yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">When</th>
                  <th className="px-3 py-2 font-semibold">Customer</th>
                  <th className="px-3 py-2 font-semibold">Order</th>
                  <th className="px-3 py-2 font-semibold text-right">
                    Discount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {uses.map((u) => (
                  <tr key={u.id}>
                    <td className="px-3 py-2 text-xs text-slate-600">
                      {new Date(u.createdAt).toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {u.userEmail ?? "Guest"}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {u.orderNumber ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      ${u.discountApplied.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
