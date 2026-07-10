import { useMemo, useState, useRef, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Pencil, Plus, Search, X } from "lucide-react";
import {
  useAdminListFabrics,
  useAdminCreateFabric,
  useAdminUpdateFabric,
  useAdminListManufacturers,
  getAdminListFabricsQueryKey,
  type AdminFabric,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

interface FabricFormState {
  manufacturerId: string;
  itemNumber: string;
  name: string;
  grade: string;
  colorFamily: string;
  notes: string;
  isStripe: boolean;
  swatchImageUrl: string;
  isActive: boolean;
  displayOrder: string;
  // When the fabric's real itemNumber is a system-generated placeholder
  // (Homecrest "HC-" prefix), we hide it from staff and blank the input.
  // If staff leaves it blank on save, we fall back to this original value
  // instead of failing "Item number is required."
  placeholderItemNumber: string | null;
  availabilityCodes: string | null;
}

// Homecrest generates system placeholder item numbers (prefix "HC-") for
// fabrics with no real manufacturer catalog number. Never expose these to
// staff — they could be mistakenly sent to a vendor. Additive/conditional:
// only affects Homecrest rows, no other manufacturer uses this prefix.
function isPlaceholderItemNumber(itemNumber: string): boolean {
  return itemNumber.startsWith("HC-");
}

const AVAILABILITY_LABELS: Record<string, string> = {
  A: "Air",
  S: "Sling",
  PS: "Padded Sling",
  C: "Cushion",
  U: "Umbrella",
  V: "Vintage Wire",
  W: "Welt",
};

function formatAvailabilityCodes(codes: string | null): string {
  if (!codes) return "";
  return codes
    .split("|")
    .map((c) => AVAILABILITY_LABELS[c.trim()] ?? c.trim())
    .join(", ");
}

const GRADE_OPTIONS = ["A", "B", "C", "AA", "BB"] as const;
const COLOR_FAMILY_OPTIONS = [
  "Beige",
  "Black",
  "Blue",
  "Brown",
  "Gray",
  "Green",
  "Multicolor",
  "Navy",
  "Orange",
  "Pink",
  "Red",
  "Teal",
  "White",
  "Yellow",
] as const;
const ALL_COLOR_FAMILIES = "__all_colors__";

function emptyForm(mfgId?: string): FabricFormState {
  return {
    manufacturerId: mfgId ?? "",
    itemNumber: "",
    name: "",
    grade: "",
    colorFamily: "",
    notes: "",
    isStripe: false,
    swatchImageUrl: "",
    isActive: true,
    displayOrder: "0",
    placeholderItemNumber: null,
    availabilityCodes: null,
  };
}

function formFromFabric(f: AdminFabric): FabricFormState {
  const placeholder = isPlaceholderItemNumber(f.itemNumber) ? f.itemNumber : null;
  return {
    manufacturerId: String(f.manufacturerId),
    itemNumber: placeholder ? "" : f.itemNumber,
    name: f.name,
    grade: f.grade ?? "",
    colorFamily: f.colorFamily ?? "",
    notes: f.notes ?? "",
    isStripe: f.isStripe,
    swatchImageUrl: f.swatchImageUrl ?? "",
    isActive: f.isActive,
    displayOrder: String(f.displayOrder),
    placeholderItemNumber: placeholder,
    availabilityCodes: f.availabilityCodes,
  };
}

export default function Fabrics() {
  const qc = useQueryClient();
  const toast = useToast();

  const list = useAdminListFabrics();
  const mfgList = useAdminListManufacturers();
  const createMut = useAdminCreateFabric();
  const updateMut = useAdminUpdateFabric();

  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState(ALL_VENDORS);
  const [colorFilter, setColorFilter] = useState(ALL_COLOR_FAMILIES);
  const [stripeFilter, setStripeFilter] = useState<"all" | "stripe" | "solid">("all");

  const [editing, setEditing] = useState<AdminFabric | "new" | null>(null);
  const [form, setForm] = useState<FabricFormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [swatchUploading, setSwatchUploading] = useState(false);
  const swatchRef = useRef<HTMLInputElement>(null);

  const fabrics = list.data ?? [];
  const manufacturers = mfgList.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fabrics.filter((f) => {
      if (vendorFilter !== ALL_VENDORS && String(f.manufacturerId) !== vendorFilter) return false;
      if (colorFilter !== ALL_COLOR_FAMILIES && (f.colorFamily ?? "").toLowerCase() !== colorFilter.toLowerCase()) return false;
      if (stripeFilter === "stripe" && !f.isStripe) return false;
      if (stripeFilter === "solid" && f.isStripe) return false;
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        f.itemNumber.toLowerCase().includes(q) ||
        f.manufacturerName.toLowerCase().includes(q)
      );
    });
  }, [fabrics, search, vendorFilter, colorFilter, stripeFilter]);

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
    const trimmedItemNumber = form.itemNumber.trim();
    let itemNumber: string;
    if (trimmedItemNumber) {
      itemNumber = trimmedItemNumber;
    } else if (form.placeholderItemNumber) {
      // Staff left the hidden placeholder field blank — keep the original
      // system-generated placeholder unchanged rather than failing.
      itemNumber = form.placeholderItemNumber;
    } else {
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
      grade: form.grade || null,
      colorFamily: form.colorFamily || null,
      notes: form.notes.trim() || null,
      isStripe: form.isStripe,
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
            <SelectTrigger className="w-[200px]">
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
          <Select value={colorFilter} onValueChange={setColorFilter}>
            <SelectTrigger className="w-[170px]">
              <SelectValue placeholder="All colors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_COLOR_FAMILIES}>All colors</SelectItem>
              {COLOR_FAMILY_OPTIONS.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stripeFilter} onValueChange={(v) => setStripeFilter(v as "all" | "stripe" | "solid")}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Pattern" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Stripe & solid</SelectItem>
              <SelectItem value="stripe">Stripe only</SelectItem>
              <SelectItem value="solid">Solid only</SelectItem>
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
                  <th className="px-4 py-3 font-semibold text-center">Grade</th>
                  <th className="px-4 py-3 font-semibold">Color</th>
                  <th className="px-4 py-3 font-semibold text-center">Stripe</th>
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
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-600">
                      {isPlaceholderItemNumber(f.itemNumber) ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        f.itemNumber
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-slate-900">{f.name}</td>
                    <td className="px-4 py-2.5 text-slate-600">{f.manufacturerName}</td>
                    <td className="px-4 py-2.5 text-center">
                      {f.grade ? (
                        <span className="inline-flex items-center justify-center size-6 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
                          {f.grade}
                        </span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">
                      {f.colorFamily ? (
                        <span className="text-xs">{f.colorFamily}</span>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      {f.isStripe ? (
                        <Badge variant="secondary" className="text-xs">Stripe</Badge>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
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
          {editing !== "new" && !form.isActive && (
            <div className="flex items-start gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
              <AlertTriangle className="size-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-amber-800 text-sm">Inactive</p>
                <p className="text-amber-700 text-xs mt-0.5">This fabric is hidden from all customer-facing pages. Toggle "Active" below to re-enable it.</p>
              </div>
            </div>
          )}
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
                  placeholder={form.placeholderItemNumber ? "No catalog number — enter one if available" : "e.g. 5476-0000"}
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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="fab-name">Name *</Label>
                <Input
                  id="fab-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Spectrum Graphite"
                />
              </div>
              <div className="space-y-1.5 col-span-1">
                <Label htmlFor="fab-grade">Grade</Label>
                <Select
                  value={form.grade}
                  onValueChange={(v) => setForm((f) => ({ ...f, grade: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger id="fab-grade">
                    <SelectValue placeholder="— Unset" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Unset</SelectItem>
                    {GRADE_OPTIONS.map((g) => (
                      <SelectItem key={g} value={g}>Grade {g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="fab-color">Color family</Label>
                <Select
                  value={form.colorFamily}
                  onValueChange={(v) => setForm((f) => ({ ...f, colorFamily: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger id="fab-color">
                    <SelectValue placeholder="— Unset" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— Unset</SelectItem>
                    {COLOR_FAMILY_OPTIONS.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="fab-stripe" className="block">Pattern</Label>
                <div className="flex items-center gap-2 h-10">
                  <Switch
                    id="fab-stripe"
                    checked={form.isStripe}
                    onCheckedChange={(v) => setForm((f) => ({ ...f, isStripe: v }))}
                  />
                  <Label htmlFor="fab-stripe" className="cursor-pointer text-sm font-normal">
                    Stripe fabric
                  </Label>
                </div>
                <p className="text-xs text-slate-400">
                  Stripe fabrics will eventually require paired-umbrella orders.
                </p>
              </div>
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

            {form.availabilityCodes && (
              <div className="space-y-1.5">
                <Label>Available For</Label>
                <p className="text-sm text-slate-600 border border-slate-200 rounded-md bg-slate-50 px-3 py-2">
                  {formatAvailabilityCodes(form.availabilityCodes)}
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="fab-notes">Notes</Label>
              <Textarea
                id="fab-notes"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Customer-facing note shown on the product page (e.g. special-order lead time)."
                rows={3}
              />
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

    </>
  );
}

