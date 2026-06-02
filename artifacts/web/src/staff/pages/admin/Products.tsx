import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Pencil, Plus, Search, Power, Trash2, ChevronLeft, ChevronRight, Star, Upload, X } from "lucide-react";
import { SortableHeader, toggleSort, type SortState } from "../../lib/sortable";
import { BulkUpdateProductsDialog } from "../../components/BulkUpdateProductsDialog";

type ProductsSortKey = "name" | "manufacturer" | "category" | "price" | "onHand";
import {
  useAdminListProducts,
  useAdminSetProductActive,
  useAdminListManufacturers,
  useAdminListCategories,
  getAdminListProductsQueryKey,
  type AdminProduct,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { getStaffObjectUrl } from "../../lib/upload";

const PAGE_SIZE = 25;

export default function Products() {
  const qc = useQueryClient();
  const toast = useToast();
  const [, navigate] = useLocation();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [manufacturerId, setManufacturerId] = useState<string>("any");
  const [categoryId, setCategoryId] = useState<string>("any");
  const [statusFilter, setStatusFilter] = useState<string>("active");
  const [featuredFilter, setFeaturedFilter] = useState<string>("any");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState<SortState<ProductsSortKey>>({ by: null, order: "desc" });
  const [confirmDeactivate, setConfirmDeactivate] = useState<AdminProduct | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  function toggleSelect(id: number) {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  function clearSelection() {
    setSelectedIds(new Set());
  }

  const handleSort = (key: ProductsSortKey) => {
    setSort((prev) => toggleSort(prev, key));
    setPage(1);
  };

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  useEffect(() => {
    setPage(1);
  }, [manufacturerId, categoryId, statusFilter, featuredFilter]);

  const queryParams = useMemo(() => {
    const p: Record<string, unknown> = { page, pageSize: PAGE_SIZE };
    if (search) p.q = search;
    if (manufacturerId !== "any") p.manufacturerId = Number(manufacturerId);
    if (categoryId !== "any") p.categoryId = Number(categoryId);
    if (statusFilter === "active") p.isActive = true;
    if (statusFilter === "inactive") p.isActive = false;
    if (featuredFilter === "yes") p.featured = true;
    if (featuredFilter === "no") p.featured = false;
    if (sort.by) {
      p.sortBy = sort.by;
      p.sortOrder = sort.order;
    }
    return p;
  }, [page, search, manufacturerId, categoryId, statusFilter, featuredFilter, sort]);

  const list = useAdminListProducts(queryParams, {
    query: {
      queryKey: getAdminListProductsQueryKey(queryParams),
      placeholderData: (prev) => prev,
      staleTime: 5_000,
    },
  });
  const mfgList = useAdminListManufacturers();
  const catList = useAdminListCategories();
  const setActiveMut = useAdminSetProductActive();

  const rows = list.data?.products ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function toggleActive(row: AdminProduct, isActive: boolean) {
    try {
      await setActiveMut.mutateAsync({ id: row.id, data: { isActive } });
      await qc.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
      toast.toast({ title: isActive ? "Product activated" : "Product deactivated" });
    } catch (err) {
      toast.toast({
        variant: "destructive",
        title: "Could not update",
        description: err instanceof Error ? err.message : "Try again.",
      });
    }
  }

  return (
    <>
      <PageHeader
        title="Products"
        subtitle="Catalog of items you sell. Add photos, set prices, and manage inventory."
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => navigate("/admin/products/import")}
              data-testid="btn-import-csv"
            >
              <Upload className="size-4" />
              Import CSV
            </Button>
            <Button
              onClick={() => navigate("/admin/products/new")}
              className="bg-[#1A3C5E] hover:bg-[#15314c] text-white"
            >
              <Plus className="size-4" />
              New product
            </Button>
          </div>
        }
      />
      <PageBody>
        <div className="bg-white border border-slate-200 rounded-md">
          <div className="p-4 grid grid-cols-1 md:grid-cols-12 gap-3 border-b border-slate-100">
            <div className="md:col-span-4 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
              <Input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, SKU, or slug…"
                className="pl-9"
              />
            </div>
            <div className="md:col-span-2">
              <Select value={manufacturerId} onValueChange={setManufacturerId}>
                <SelectTrigger>
                  <SelectValue placeholder="All brands" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">All brands</SelectItem>
                  {(mfgList.data ?? []).map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder="All categories" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">All categories</SelectItem>
                  {(catList.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">All statuses</SelectItem>
                  <SelectItem value="active">Active only</SelectItem>
                  <SelectItem value="inactive">Inactive only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Select value={featuredFilter} onValueChange={setFeaturedFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="any">All</SelectItem>
                  <SelectItem value="yes">Featured only</SelectItem>
                  <SelectItem value="no">Not featured</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {list.isLoading ? (
            <div className="p-12 flex justify-center">
              <Spinner className="size-6 text-[#1A3C5E]" />
            </div>
          ) : list.isError ? (
            <div className="p-12 text-center text-sm text-red-600">
              Could not load products.{" "}
              <button
                className="underline"
                onClick={() => list.refetch()}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : rows.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              {total === 0 && !search && manufacturerId === "any" && categoryId === "any"
                ? "No products yet. Click New product to add your first."
                : "No products match these filters."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-left">
                  <tr>
                    <th className="px-4 py-2.5 font-medium w-10">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        checked={
                          rows.length > 0 &&
                          rows.every((r) => selectedIds.has(r.id))
                        }
                        ref={(el) => {
                          if (!el) return;
                          const someChecked = rows.some((r) =>
                            selectedIds.has(r.id),
                          );
                          const allChecked =
                            rows.length > 0 &&
                            rows.every((r) => selectedIds.has(r.id));
                          el.indeterminate = someChecked && !allChecked;
                        }}
                        onChange={(e) => {
                          setSelectedIds((s) => {
                            const n = new Set(s);
                            if (e.target.checked) {
                              for (const r of rows) n.add(r.id);
                            } else {
                              for (const r of rows) n.delete(r.id);
                            }
                            return n;
                          });
                        }}
                      />
                    </th>
                    <th className="px-4 py-2.5 font-medium w-16">Image</th>
                    <SortableHeader sortKey="name" state={sort} onSort={handleSort} className="px-4 py-2.5 font-medium">Name / SKU</SortableHeader>
                    <SortableHeader sortKey="manufacturer" state={sort} onSort={handleSort} className="px-4 py-2.5 font-medium">Brand</SortableHeader>
                    <SortableHeader sortKey="category" state={sort} onSort={handleSort} className="px-4 py-2.5 font-medium">Category</SortableHeader>
                    <SortableHeader sortKey="price" state={sort} onSort={handleSort} align="right" className="px-4 py-2.5 font-medium w-24">Price</SortableHeader>
                    <th className="px-4 py-2.5 font-medium w-24 text-right">Sale</th>
                    <SortableHeader sortKey="onHand" state={sort} onSort={handleSort} align="right" className="px-4 py-2.5 font-medium w-20">On hand</SortableHeader>
                    <th className="px-4 py-2.5 font-medium w-32">Flags</th>
                    <th className="px-4 py-2.5 font-medium w-28 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => {
                    const img = getStaffObjectUrl(row.primaryImageUrl);
                    const lowStock =
                      row.lowStockThreshold > 0 &&
                      row.onHand <= row.lowStockThreshold;
                    return (
                      <tr
                        key={row.id}
                        className={`hover:bg-slate-50 ${
                          selectedIds.has(row.id) ? "bg-sky-50/40" : ""
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <input
                            type="checkbox"
                            aria-label={`Select ${row.name}`}
                            checked={selectedIds.has(row.id)}
                            onChange={() => toggleSelect(row.id)}
                          />
                        </td>
                        <td className="px-4 py-2.5">
                          {img ? (
                            <img
                              src={img}
                              alt=""
                              className="size-10 object-cover rounded border border-slate-200 bg-white"
                            />
                          ) : (
                            <div className="size-10 rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">
                              —
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => navigate(`/admin/products/${row.id}`)}
                            className="font-medium text-slate-900 hover:text-[#1A3C5E] hover:underline text-left"
                          >
                            {row.name}
                          </button>
                          <div className="text-xs text-slate-500 font-mono">{row.sku}</div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {row.manufacturerName ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {row.categoryName ?? <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-700 tabular-nums">
                          {row.price ? `$${Number(row.price).toFixed(2)}` : <span className="text-slate-400">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {row.salePrice ? (
                            <span className="text-emerald-700 font-medium">${Number(row.salePrice).toFixed(2)}</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className={`px-4 py-2.5 text-right tabular-nums ${lowStock ? "text-amber-700 font-medium" : "text-slate-700"}`}>
                          {row.onHand}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex flex-wrap gap-1">
                            {!row.isActive && <Badge variant="secondary">Inactive</Badge>}
                            {row.featured && (
                              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">
                                <Star className="size-3" />
                              </Badge>
                            )}
                            {row.inStoreOnly && (
                              <Badge variant="outline" className="text-xs">In-store</Badge>
                            )}
                            {!row.availableOnline && !row.inStoreOnly && (
                              <Badge variant="outline" className="text-xs text-slate-500">Offline</Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => navigate(`/admin/products/${row.id}`)}
                              title="Edit"
                            >
                              <Pencil className="size-4" />
                            </Button>
                            {row.isActive ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setConfirmDeactivate(row)}
                                title="Deactivate"
                              >
                                <Trash2 className="size-4 text-red-600" />
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleActive(row, true)}
                                title="Reactivate"
                              >
                                <Power className="size-4 text-emerald-600" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {total > 0 && (
            <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between text-sm text-slate-600">
              <div>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft className="size-4" />
                  Prev
                </Button>
                <span className="px-2">
                  Page {page} of {totalPages}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  Next
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </PageBody>

      {selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white border border-slate-300 rounded-full shadow-lg px-4 py-2 flex items-center gap-3">
          <span className="text-sm font-medium text-slate-700">
            {selectedIds.size} selected
          </span>
          <Button
            size="sm"
            className="bg-[#1A3C5E] hover:bg-[#15314c] text-white"
            onClick={() => setBulkOpen(true)}
          >
            Bulk update…
          </Button>
          <button
            type="button"
            onClick={clearSelection}
            className="text-slate-500 hover:text-slate-800 p-1"
            aria-label="Clear selection"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <BulkUpdateProductsDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        productIds={Array.from(selectedIds)}
        onComplete={() => {
          setBulkOpen(false);
          clearSelection();
        }}
      />

      <AlertDialog
        open={confirmDeactivate !== null}
        onOpenChange={(o) => !o && setConfirmDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate product?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeactivate?.name} will be hidden from the storefront. Existing
              orders are unaffected. You can reactivate at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeactivate) {
                  toggleActive(confirmDeactivate, false);
                  setConfirmDeactivate(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
