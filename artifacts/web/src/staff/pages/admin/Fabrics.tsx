import { useMemo, useState, useRef, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  useAdminListFabrics,
  useAdminCreateFabric,
  useAdminUpdateFabric,
  useAdminDeleteFabric,
  useAdminListManufacturers,
  getAdminListFabricsQueryKey,
  type AdminFabric,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";
import { uploadFile, getStaffObjectUrl } from "../../lib/upload";

const ALL_VENDORS = "__all__";

interface FabricFormState {
  manufacturerId: string;
  itemNumber: string;
  name: string;
  swatchImageUrl: string;
  isActive: boolean;
  displayOrder: string;
}

function emptyForm(mfgId?: string): FabricFormState {
  return {
    manufacturerId: mfgId ?? "",
    itemNumber: "",
    name: "",
    swatchImageUrl: "",
    isActive: true,
    displayOrder: "0",
  };
}

function formFromFabric(f: AdminFabric): FabricFormState {
  return {
    manufacturerId: String(f.manufacturerId),
    itemNumber: f.itemNumber,
    name: f.name,
    swatchImageUrl: f.swatchImageUrl ?? "",
    isActive: f.isActive,
    displayOrder: String(f.displayOrder),
  };
}

export default function Fabrics() {
  const qc = useQueryClient();
  const toast = useToast();

  const list = useAdminListFabrics();
  const mfgList = useAdminListManufacturers();
  const createMut = useAdminCreateFabric();
  const updateMut = useAdminUpdateFabric();
  const deleteMut = useAdminDeleteFabric();

  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState(ALL_VENDORS);

  const [editing, setEditing] = useState<AdminFabric | "new" | null>(null);
  const [form, setForm] = useState<FabricFormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [swatchUploading, setSwatchUploading] = useState(false);
  const swatchRef = useRef<HTMLInputElement>(null);

  const [confirmDelete, setConfirmDelete] = useState<AdminFabric | null>(null);

  const fabrics = list.data ?? [];
  const manufacturers = mfgList.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fabrics.filter((f) => {
      if (vendorFilter !== ALL_VENDORS && String(f.manufacturerId) !== vendorFilter) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        f.itemNumber.toLowerCase().includes(q) ||
        f.manufacturerName.toLowerCase().includes(q)
      );
    });
  }, [fabrics, search, vendorFilter]);

  function openNew() {
    setForm(emptyForm(vendorFilter !== ALL_VENDORS ? vendorFilter : undefined));
    setFormError(null);
    setEditing("new");
  }

  function openEdit(f: AdminFabric) {
    setForm(formFromFabric(f));
    setFormError(null);
    setEditing(f);
  }

  function closeDialog() {
    setEditing(null);
    setFormError(null);
  }

  async function handleSwatchUpload(file: File) {
    setSwatchUploading(true);
    try {
      const { objectPath } = await uploadFile(file);
      const url = getStaffObjectUrl(objectPath) ?? objectPath;
      setForm((f) => ({ ...f, swatchImageUrl: url }));
    } catch {
      toast.toast({ title: "Upload failed", description: "Could not upload swatch image.", variant: "destructive" });
    } finally {
      setSwatchUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const manufacturerId = Number(form.manufacturerId);
    if (!Number.isFinite(manufacturerId) || manufacturerId <= 0) {
      setFormError("Vendor is required.");
      return;
    }
    const itemNumber = form.itemNumber.trim();
    if (!itemNumber) {
      setFormError("Item number is required.");
      return;
    }
    const name = form.name.trim();
    if (!name) {
      setFormError("Name is required.");
      return;
    }
    const displayOrder = Number(form.displayOrder);
    if (!Number.isInteger(displayOrder)) {
      setFormError("Display order must be a whole number.");
      return;
    }

    const payload = {
      manufacturerId,
      itemNumber,
      name,
      swatchImageUrl: form.swatchImageUrl.trim() || null,
      isActive: form.isActive,
      displayOrder,
    };

    try {
      if (editing === "new") {
        await createMut.mutateAsync({ data: payload });
        toast.toast({ title: "Fabric created", description: name });
      } else if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: payload });
        toast.toast({ title: "Fabric updated", description: name });
      }
      await qc.invalidateQueries({ queryKey: getAdminListFabricsQueryKey() });
      closeDialog();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save fabric.";
      setFormError(msg);
    }
  }

  async function handleDelete(f: AdminFabric) {
    try {
      await deleteMut.mutateAsync({ id: f.id });
      await qc.invalidateQueries({ queryKey: getAdminListFabricsQueryKey() });
      toast.toast({ title: "Fabric deleted", description: f.name });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not delete fabric.";
      toast.toast({ title: "Delete failed", description: msg, variant: "destructive" });
    } finally {
      setConfirmDelete(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Fabrics"
        subtitle="Manage fabric swatches by vendor"
        action={
          <Button onClick={openNew}>
            <Plus className="size-4 mr-1.5" />
            Add fabric
          </Button>
        }
      />
      <PageBody>
        {/* Filter bar */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
            <Input
              placeholder="Search by name or item #…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <Select value={vendorFilter} onValueChange={setVendorFilter}>
            <SelectTrigger className="w-[220px]">
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_VENDORS}>All vendors</SelectItem>
              {manufacturers.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border overflow-x-auto">
          {list.isLoading ? (
            <div className="p-12 flex justify-center">
              <Spinner />
            </div>
          ) : list.isError ? (
            <div className="p-6 text-sm text-rose-600">Failed to load fabrics.</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              <div className="mx-auto mb-3 size-8 text-slate-300 flex items-center justify-center">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-8">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.53 16.122a3 3 0 0 0-5.78 1.128 2.25 2.25 0 0 1-2.4 2.245 4.5 4.5 0 0 0 8.4-2.245c0-.399-.078-.78-.22-1.128Zm0 0a15.998 15.998 0 0 0 3.388-1.62m-5.043-.025a15.994 15.994 0 0 1 1.622-3.395m3.42 3.42a15.995 15.995 0 0 0 4.764-4.648l3.876-5.814a1.151 1.151 0 0 0-1.597-1.597L14.146 6.32a15.996 15.996 0 0 0-4.649 4.763m3.42 3.42a6.776 6.776 0 0 0-3.42-3.42" />
                </svg>
              </div>
              {fabrics.length === 0 ? "No fabrics yet. Add one to get started." : "No fabrics match your filters."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold w-12">Swatch</th>
                  <th className="px-4 py-3 font-semibold">Item #</th>
                  <th className="px-4 py-3 font-semibold">Name</th>
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold text-center">Order</th>
                  <th className="px-4 py-3 font-semibold text-center">Active</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((f) => (
                  <tr key={f.id} className="hover:bg-slate-50 align-middle">
                    <td className="px-4 py-2.5">
                      {f.swatchImageUrl ? (
                        <img
                          src={f.swatchImageUrl}
                          alt={f.name}
                          className="size-8 rounded object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="size-8 rounded bg-slate-100 border border-slate-200 flex items-center justify-center">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="size-4 text-slate-300">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                          </svg>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">{f.itemNumber}</td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{f.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{f.manufacturerName}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-slate-500">{f.displayOrder}</td>
                    <td className="px-4 py-2.5 text-center">
                      {f.isActive ? (
                        <Badge variant="secondary" className="text-xs">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-slate-400">Inactive</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7"
                          onClick={() => openEdit(f)}
                          title="Edit"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="size-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                          onClick={() => setConfirmDelete(f)}
                          title="Delete"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-2 text-xs text-slate-400">
          {filtered.length} fabric{filtered.length !== 1 ? "s" : ""}
          {filtered.length !== fabrics.length ? ` (${fabrics.length} total)` : ""}
        </p>
      </PageBody>

      {/* Add / Edit dialog */}
      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add fabric" : "Edit fabric"}</DialogTitle>
            <DialogDescription>
              {editing === "new"
                ? "Enter the vendor item number, name, and other details for the new fabric."
                : editing !== null
                  ? `Editing: ${editing.name}`
                  : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <Label htmlFor="fab-vendor">Vendor *</Label>
              <Select
                value={form.manufacturerId}
                onValueChange={(v) => setForm((f) => ({ ...f, manufacturerId: v }))}
              >
                <SelectTrigger id="fab-vendor">
                  <SelectValue placeholder="Select a vendor" />
                </SelectTrigger>
                <SelectContent>
                  {manufacturers.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fab-item">Item # *</Label>
                <Input
                  id="fab-item"
                  value={form.itemNumber}
                  onChange={(e) => setForm((f) => ({ ...f, itemNumber: e.target.value }))}
                  placeholder="e.g. 5476-0000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fab-order">Display order</Label>
                <Input
                  id="fab-order"
                  type="number"
                  value={form.displayOrder}
                  onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fab-name">Name *</Label>
              <Input
                id="fab-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Spectrum Graphite"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Swatch image</Label>
              <div className="flex gap-2 items-start">
                {form.swatchImageUrl && (
                  <img
                    src={form.swatchImageUrl}
                    alt="Swatch preview"
                    className="size-10 rounded object-cover border border-slate-200 shrink-0"
                  />
                )}
                <div className="flex-1 space-y-1.5">
                  <Input
                    value={form.swatchImageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, swatchImageUrl: e.target.value }))}
                    placeholder="Paste URL or upload below"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={swatchUploading}
                      onClick={() => swatchRef.current?.click()}
                    >
                      {swatchUploading ? "Uploading…" : "Upload image"}
                    </Button>
                    {form.swatchImageUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-slate-600"
                        onClick={() => setForm((f) => ({ ...f, swatchImageUrl: "" }))}
                      >
                        <X className="size-3.5 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                  <input
                    ref={swatchRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleSwatchUpload(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="fab-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
              <Label htmlFor="fab-active" className="cursor-pointer">Active</Label>
            </div>

            {formError && (
              <div className="text-sm text-rose-600 flex items-start gap-1.5">
                <X className="size-4 mt-0.5 shrink-0" />
                {formError}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={closeDialog}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending}
              >
                {(createMut.isPending || updateMut.isPending)
                  ? "Saving…"
                  : editing === "new"
                    ? "Add fabric"
                    : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete fabric?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium">{confirmDelete?.name}</span>
              {" "}({confirmDelete?.itemNumber}) will be permanently removed.
              This cannot be undone. Fabrics currently assigned to products cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700"
              onClick={() => confirmDelete && handleDelete(confirmDelete)}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

