import { useEffect, useMemo, useState } from "react";
import { Boxes, ChevronLeft, ChevronRight, Search } from "lucide-react";
import {
  useAdminListInventory,
  useListManufacturers,
  useListCategories,
  type AdminInventoryItem,
  type AdminListInventoryParams,
  type AdminListInventoryStatus,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageBody, PageHeader } from "../../StaffShell";
import { getStaffObjectUrl } from "../../lib/upload";

const PAGE_SIZE = 25;
const ANY = "any";

function StatusPill({ status }: { status: AdminInventoryItem["status"] }) {
  if (status === "out_of_stock") return <Badge variant="destructive" className="font-normal">Out of stock</Badge>;
  if (status === "low_stock") return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 font-normal">Low stock</Badge>;
  return <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal">In stock</Badge>;
}

export default function AgentInventory() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>(ANY);
  const [manufacturerId, setManufacturerId] = useState<string>(ANY);
  const [categoryId, setCategoryId] = useState<string>(ANY);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = useMemo<AdminListInventoryParams>(() => {
    const p: AdminListInventoryParams = { page, pageSize: PAGE_SIZE };
    if (search) p.q = search;
    if (statusFilter !== ANY) p.status = statusFilter as AdminListInventoryStatus;
    if (manufacturerId !== ANY) p.manufacturerId = Number(manufacturerId);
    if (categoryId !== ANY) p.categoryId = Number(categoryId);
    return p;
  }, [search, statusFilter, manufacturerId, categoryId, page]);

  const list = useAdminListInventory(params);
  const mfgList = useListManufacturers();
  const catList = useListCategories();
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Inventory" subtitle="Live stock levels (read-only)." />
      <PageBody>
        <div className="bg-white rounded-lg border p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input placeholder="Search name, SKU, slug…" value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)} className="pl-9" />
            </div>
            <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All statuses</SelectItem>
                <SelectItem value="in_stock">In stock</SelectItem>
                <SelectItem value="low_stock">Low stock</SelectItem>
                <SelectItem value="out_of_stock">Out of stock</SelectItem>
              </SelectContent>
            </Select>
            <Select value={manufacturerId} onValueChange={(v) => { setManufacturerId(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="All manufacturers" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All manufacturers</SelectItem>
                {(mfgList.data ?? []).map((m) => (<SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>))}
              </SelectContent>
            </Select>
            <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All categories</SelectItem>
                {(catList.data ?? []).map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="bg-white rounded-lg border overflow-hidden">
          {list.isLoading ? (
            <div className="p-12 flex justify-center"><Spinner /></div>
          ) : list.isError ? (
            <div className="p-6 text-sm text-rose-600">Failed to load inventory.</div>
          ) : (list.data?.items ?? []).length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">No products match the current filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="px-4 py-3 font-semibold">Manufacturer</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold text-right">On hand</th>
                  <th className="px-4 py-3 font-semibold text-right">Reorder at</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(list.data?.items ?? []).map((row) => {
                  const thumbUrl = getStaffObjectUrl(row.primaryImageUrl);
                  const reorderAt = Math.max(row.lowStockThreshold, row.reorderThreshold);
                  return (
                    <tr key={row.productId} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                            {thumbUrl ? <img src={thumbUrl} alt="" className="size-full object-cover" /> : <Boxes className="size-4 text-slate-400" />}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 truncate">{row.name}</div>
                            {!row.isActive && <div className="text-xs text-slate-400">Inactive</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.sku}</td>
                      <td className="px-4 py-3 text-slate-700">{row.manufacturerName ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{row.categoryName ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">{row.onHand}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-slate-500">{reorderAt > 0 ? reorderAt : "—"}</td>
                      <td className="px-4 py-3"><StatusPill status={row.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {list.data && list.data.total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-slate-50 text-sm text-slate-600">
              <div>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}</div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}><ChevronLeft className="size-4" /></Button>
                <span className="tabular-nums">Page {page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}><ChevronRight className="size-4" /></Button>
              </div>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
