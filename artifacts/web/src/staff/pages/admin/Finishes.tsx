import { useEffect, useMemo, useState, useRef, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Boxes, Pencil, Plus, Search, X } from "lucide-react";
import {
  useAdminListFinishes,
  useAdminCreateFinish,
  useAdminUpdateFinish,
  useAdminListManufacturers,
  useAdminListFinishProducts,
  useAdminUpdateFinishProducts,
  useAdminListProducts,
  getAdminListFinishesQueryKey,
  getAdminListFinishProductsQueryKey,
  type AdminFinish,
  type AdminFinishProduct,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

const COUTURE_JARDIN_ID = "14";

interface FinishFormState {
  manufacturerId: string;
  itemNumber: string;
  name: string;
  description: string;
  collection: string;
  imageUrl: string;
  isActive: boolean;
  displayOrder: string;
}

function emptyForm(mfgId?: string): FinishFormState {
  return {
    manufacturerId: mfgId ?? "",
    itemNumber: "",
    name: "",
    description: "",
    collection: "",
    imageUrl: "",
    isActive: true,
    displayOrder: "0",
  };
}

function formFromFinish(f: AdminFinish): FinishFormState {
  return {
    manufacturerId: String(f.manufacturerId),
    itemNumber: f.itemNumber ?? "",
    name: f.name,
    description: f.description ?? "",
    collection: f.collection ?? "",
    imageUrl: f.imageUrl ?? "",
    isActive: f.isActive,
    displayOrder: String(f.displayOrder),
  };
}

export default function Finishes() {
  const qc = useQueryClient();
  const toast = useToast();

  const list = useAdminListFinishes();
  const mfgList = useAdminListManufacturers();
  const createMut = useAdminCreateFinish();
  const updateMut = useAdminUpdateFinish();

  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState(ALL_VENDORS);

  const [editing, setEditing] = useState<AdminFinish | "new" | null>(null);
  const [managingProducts, setManagingProducts] = useState<AdminFinish | null>(null);
  const [form, setForm] = useState<FinishFormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [imageUploading, setImageUploading] = useState(false);
  const imageRef = useRef<HTMLInputElement>(null);

  const finishes = list.data ?? [];
  const manufacturers = mfgList.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return finishes.filter((f) => {
      if (vendorFilter !== ALL_VENDORS && String(f.manufacturerId) !== vendorFilter) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        (f.itemNumber?.toLowerCase().includes(q) ?? false) ||
        f.manufacturerName.toLowerCase().includes(q)
      );
    });
  }, [finishes, search, vendorFilter]);

  function openNew() {
    setForm(emptyForm(vendorFilter !== ALL_VENDORS ? vendorFilter : undefined));
    setFormError(null);
    setEditing("new");
  }

  function openEdit(f: AdminFinish) {
    setForm(formFromFinish(f));
    setFormError(null);
    setEditing(f);
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
      setForm((f) => ({ ...f, imageUrl: url }));
    } catch {
      toast.toast({ title: "Upload failed", description: "Could not upload image.", variant: "destructive" });
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

    if (form.manufacturerId === COUTURE_JARDIN_ID && !form.collection.trim()) {
      setFormError("Collection is required for Couture Jardin finishes.");
      return;
    }

    const payload = {
      manufacturerId,
      itemNumber: form.itemNumber.trim() || null,
      name,
      description: form.description.trim() || null,
      collection: form.collection.trim() || null,
      imageUrl: form.imageUrl.trim() || null,
      isActive: form.isActive,
      displayOrder,
    };

    try {
      if (editing === "new") {
        await createMut.mutateAsync({ data: payload });
        toast.toast({ title: "Finish created", description: name });
      } else if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: payload });
        toast.toast({ title: "Finish updated", description: name });
      }
      await qc.invalidateQueries({ queryKey: getAdminListFinishesQueryKey() });
      closeDialog();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save finish.";
      setFormError(msg);
    }
  }

  return (
    <>
      <PageHeader
        title="Finishes"
        subtitle="Manage frame finishes by vendor"
        action={
          <Button onClick={openNew}>
            <Plus className="size-4 mr-1.5" />
            Add finish
          </Button>
        }
      />
      <PageBody>
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

        <div className="bg-white rounded-lg border overflow-x-auto">
          {list.isLoading ? (
            <div className="p-12 flex justify-center">
              <Spinner />
            </div>
          ) : list.isError ? (
            <div className="p-6 text-sm text-rose-600">Failed to load finishes.</div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              {finishes.length === 0 ? "No finishes yet. Add one to get started." : "No finishes match your filters."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold w-12">Sample</th>
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
                      {f.imageUrl ? (
                        <img
                          src={f.imageUrl}
                          alt={f.name}
                          className="size-8 rounded object-cover border border-slate-200"
                        />
                      ) : (
                        <div className="size-8 rounded bg-slate-100 border border-slate-200" />
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                      {f.itemNumber ?? <span className="text-slate-300">—</span>}
                    </td>
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
                          onClick={() => setManagingProducts(f)}
                          title="Manage products"
                          data-testid={`finish-manage-products-${f.id}`}
                        >
                          <Boxes className="size-3.5" />
                        </Button>
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => openEdit(f)} title="Edit">
                          <Pencil className="size-3.5" />
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
          {filtered.length} finish{filtered.length !== 1 ? "es" : ""}
          {filtered.length !== finishes.length ? ` (${finishes.length} total)` : ""}
        </p>
      </PageBody>

      <Dialog open={editing !== null} onOpenChange={(o) => { if (!o) closeDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing === "new" ? "Add finish" : "Edit finish"}</DialogTitle>
            <DialogDescription>
              {editing === "new"
                ? "Enter the vendor, name, and optional code for the new finish."
                : editing !== null
                  ? `Editing: ${editing.name}`
                  : ""}
            </DialogDescription>
          </DialogHeader>
          {editing !== "new" && !form.isActive && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
              <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800 text-sm">Inactive</p>
                <p className="text-amber-700 text-xs mt-0.5">This finish is hidden from all customer-facing pages. Toggle "Active" below to re-enable it.</p>
              </div>
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <Label htmlFor="fin-vendor">Vendor *</Label>
              <Select
                value={form.manufacturerId}
                onValueChange={(v) => setForm((f) => ({ ...f, manufacturerId: v }))}
              >
                <SelectTrigger id="fin-vendor">
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
                <Label htmlFor="fin-item">Item # (optional)</Label>
                <Input
                  id="fin-item"
                  value={form.itemNumber}
                  onChange={(e) => setForm((f) => ({ ...f, itemNumber: e.target.value }))}
                  placeholder="e.g. OBS"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fin-order">Display order</Label>
                <Input
                  id="fin-order"
                  type="number"
                  value={form.displayOrder}
                  onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fin-name">Name *</Label>
              <Input
                id="fin-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Obsidian"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fin-desc">Description</Label>
              <Textarea
                id="fin-desc"
                rows={2}
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="Optional — e.g. Textured powder coat"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="fin-collection">
                Collection
                {form.manufacturerId === COUTURE_JARDIN_ID && (
                  <span className="text-destructive ml-1">*</span>
                )}
              </Label>
              <Input
                id="fin-collection"
                value={form.collection}
                onChange={(e) => setForm((f) => ({ ...f, collection: e.target.value }))}
                placeholder={
                  form.manufacturerId === COUTURE_JARDIN_ID
                    ? "e.g. Signature Collection"
                    : "Optional collection name"
                }
              />
              {form.manufacturerId === COUTURE_JARDIN_ID && (
                <p className="text-xs text-muted-foreground">
                  Required for Couture Jardin — groups finishes on the customer-facing finishes page.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label>Finish image</Label>
              <div className="flex gap-2 items-start">
                {form.imageUrl && (
                  <img
                    src={form.imageUrl}
                    alt="Finish preview"
                    className="size-10 rounded object-cover border border-slate-200 shrink-0"
                  />
                )}
                <div className="flex-1 space-y-1.5">
                  <Input
                    value={form.imageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
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
                    {form.imageUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-slate-400 hover:text-slate-600"
                        onClick={() => setForm((f) => ({ ...f, imageUrl: "" }))}
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
                id="fin-active"
                checked={form.isActive}
                onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
              <Label htmlFor="fin-active" className="cursor-pointer">Active</Label>
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
                    ? "Add finish"
                    : "Save changes"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <FinishProductsDialog
        finish={managingProducts}
        onClose={() => setManagingProducts(null)}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Manage-products dialog — lets staff add/remove direct product links for a
// given finish. Manufacturer-wide finish "pools" remain managed per-product
// in ProductEdit.
// ---------------------------------------------------------------------------
function FinishProductsDialog({
  finish,
  onClose,
}: {
  finish: AdminFinish | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const open = finish !== null;
  const finishId = finish?.id ?? 0;

  const linked = useAdminListFinishProducts(finishId, {
    query: {
      enabled: open,
      queryKey: getAdminListFinishProductsQueryKey(finishId),
    },
  });
  const saveMut = useAdminUpdateFinishProducts();

  // Local working set of product IDs — starts from the server list, then
  // gets mutated by adds/removes before being saved.
  const [working, setWorking] = useState<AdminFinishProduct[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerQ, setPickerQ] = useState("");

  // Clear the working set immediately when the dialog closes or the target
  // finish changes — prevents the previous finish's list from being saved to
  // a different finish if the next load is still pending or errors.
  useEffect(() => {
    setWorking([]);
    setPickerOpen(false);
    setPickerQ("");
  }, [finishId]);

  // Populate the working set once server data arrives for the current finish.
  useEffect(() => {
    if (open && linked.data) setWorking(linked.data.products);
  }, [open, linked.data]);

  const canSave = open && !linked.isLoading && !linked.isError && !!linked.data;

  const workingIds = useMemo(() => new Set(working.map((p) => p.id)), [working]);

  const searchParams = { q: pickerQ, pageSize: 25 };
  const search = useAdminListProducts(searchParams, {
    query: {
      enabled: open && pickerOpen,
      queryKey: ["adminListProducts", searchParams] as const,
    },
  });

  function remove(id: number) {
    setWorking((w) => w.filter((p) => p.id !== id));
  }

  function add(p: { id: number; name: string; sku: string; manufacturerName: string | null; primaryImageUrl: string | null; isActive: boolean; availableOnline: boolean; slug: string }) {
    setWorking((w) => (w.some((x) => x.id === p.id) ? w : [...w, p as AdminFinishProduct]));
  }

  async function handleSave() {
    if (!finish || !canSave) return;
    try {
      await saveMut.mutateAsync({
        id: finishId,
        data: { productIds: working.map((p) => p.id) },
      });
      await qc.invalidateQueries({
        queryKey: getAdminListFinishProductsQueryKey(finishId),
      });
      toast.toast({ title: "Products updated" });
      onClose();
    } catch (err) {
      toast.toast({
        title: "Could not save",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setPickerOpen(false);
          setPickerQ("");
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Products using {finish?.name}</DialogTitle>
          <DialogDescription>
            Add or remove products that offer this finish. Changes save when
            you click <span className="font-medium">Save</span>.
          </DialogDescription>
        </DialogHeader>

        {linked.isLoading ? (
          <div className="py-10 flex justify-center">
            <Spinner />
          </div>
        ) : linked.isError ? (
          <p className="text-sm text-rose-600">Failed to load products.</p>
        ) : (
          <>
            <div className="space-y-2">
              {working.length === 0 ? (
                <p className="text-sm text-slate-500 py-4 text-center border border-dashed rounded-md">
                  No products linked yet. Click "Add product" to start.
                </p>
              ) : (
                <ul className="divide-y border rounded-md">
                  {working.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 p-2.5">
                      <div className="size-10 shrink-0 bg-slate-100 rounded overflow-hidden">
                        {p.primaryImageUrl ? (
                          <img
                            src={p.primaryImageUrl}
                            alt=""
                            className="size-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {p.name}
                        </p>
                        <p className="text-xs text-slate-500">
                          {p.sku}
                          {p.manufacturerName ? ` · ${p.manufacturerName}` : ""}
                          {!p.isActive ? " · Inactive" : ""}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-rose-500 hover:text-rose-700 hover:bg-rose-50"
                        onClick={() => remove(p.id)}
                        title="Remove"
                        data-testid={`finish-product-remove-${p.id}`}
                      >
                        <X className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 border-t pt-4">
              {!pickerOpen ? (
                <Button
                  variant="outline"
                  onClick={() => setPickerOpen(true)}
                  data-testid="finish-products-add-toggle"
                >
                  <Plus className="size-3.5 mr-1.5" /> Add product
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
                    <Input
                      autoFocus
                      placeholder="Search products by name or SKU…"
                      value={pickerQ}
                      onChange={(e) => setPickerQ(e.target.value)}
                      className="pl-8"
                      data-testid="finish-products-search"
                    />
                  </div>
                  <div className="max-h-64 overflow-y-auto border rounded-md divide-y">
                    {search.isLoading ? (
                      <div className="p-4 text-center">
                        <Spinner className="size-4 inline-block" />
                      </div>
                    ) : (search.data?.products ?? []).length === 0 ? (
                      <p className="p-4 text-center text-sm text-slate-500">
                        {pickerQ
                          ? "No products match."
                          : "Type to search products."}
                      </p>
                    ) : (
                      search.data?.products.map((p) => {
                        const already = workingIds.has(p.id);
                        return (
                          <button
                            key={p.id}
                            type="button"
                            disabled={already}
                            onClick={() =>
                              add({
                                id: p.id,
                                name: p.name,
                                slug: p.slug,
                                sku: p.sku,
                                manufacturerName: p.manufacturerName,
                                primaryImageUrl: p.primaryImageUrl,
                                isActive: p.isActive,
                                availableOnline: p.availableOnline,
                              })
                            }
                            className="w-full text-left flex items-center gap-3 p-2 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                            data-testid={`finish-products-pick-${p.id}`}
                          >
                            <div className="size-8 shrink-0 bg-slate-100 rounded overflow-hidden">
                              {p.primaryImageUrl ? (
                                <img
                                  src={p.primaryImageUrl}
                                  alt=""
                                  className="size-full object-cover"
                                />
                              ) : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm text-slate-900 truncate">
                                {p.name}
                              </p>
                              <p className="text-xs text-slate-500">{p.sku}</p>
                            </div>
                            {already && (
                              <Badge variant="secondary" className="text-[10px]">
                                Added
                              </Badge>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                  <div className="flex justify-end">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPickerOpen(false);
                        setPickerQ("");
                      }}
                    >
                      Done adding
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saveMut.isPending || !canSave}
            data-testid="finish-products-save"
          >
            {saveMut.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
