import { useEffect, useMemo, useState } from "react";
import { Search, Package } from "lucide-react";
import {
  useAdminListProducts,
  useListManufacturers,
  useListCategories,
  type AdminListProductsParams,
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

function fmtMoney(n: number | string | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(n));
}

export default function AgentProducts() {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [manufacturerId, setManufacturerId] = useState<string>(ANY);
  const [categoryId, setCategoryId] = useState<string>(ANY);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = useMemo<AdminListProductsParams>(() => {
    const p: AdminListProductsParams = { page, pageSize: PAGE_SIZE };
    if (search) p.q = search;
    if (manufacturerId !== ANY) p.manufacturerId = Number(manufacturerId);
    if (categoryId !== ANY) p.categoryId = Number(categoryId);
    return p;
  }, [search, manufacturerId, categoryId, page]);

  const list = useAdminListProducts(params);
  const mfgList = useListManufacturers();
  const catList = useListCategories();

  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader title="Product Catalog" subtitle="Browse the full product reference (read-only)." />
      <PageBody>
        <div className="bg-white rounded-lg border p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input placeholder="Search name, SKU, slug…" value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)} className="pl-9" />
            </div>
            <Select value={manufacturerId} onValueChange={(v) => { setManufacturerId(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="All vendors" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All vendors</SelectItem>
                {(mfgList.data ?? []).map((m) => (
                  <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryId} onValueChange={(v) => { setCategoryId(v); setPage(1); }}>
              <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ANY}>All categories</SelectItem>
                {(catList.data ?? []).map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="bg-white rounded-lg border overflow-x-auto">
          {list.isLoading ? (
            <div className="p-12 flex justify-center"><Spinner /></div>
          ) : list.isError ? (
            <div className="p-6 text-sm text-rose-600">Failed to load products.</div>
          ) : (list.data?.products ?? []).length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">No products match the current filters.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Product</th>
                  <th className="px-4 py-3 font-semibold">SKU</th>
                  <th className="px-4 py-3 font-semibold">Vendor</th>
                  <th className="px-4 py-3 font-semibold">Category</th>
                  <th className="px-4 py-3 font-semibold text-right">Price</th>
                  <th className="px-4 py-3 font-semibold text-right">On hand</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(list.data?.products ?? []).map((row) => {
                  const thumbUrl = getStaffObjectUrl(row.primaryImageUrl);
                  return (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded bg-slate-100 overflow-hidden flex items-center justify-center shrink-0">
                            {thumbUrl ? (
                              <img src={thumbUrl} alt="" className="size-full object-cover" />
                            ) : (
                              <Package className="size-4 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-slate-900 truncate">{row.name}</div>
                            {row.shortDescription && (
                              <div className="text-xs text-slate-500 truncate max-w-[28ch]">
                                {row.shortDescription}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.sku}</td>
                      <td className="px-4 py-3 text-slate-700">{row.manufacturerName ?? "—"}</td>
                      <td className="px-4 py-3 text-slate-700">{row.categoryName ?? "—"}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{fmtMoney(row.msrp)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{row.onHand}</td>
                      <td className="px-4 py-3">
                        {row.isActive ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 font-normal">Active</Badge>
                        ) : (
                          <Badge variant="outline">Inactive</Badge>
                        )}
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
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}>Previous</Button>
                <span className="tabular-nums">Page {page} / {totalPages}</span>
                <Button variant="outline" size="sm" disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</Button>
              </div>
            </div>
          )}
        </div>
      </PageBody>
    </>
  );
}
