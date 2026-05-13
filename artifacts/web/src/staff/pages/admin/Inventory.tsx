import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Boxes,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Power,
  Search,
  Star,
  StarOff,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {
  useAdminListInventory,
  useAdminListInventoryAdjustments,
  useAdminAdjustInventory,
  useAdminListInventoryLocations,
  useAdminCreateInventoryLocation,
  useAdminUpdateInventoryLocation,
  useAdminSetInventoryLocationActive,
  useAdminSetInventoryLocationDefault,
  useAdminListManufacturers,
  useAdminListCategories,
  getAdminListInventoryQueryKey,
  getAdminListInventoryAdjustmentsQueryKey,
  getAdminListInventoryLocationsQueryKey,
  type AdminInventoryItem,
  type InventoryLocation,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";
import { getStaffObjectUrl } from "../../lib/upload";
import { SortableHeader, toggleSort, type SortState } from "../../lib/sortable";

type InventorySortKey = "name" | "sku" | "manufacturer" | "category" | "onHand" | "onOrder";

const PAGE_SIZE = 25;
const ANY = "any";

const ADJUSTMENT_TYPES: Array<{ value: string; label: string }> = [
  { value: "cycle_count", label: "Cycle count" },
  { value: "damage", label: "Damage" },
  { value: "loss", label: "Loss / Theft" },
  { value: "found", label: "Found" },
  { value: "transfer", label: "Transfer" },
  { value: "return", label: "Customer return" },
  { value: "manual_correction", label: "Manual correction" },
  { value: "other", label: "Other" },
];

function adjustmentTypeLabel(value: string): string {
  return ADJUSTMENT_TYPES.find((t) => t.value === value)?.label ?? value;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function StatusPill({ status }: { status: AdminInventoryItem["status"] }) {
  if (status === "out_of_stock") {
    return (
      <Badge variant="destructive" className="font-normal">
        Out of stock
      </Badge>
    );
  }
  if (status === "low_stock") {
    return (
      <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal">
        Low stock
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal">
      In stock
    </Badge>
  );
}

export default function Inventory() {
  const [tab, setTab] = useState<"levels" | "adjustments" | "locations">(
    "levels",
  );

  return (
    <>
      <PageHeader title="Inventory" />
      <PageBody>
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="levels">
              <Boxes className="size-4 mr-1.5" />
              Levels
            </TabsTrigger>
            <TabsTrigger value="adjustments">
              <Clock className="size-4 mr-1.5" />
              Adjustments
            </TabsTrigger>
            <TabsTrigger value="locations">
              <MapPin className="size-4 mr-1.5" />
              Locations
            </TabsTrigger>
          </TabsList>

          <TabsContent value="levels" className="mt-6">
            <LevelsTab />
          </TabsContent>
          <TabsContent value="adjustments" className="mt-6">
            <AdjustmentsTab />
          </TabsContent>
          <TabsContent value="locations" className="mt-6">
            <LocationsTab />
          </TabsContent>
        </Tabs>
      </PageBody>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Levels tab
// ──────────────────────────────────────────────────────────────────────────

function LevelsTab() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ANY);
  const [manufacturerId, setManufacturerId] = useState<string>(ANY);
  const [categoryId, setCategoryId] = useState<string>(ANY);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState<InventorySortKey>>({ by: null, order: "desc" });
  const [adjustTarget, setAdjustTarget] = useState<AdminInventoryItem | null>(
    null,
  );

  const handleSort = (key: InventorySortKey) => {
    setSort((prev) => toggleSort(prev, key));
    setPage(1);
  };

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = useMemo(() => {
    const p: Record<string, string | number | boolean> = {
      page,
      pageSize: PAGE_SIZE,
    };
    if (search) p["q"] = search;
    if (statusFilter !== ANY) p["status"] = statusFilter;
    if (manufacturerId !== ANY) p["manufacturerId"] = Number(manufacturerId);
    if (categoryId !== ANY) p["categoryId"] = Number(categoryId);
    if (sort.by) {
      p["sortBy"] = sort.by;
      p["sortOrder"] = sort.order;
    }
    return p;
  }, [search, statusFilter, manufacturerId, categoryId, page, sort]);

  const list = useAdminListInventory(params as never);
  const mfgList = useAdminListManufacturers();
  const catList = useAdminListCategories();

  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE))
    : 1;

  return (
    <>
      <div className="bg-white rounded-lg border p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <Input
              placeholder="Search name, SKU, slug…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All statuses</SelectItem>
              <SelectItem value="in_stock">In stock</SelectItem>
              <SelectItem value="low_stock">Low stock</SelectItem>
              <SelectItem value="out_of_stock">Out of stock</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={manufacturerId}
            onValueChange={(v) => {
              setManufacturerId(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All vendors" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All vendors</SelectItem>
              {(mfgList.data ?? []).map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={categoryId}
            onValueChange={(v) => {
              setCategoryId(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All categories</SelectItem>
              {(catList.data ?? []).map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        {list.isLoading ? (
          <div className="p-12 flex justify-center">
            <Spinner />
          </div>
        ) : list.isError ? (
          <div className="p-6 text-sm text-rose-600">
            Failed to load inventory.
          </div>
        ) : list.data && list.data.items.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No products match the current filters.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <SortableHeader sortKey="name" state={sort} onSort={handleSort} className="px-4 py-3 font-semibold">Product</SortableHeader>
                <SortableHeader sortKey="sku" state={sort} onSort={handleSort} className="px-4 py-3 font-semibold">SKU</SortableHeader>
                <th className="px-4 py-3 font-semibold">Variant</th>
                <th className="px-4 py-3 font-semibold">Fabric</th>
                <SortableHeader sortKey="manufacturer" state={sort} onSort={handleSort} className="px-4 py-3 font-semibold">Vendor</SortableHeader>
                <SortableHeader sortKey="category" state={sort} onSort={handleSort} className="px-4 py-3 font-semibold">Category</SortableHeader>
                <SortableHeader sortKey="onHand" state={sort} onSort={handleSort} align="right" className="px-4 py-3 font-semibold">On hand</SortableHeader>
                <SortableHeader sortKey="onOrder" state={sort} onSort={handleSort} align="right" className="px-4 py-3 font-semibold">On order</SortableHeader>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(list.data?.items ?? []).map((row) => {
                const thumbUrl = getStaffObjectUrl(row.primaryImageUrl);
                // Each (product, variant, fabric) tuple is a unique SKU row;
                // include all three in the React key so multiple inventory
                // rows for the same product don't collide.
                const rowKey = `${row.productId}:${row.variantId ?? "_"}:${row.fabricId ?? "_"}`;
                return (
                  <tr key={rowKey} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-10 rounded bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                          {thumbUrl ? (
                            <img
                              src={thumbUrl}
                              alt=""
                              className="size-full object-cover"
                            />
                          ) : (
                            <Boxes className="size-4 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-slate-900 truncate">
                            {row.name}
                          </div>
                          {!row.isActive && (
                            <div className="text-xs text-slate-400">
                              Inactive
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">
                      {row.sku}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.variantName ? (
                        <span>
                          {row.variantName}
                          {row.variantSku && (
                            <span className="ml-1 font-mono text-xs text-slate-400">
                              {row.variantSku}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.fabricName ? (
                        <span>
                          {row.fabricName}
                          {row.fabricItemNumber && (
                            <span className="ml-1 font-mono text-xs text-slate-400">
                              {row.fabricItemNumber}
                            </span>
                          )}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.manufacturerName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.categoryName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium">
                      {row.onHand}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-500">
                      {row.onOrder > 0 ? row.onOrder : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <StatusPill status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setAdjustTarget(row)}
                      >
                        Adjust
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {list.data && list.data.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50 text-sm text-slate-600">
            <div>
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, list.data.total)} of{" "}
              {list.data.total}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="tabular-nums">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      <AdjustDialog
        target={adjustTarget}
        onClose={() => setAdjustTarget(null)}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Adjust dialog (shared)
// ──────────────────────────────────────────────────────────────────────────

function AdjustDialog({
  target,
  onClose,
}: {
  target: AdminInventoryItem | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const locationsList = useAdminListInventoryLocations();
  const adjustMut = useAdminAdjustInventory();

  const activeLocations = (locationsList.data ?? []).filter((l) => l.isActive);
  const defaultLocation = activeLocations.find((l) => l.isDefault) ?? null;

  const [locationId, setLocationId] = useState<string>("");
  const [adjustmentType, setAdjustmentType] = useState<string>("cycle_count");
  // Two adjustment modes: "delta" applies a signed change (e.g. -2 for damage,
  // +5 for found stock); "absolute" sets the on-hand to an exact value, which
  // is what staff want during a manual cycle-count audit.
  const [mode, setMode] = useState<"delta" | "absolute">("delta");
  const [quantityChange, setQuantityChange] = useState<string>("");
  const [setOnHandValue, setSetOnHandValue] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Reset / hydrate when opening for a new product.
  useEffect(() => {
    if (target) {
      setLocationId(defaultLocation ? String(defaultLocation.id) : "");
      setAdjustmentType("cycle_count");
      setMode("delta");
      setQuantityChange("");
      setSetOnHandValue(String(target.onHand));
      setReason("");
      setError(null);
    }
  }, [target, defaultLocation]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!target) return;

    let computedDelta = 0;
    const payload: {
      productId: number;
      variantId: number | null;
      fabricId: number | null;
      locationId: number | null;
      adjustmentType: string;
      quantityChange?: number | null;
      setOnHand?: number | null;
      reason: string | null;
    } = {
      productId: target.productId,
      variantId: target.variantId,
      fabricId: target.fabricId,
      locationId: locationId ? Number(locationId) : null,
      adjustmentType,
      reason: reason.trim() || null,
    };

    if (mode === "delta") {
      const delta = Number(quantityChange);
      if (!Number.isInteger(delta) || delta === 0) {
        setError("Quantity change must be a non-zero integer.");
        return;
      }
      if (target.onHand + delta < 0) {
        setError(
          `Cannot reduce by ${Math.abs(delta)} — only ${target.onHand} on hand.`,
        );
        return;
      }
      payload.quantityChange = delta;
      computedDelta = delta;
    } else {
      const target_ = Number(setOnHandValue);
      if (!Number.isInteger(target_) || target_ < 0) {
        setError("Set-to value must be a non-negative integer.");
        return;
      }
      payload.setOnHand = target_;
      computedDelta = target_ - target.onHand;
    }

    try {
      await adjustMut.mutateAsync({
        data: payload as never,
      });
      await qc.invalidateQueries({
        queryKey: getAdminListInventoryQueryKey(),
      });
      await qc.invalidateQueries({
        queryKey: getAdminListInventoryAdjustmentsQueryKey(),
      });
      const newOH = target.onHand + computedDelta;
      toast.toast({
        title: "Inventory adjusted",
        description: `${target.name}: ${computedDelta > 0 ? "+" : ""}${computedDelta} (now ${newOH})`,
      });
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "Failed to apply adjustment.";
      setError(msg);
    }
  }

  const open = target !== null;
  const previewDelta =
    mode === "delta"
      ? Number.isFinite(Number(quantityChange))
        ? Number(quantityChange)
        : 0
      : Number.isFinite(Number(setOnHandValue))
        ? Number(setOnHandValue) - (target?.onHand ?? 0)
        : 0;
  const newOnHand = target
    ? mode === "delta"
      ? target.onHand + previewDelta
      : Number.isFinite(Number(setOnHandValue))
        ? Number(setOnHandValue)
        : target.onHand
    : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Adjust inventory</DialogTitle>
          <DialogDescription>
            {target ? (
              <span>
                <span className="font-medium">{target.name}</span>
                {target.variantName && (
                  <> · variant <span className="font-medium">{target.variantName}</span></>
                )}
                {target.fabricName && (
                  <> · fabric <span className="font-medium">{target.fabricName}</span></>
                )}
                {" — currently "}
                <span className="font-medium">{target.onHand}</span> on hand
              </span>
            ) : (
              ""
            )}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="adj-location">Location</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="adj-location">
                <SelectValue placeholder="Select a location" />
              </SelectTrigger>
              <SelectContent>
                {activeLocations.length === 0 && (
                  <SelectItem value="__none__" disabled>
                    No active locations
                  </SelectItem>
                )}
                {activeLocations.map((l) => (
                  <SelectItem key={l.id} value={String(l.id)}>
                    {l.name}
                    {l.isDefault ? " (default)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="adj-type">Reason category</Label>
            <Select value={adjustmentType} onValueChange={setAdjustmentType}>
              <SelectTrigger id="adj-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ADJUSTMENT_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Mode</Label>
            <div className="mt-1 flex gap-2">
              <Button
                type="button"
                variant={mode === "delta" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("delta")}
              >
                Adjust by (+/-)
              </Button>
              <Button
                type="button"
                variant={mode === "absolute" ? "default" : "outline"}
                size="sm"
                onClick={() => setMode("absolute")}
              >
                Set to (audit)
              </Button>
            </div>
          </div>
          {mode === "delta" ? (
            <div>
              <Label htmlFor="adj-qty">Quantity change (+/-)</Label>
              <Input
                id="adj-qty"
                type="number"
                step={1}
                placeholder="e.g. -2 or 5"
                value={quantityChange}
                onChange={(e) => setQuantityChange(e.target.value)}
                autoFocus
              />
              {target && quantityChange.trim() !== "" && (
                <div className="mt-1.5 text-xs text-slate-600">
                  New on-hand: <span className="font-medium">{newOnHand}</span>
                </div>
              )}
            </div>
          ) : (
            <div>
              <Label htmlFor="adj-set">Set on-hand to</Label>
              <Input
                id="adj-set"
                type="number"
                step={1}
                min={0}
                placeholder="exact count"
                value={setOnHandValue}
                onChange={(e) => setSetOnHandValue(e.target.value)}
                autoFocus
              />
              {target && setOnHandValue.trim() !== "" && (
                <div className="mt-1.5 text-xs text-slate-600">
                  Recorded delta:{" "}
                  <span className="font-medium">
                    {previewDelta > 0 ? "+" : ""}
                    {previewDelta}
                  </span>
                </div>
              )}
            </div>
          )}
          <div>
            <Label htmlFor="adj-reason">Notes (optional)</Label>
            <Textarea
              id="adj-reason"
              placeholder="e.g. Damaged in delivery, customer returned, etc."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={adjustMut.isPending}>
              {adjustMut.isPending ? "Applying…" : "Apply adjustment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Adjustments tab (audit trail)
// ──────────────────────────────────────────────────────────────────────────

function AdjustmentsTab() {
  const [locationId, setLocationId] = useState<string>(ANY);
  const [type, setType] = useState<string>(ANY);
  const [page, setPage] = useState(1);

  const params = useMemo(() => {
    const p: Record<string, string | number> = {
      page,
      pageSize: PAGE_SIZE,
    };
    if (locationId !== ANY) p["locationId"] = Number(locationId);
    if (type !== ANY) p["type"] = type;
    return p;
  }, [locationId, type, page]);

  const list = useAdminListInventoryAdjustments(params as never);
  const locationsList = useAdminListInventoryLocations();

  const totalPages = list.data
    ? Math.max(1, Math.ceil(list.data.total / PAGE_SIZE))
    : 1;

  return (
    <>
      <div className="bg-white rounded-lg border p-4 mb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Select
            value={locationId}
            onValueChange={(v) => {
              setLocationId(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All locations" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All locations</SelectItem>
              {(locationsList.data ?? []).map((l) => (
                <SelectItem key={l.id} value={String(l.id)}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v);
              setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="All types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY}>All types</SelectItem>
              {ADJUSTMENT_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        {list.isLoading ? (
          <div className="p-12 flex justify-center">
            <Spinner />
          </div>
        ) : list.isError ? (
          <div className="p-6 text-sm text-rose-600">
            Failed to load adjustments.
          </div>
        ) : list.data && list.data.adjustments.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No adjustments recorded yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">When</th>
                <th className="px-4 py-3 font-semibold">Product</th>
                <th className="px-4 py-3 font-semibold">Type</th>
                <th className="px-4 py-3 font-semibold text-right">Change</th>
                <th className="px-4 py-3 font-semibold text-right">After</th>
                <th className="px-4 py-3 font-semibold">Location</th>
                <th className="px-4 py-3 font-semibold">By</th>
                <th className="px-4 py-3 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(list.data?.adjustments ?? []).map((a) => {
                const isPositive = a.quantityChange > 0;
                return (
                  <tr key={a.id} className="hover:bg-slate-50 align-top">
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {formatTimestamp(a.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">
                        {a.productName}
                      </div>
                      <div className="font-mono text-xs text-slate-500">
                        {a.productSku}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {adjustmentTypeLabel(a.adjustmentType)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right tabular-nums font-medium ${
                        isPositive ? "text-emerald-700" : "text-rose-700"
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {isPositive ? (
                          <TrendingUp className="size-3.5" />
                        ) : (
                          <TrendingDown className="size-3.5" />
                        )}
                        {isPositive ? "+" : ""}
                        {a.quantityChange}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {a.quantityAfter ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {a.locationName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {a.performedByName ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-600 max-w-xs">
                      {a.reason ?? ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {list.data && list.data.total > 0 && (
          <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50 text-sm text-slate-600">
            <div>
              Showing {(page - 1) * PAGE_SIZE + 1}–
              {Math.min(page * PAGE_SIZE, list.data.total)} of{" "}
              {list.data.total}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <span className="tabular-nums">
                Page {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Locations tab
// ──────────────────────────────────────────────────────────────────────────

function LocationsTab() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useAdminListInventoryLocations();
  const setActive = useAdminSetInventoryLocationActive();
  const setDefault = useAdminSetInventoryLocationDefault();
  const [editing, setEditing] = useState<InventoryLocation | "new" | null>(
    null,
  );

  async function refetch() {
    await qc.invalidateQueries({
      queryKey: getAdminListInventoryLocationsQueryKey(),
    });
  }

  async function handleToggleActive(loc: InventoryLocation, next: boolean) {
    try {
      await setActive.mutateAsync({
        id: loc.id,
        data: { isActive: next },
      });
      await refetch();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to update location.";
      toast.toast({
        title: "Could not update location",
        description: msg,
        variant: "destructive",
      });
    }
  }

  async function handleSetDefault(loc: InventoryLocation) {
    try {
      await setDefault.mutateAsync({ id: loc.id });
      await refetch();
      toast.toast({
        title: "Default location updated",
        description: `${loc.name} is now the default.`,
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to set default.";
      toast.toast({
        title: "Could not set default",
        description: msg,
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <Button onClick={() => setEditing("new")}>
          <Plus className="size-4 mr-1.5" />
          Add location
        </Button>
      </div>

      <div className="bg-white rounded-lg border overflow-x-auto">
        {list.isLoading ? (
          <div className="p-12 flex justify-center">
            <Spinner />
          </div>
        ) : list.isError ? (
          <div className="p-6 text-sm text-rose-600">
            Failed to load locations.
          </div>
        ) : list.data && list.data.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500">
            No locations yet.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Address</th>
                <th className="px-4 py-3 font-semibold">Default</th>
                <th className="px-4 py-3 font-semibold">Active</th>
                <th className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {(list.data ?? []).map((loc) => (
                <tr key={loc.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {loc.name}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {loc.code ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {loc.address ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    {loc.isDefault ? (
                      <Badge className="bg-sky-100 text-sky-800 hover:bg-sky-100 font-normal">
                        <Star className="size-3 mr-1" />
                        Default
                      </Badge>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Switch
                      checked={loc.isActive}
                      onCheckedChange={(v) => handleToggleActive(loc, v)}
                      disabled={loc.isDefault && loc.isActive}
                      aria-label={`Toggle ${loc.name} active`}
                    />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      {!loc.isDefault && loc.isActive && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleSetDefault(loc)}
                        >
                          <StarOff className="size-3.5 mr-1" />
                          Set default
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setEditing(loc)}
                      >
                        <Pencil className="size-3.5 mr-1" />
                        Edit
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <LocationDialog
        target={editing}
        onClose={() => setEditing(null)}
        onSaved={refetch}
      />
    </>
  );
}

function LocationDialog({
  target,
  onClose,
  onSaved,
}: {
  target: InventoryLocation | "new" | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const toast = useToast();
  const createMut = useAdminCreateInventoryLocation();
  const updateMut = useAdminUpdateInventoryLocation();

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const isEdit = target && target !== "new";

  useEffect(() => {
    if (target === "new") {
      setName("");
      setCode("");
      setAddress("");
      setIsActive(true);
      setError(null);
    } else if (target) {
      setName(target.name);
      setCode(target.code ?? "");
      setAddress(target.address ?? "");
      setIsActive(target.isActive);
      setError(null);
    }
  }, [target]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Name is required.");
      return;
    }
    try {
      if (target && target !== "new") {
        await updateMut.mutateAsync({
          id: target.id,
          data: {
            name: name.trim(),
            code: code.trim() || null,
            address: address.trim() || null,
          },
        });
      } else {
        await createMut.mutateAsync({
          data: {
            name: name.trim(),
            code: code.trim() || null,
            address: address.trim() || null,
            isActive,
          },
        });
      }
      await onSaved();
      toast.toast({
        title: isEdit ? "Location updated" : "Location created",
      });
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to save location.";
      setError(msg);
    }
  }

  const open = target !== null;
  const pending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit location" : "Add location"}
          </DialogTitle>
          <DialogDescription>
            Locations are referenced when recording inventory adjustments and
            receipts.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label htmlFor="loc-name">Name</Label>
            <Input
              id="loc-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="loc-code">Code (optional, must be unique)</Label>
            <Input
              id="loc-code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. MAIN, SHOWROOM"
            />
          </div>
          <div>
            <Label htmlFor="loc-address">Address (optional)</Label>
            <Textarea
              id="loc-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={2}
            />
          </div>
          {!isEdit && (
            <div className="flex items-center justify-between">
              <Label htmlFor="loc-active">Active on creation</Label>
              <Switch
                id="loc-active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
          )}
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Create location"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Suppress unused-import warning — Power is exported by lucide-react and we
// keep the icon set consistent across admin pages.
void Power;
