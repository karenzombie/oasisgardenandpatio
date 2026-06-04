import { useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, X } from "lucide-react";
import {
  useAdminListFinishCollections,
  useAdminCreateFinishCollection,
  useAdminUpdateFinishCollection,
  useAdminListManufacturers,
  getAdminListFinishCollectionsQueryKey,
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

interface CollectionFormState {
  manufacturerId: string;
  collectionName: string;
  panelImageUrl: string;
  displayOrder: string;
  isActive: boolean;
}

function emptyForm(mfgId?: string): CollectionFormState {
  return {
    manufacturerId: mfgId ?? "",
    collectionName: "",
    panelImageUrl: "",
    displayOrder: "0",
    isActive: true,
  };
}

type AdminFinishCollectionRow = {
  id: number;
  manufacturerId: number;
  manufacturerName: string;
  collectionName: string;
  panelImageUrl: string | null;
  displayOrder: number;
  isActive: boolean;
};

function formFromRow(r: AdminFinishCollectionRow): CollectionFormState {
  return {
    manufacturerId: String(r.manufacturerId),
    collectionName: r.collectionName,
    panelImageUrl: r.panelImageUrl ?? "",
    displayOrder: String(r.displayOrder),
    isActive: r.isActive,
  };
}

export default function FinishCollections() {
  const qc = useQueryClient();
  const toast = useToast();

  const mfgList = useAdminListManufacturers();
  const [vendorFilter, setVendorFilter] = useState(ALL_VENDORS);
  const [search, setSearch] = useState("");

  const listParams =
    vendorFilter !== ALL_VENDORS ? { manufacturerId: Number(vendorFilter) } : undefined;
  const list = useAdminListFinishCollections(listParams);

  const createMut = useAdminCreateFinishCollection();
  const updateMut = useAdminUpdateFinishCollection();

  const [editing, setEditing] = useState<AdminFinishCollectionRow | "new" | null>(null);
  const [form, setForm] = useState<CollectionFormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);

  const manufacturers = mfgList.data ?? [];
  const rows = (list.data ?? []) as AdminFinishCollectionRow[];

  const filtered = rows.filter((r) => {
    if (!search.trim()) return true;
    return r.collectionName.toLowerCase().includes(search.trim().toLowerCase());
  });

  function openNew() {
    setForm(emptyForm(vendorFilter !== ALL_VENDORS ? vendorFilter : undefined));
    setFormError(null);
    setEditing("new");
  }

  function openEdit(r: AdminFinishCollectionRow) {
    setForm(formFromRow(r));
    setFormError(null);
    setEditing(r);
  }

  function closeDialog() {
    setEditing(null);
    setFormError(null);
  }

  async function handleImageUpload(file: File) {
    setImageUploading(true);
    try {
      const { objectPath } = await uploadFile(file);
      const url = getStaffObjectUrl(objectPath) ?? objectPath;
      setForm((f) => ({ ...f, panelImageUrl: url }));
    } catch {
      toast.toast({
        title: "Upload failed",
        description: "Could not upload image.",
        variant: "destructive",
      });
    } finally {
      setImageUploading(false);
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
    const collectionName = form.collectionName.trim();
    if (!collectionName) {
      setFormError("Collection name is required.");
      return;
    }
    const displayOrder = Number(form.displayOrder);
    if (!Number.isInteger(displayOrder)) {
      setFormError("Display order must be a whole number.");
      return;
    }

    const payload = {
      manufacturerId,
      collectionName,
      panelImageUrl: form.panelImageUrl.trim() || null,
      displayOrder,
      isActive: form.isActive,
    };

    try {
      if (editing === "new") {
        await createMut.mutateAsync({ data: payload });
        toast.toast({ title: "Collection created", description: collectionName });
      } else if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: payload });
        toast.toast({ title: "Collection updated", description: collectionName });
      }
      await qc.invalidateQueries({ queryKey: getAdminListFinishCollectionsQueryKey(listParams) });
      closeDialog();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save collection.";
      setFormError(msg);
    }
  }

  return (
    <>
      <PageHeader
        title="Finish Collections"
        subtitle="Group finishes into named collections for display on the customer-facing finishes page"
        action={
          <Button onClick={openNew}>
            <Plus className="size-4 mr-1.5" />
            Add collection
          </Button>
        }
      />
      <PageBody>
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
            <Input
              placeholder="Search by collection name…"
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

        <div className="bg-white rounded-lg border overflow-x-auto">
          {list.isLoading ? (
            <div className="p-12 flex justify-center">
              <Spinner />
            </div>
          ) : list.isError ? (
            <div className="p-6 text-sm text-rose-600">Failed to load collections.</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              {rows.length === 0
                ? "No collections yet. Add one to get started."
                : "No collections match your search."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold w-16">Panel</th>
                  <th className="px-4 py-3 font-semibold">Collection Name</th>
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold text-center">Order</th>
                  <th className="px-4 py-3 font-semibold text-center">Active</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50 align-middle">
                    <td className="px-4 py-2.5">
                      {r.panelImageUrl ? (
                        <img
                          src={r.panelImageUrl}
                          alt={r.collectionName}
                          className="w-14 h-10 rounded object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="w-14 h-10 rounded bg-slate-100 border border-slate-200" />
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      {r.collectionName}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{r.manufacturerName}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-slate-500">
                      {r.displayOrder}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {r.isActive ? (
                        <Badge variant="secondary" className="text-xs">
                          Active
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-slate-400">
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7"
                        onClick={() => openEdit(r)}
                        title="Edit"
                      >
                        <Pencil className="size-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <p className="mt-2 text-xs text-slate-400">
          {filtered.length} collection{filtered.length !== 1 ? "s" : ""}
          {filtered.length !== rows.length ? ` (${rows.length} total)` : ""}
        </p>
      </PageBody>

      <Dialog
        open={editing !== null}
        onOpenChange={(o) => {
          if (!o) closeDialog();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editing === "new" ? "Add finish collection" : "Edit finish collection"}
            </DialogTitle>
            <DialogDescription>
              {editing === "new"
                ? "Create a named collection to group finishes and display a panel image on the finishes page."
                : editing !== null
                  ? `Editing: ${editing.collectionName}`
                  : ""}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <Label htmlFor="fc-vendor">
                Vendor <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.manufacturerId}
                onValueChange={(v) => setForm((f) => ({ ...f, manufacturerId: v }))}
                disabled={editing !== "new"}
              >
                <SelectTrigger id="fc-vendor">
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
              {editing !== "new" && (
                <p className="text-xs text-muted-foreground">
                  Vendor cannot be changed after creation.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label htmlFor="fc-name">
                  Collection name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="fc-name"
                  value={form.collectionName}
                  onChange={(e) => setForm((f) => ({ ...f, collectionName: e.target.value }))}
                  placeholder="e.g. Signature Collection"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fc-order">Display order</Label>
                <Input
                  id="fc-order"
                  type="number"
                  value={form.displayOrder}
                  onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Panel image</Label>
              <p className="text-xs text-muted-foreground">
                Shown above the collection's swatches on the customer finishes page.
              </p>
              <div className="flex gap-2 items-start">
                {form.panelImageUrl && (
                  <img
                    src={form.panelImageUrl}
                    alt="Panel preview"
                    className="h-16 w-24 rounded object-cover border border-slate-200 shrink-0"
                  />
                )}
                <div className="flex-1 space-y-1.5">
                  <Input
                    value={form.panelImageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, panelImageUrl: e.target.value }))}
                    placeholder="Paste URL or upload below"
                  />
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={imageUploading}
                      onClick={() => imageRef.current?.click()}
                    >
                      {imageUploading ? "Uploading…" : "Upload image"}
                    </Button>
                    {form.panelImageUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-slate-600"
                        onClick={() => setForm((f) => ({ ...f, panelImageUrl: "" }))}
                      >
                        <X className="size-3.5 mr-1" />
                        Clear
                      </Button>
                    )}
                  </div>
                  <input
                    ref={imageRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) void handleImageUpload(file);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="fc-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
              <Label htmlFor="fc-active" className="cursor-pointer">
                Active
              </Label>
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
                {createMut.isPending || updateMut.isPending
                  ? "Saving…"
                  : editing === "new"
                    ? "Add collection"
                    : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
