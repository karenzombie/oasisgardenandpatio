import { useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Power, X } from "lucide-react";
import {
  useAdminListSets,
  useAdminCreateSet,
  useAdminSetSetActive,
  useAdminListManufacturers,
  getAdminListSetsQueryKey,
  type AdminSetSummary,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
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
import { SortableHeader, sortRows, toggleSort, type SortState } from "../../lib/sortable";

type SetsSortKey = "name" | "sku" | "manufacturerName" | "itemCount" | "setPrice";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const NO_MANUFACTURER = "__none__";

interface FormState {
  name: string;
  slug: string;
  slugTouched: boolean;
  sku: string;
  description: string;
  manufacturerId: string;
  setPrice: string;
  displayOrder: string;
  isActive: boolean;
}

function emptyForm(): FormState {
  return {
    name: "",
    slug: "",
    slugTouched: false,
    sku: "",
    description: "",
    manufacturerId: NO_MANUFACTURER,
    setPrice: "",
    displayOrder: "0",
    isActive: true,
  };
}

function formatMoney(s: string | null): string {
  if (!s) return "—";
  const n = Number(s);
  if (!Number.isFinite(n)) return s;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export default function Sets() {
  const qc = useQueryClient();
  const toast = useToast();
  const [, navigate] = useLocation();
  const list = useAdminListSets({
    query: { queryKey: getAdminListSetsQueryKey(), staleTime: 10_000 },
  });
  const mfgList = useAdminListManufacturers();
  const createMut = useAdminCreateSet();
  const setActiveMut = useAdminSetSetActive();

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] =
    useState<AdminSetSummary | null>(null);
  const [sort, setSort] = useState<SortState<SetsSortKey>>({ by: null, order: "desc" });

  const rows = list.data ?? [];
  const manufacturers = mfgList.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = rows
      .filter((r) => (showInactive ? true : r.isActive))
      .filter((r) => {
        if (!q) return true;
        return (
          r.name.toLowerCase().includes(q) ||
          r.slug.toLowerCase().includes(q) ||
          (r.sku ?? "").toLowerCase().includes(q) ||
          (r.manufacturerName ?? "").toLowerCase().includes(q)
        );
      });
    return sortRows(base, sort, (row, key) => row[key]);
  }, [rows, search, showInactive, sort]);

  const handleSort = (key: SetsSortKey) => setSort((prev) => toggleSort(prev, key));

  function openCreate(): void {
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  }

  async function handleSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    const slug = (form.slug || slugify(name)).trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setError(
        "Slug must be lowercase letters, numbers, and dashes only (e.g. patio-dining-5pc)",
      );
      return;
    }
    const displayOrder = Number(form.displayOrder);
    if (!Number.isFinite(displayOrder) || !Number.isInteger(displayOrder)) {
      setError("Display order must be a whole number");
      return;
    }
    let setPrice: string | null = null;
    if (form.setPrice.trim()) {
      if (!/^\d+(\.\d{1,2})?$/.test(form.setPrice.trim())) {
        setError("Set price must be a number like 1299.00");
        return;
      }
      setPrice = form.setPrice.trim();
    }
    const manufacturerId =
      form.manufacturerId === NO_MANUFACTURER
        ? null
        : Number(form.manufacturerId);

    try {
      const created = await createMut.mutateAsync({
        data: {
          name,
          slug,
          sku: form.sku.trim() || null,
          description: form.description.trim() || null,
          manufacturerId,
          setPrice,
          displayOrder,
          isActive: form.isActive,
        },
      });
      await qc.invalidateQueries({ queryKey: getAdminListSetsQueryKey() });
      toast.toast({ title: "Set created", description: name });
      setOpen(false);
      // Send the user straight into the items editor
      if (created && typeof created.id === "number") {
        navigate(`/admin/sets/${created.id}`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create set";
      setError(msg);
    }
  }

  async function toggleActive(row: AdminSetSummary): Promise<void> {
    try {
      await setActiveMut.mutateAsync({
        id: row.id,
        data: { isActive: !row.isActive },
      });
      await qc.invalidateQueries({ queryKey: getAdminListSetsQueryKey() });
      toast.toast({
        title: row.isActive ? "Set deactivated" : "Set activated",
        description: row.name,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update";
      toast.toast({
        title: "Update failed",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setConfirmDeactivate(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Product Sets"
        subtitle="Bundle products together (e.g. dining sets) for quoting and the storefront."
        action={
          <Button onClick={openCreate}>
            <Plus className="size-4 mr-1.5" />
            Add Set
          </Button>
        }
      />
      <PageBody>
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
            <Input
              placeholder="Search by name, slug, SKU, vendor…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8"
            />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Switch
              checked={showInactive}
              onCheckedChange={setShowInactive}
            />
            Show inactive
          </label>
        </div>

        <div className="bg-white rounded-lg border border-slate-200 overflow-x-auto">
          {list.isLoading ? (
            <div className="p-12 flex justify-center">
              <Spinner />
            </div>
          ) : list.isError ? (
            <div className="p-8 text-center text-sm text-rose-600">
              Failed to load sets. Try refreshing.
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              {rows.length === 0
                ? "No sets yet. Click \u201CAdd Set\u201D to create your first bundle."
                : "No sets match your filters."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                <tr>
                  <SortableHeader sortKey="name" state={sort} onSort={handleSort} className="font-medium px-4 py-2.5">Name</SortableHeader>
                  <SortableHeader sortKey="sku" state={sort} onSort={handleSort} className="font-medium px-4 py-2.5">SKU</SortableHeader>
                  <SortableHeader sortKey="manufacturerName" state={sort} onSort={handleSort} className="font-medium px-4 py-2.5">Vendor</SortableHeader>
                  <SortableHeader sortKey="itemCount" state={sort} onSort={handleSort} align="right" className="font-medium px-4 py-2.5">Items</SortableHeader>
                  <SortableHeader sortKey="setPrice" state={sort} onSort={handleSort} align="right" className="font-medium px-4 py-2.5">Price</SortableHeader>
                  <th className="text-center font-medium px-4 py-2.5">
                    Status
                  </th>
                  <th className="text-right font-medium px-4 py-2.5 w-[140px]">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-slate-100 hover:bg-slate-50/60"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {row.name}
                      </div>
                      <div className="text-xs text-slate-500">/{row.slug}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.sku ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {row.manufacturerName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {row.itemCount}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatMoney(row.setPrice)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {row.isActive ? (
                        <Badge variant="secondary">Active</Badge>
                      ) : (
                        <Badge variant="outline" className="text-slate-500">
                          Inactive
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/admin/sets/${row.id}`)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            row.isActive
                              ? setConfirmDeactivate(row)
                              : void toggleActive(row)
                          }
                          title={row.isActive ? "Deactivate" : "Activate"}
                        >
                          <Power
                            className={`size-4 ${
                              row.isActive ? "text-amber-600" : "text-slate-400"
                            }`}
                          />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </PageBody>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>New Product Set</DialogTitle>
            <DialogDescription>
              Create the set first, then add products on the next screen.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((f) => ({
                    ...f,
                    name: v,
                    slug: f.slugTouched ? f.slug : slugify(v),
                  }));
                }}
                placeholder="Patio Dining 5-piece"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    slug: e.target.value,
                    slugTouched: true,
                  }))
                }
                placeholder="patio-dining-5pc"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sku">Bundle SKU</Label>
                <Input
                  id="sku"
                  value={form.sku}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sku: e.target.value }))
                  }
                  placeholder="optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setPrice">Bundle Price</Label>
                <Input
                  id="setPrice"
                  inputMode="decimal"
                  value={form.setPrice}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, setPrice: e.target.value }))
                  }
                  placeholder="optional, e.g. 1299.00"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manufacturerId">Vendor</Label>
              <Select
                value={form.manufacturerId}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, manufacturerId: v }))
                }
              >
                <SelectTrigger id="manufacturerId">
                  <SelectValue placeholder="Select vendor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MANUFACTURER}>
                    — None —
                  </SelectItem>
                  {manufacturers.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
                placeholder="Optional marketing copy for this bundle"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="displayOrder">Display order</Label>
                <Input
                  id="displayOrder"
                  type="number"
                  value={form.displayOrder}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, displayOrder: e.target.value }))
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 mt-6">
                <Switch
                  checked={form.isActive}
                  onCheckedChange={(v) =>
                    setForm((f) => ({ ...f, isActive: v }))
                  }
                />
                Active
              </label>
            </div>

            {error && (
              <div className="text-sm text-rose-600 flex items-start gap-1.5">
                <X className="size-4 mt-0.5 shrink-0" />
                {error}
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? "Creating…" : "Create & Add Items"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDeactivate !== null}
        onOpenChange={(v) => !v && setConfirmDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate this set?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeactivate?.name} will be hidden from the storefront.
              You can reactivate it any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeactivate) void toggleActive(confirmDeactivate);
              }}
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
