import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Plus,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  useAdminGetSet,
  useAdminUpdateSet,
  useAdminReplaceSetItems,
  useAdminListProducts,
  useAdminListManufacturers,
  getAdminGetSetQueryKey,
  getAdminListSetsQueryKey,
  type AdminSet,
  type AdminSetItem,
  type AdminProduct,
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
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";
import HistoryPanel from "../../components/HistoryPanel";

const NO_MANUFACTURER = "__none__";

interface MetaForm {
  name: string;
  slug: string;
  sku: string;
  description: string;
  manufacturerId: string;
  setPrice: string;
  displayOrder: string;
  isActive: boolean;
}

interface DraftItem {
  productId: number;
  productSku: string;
  productName: string;
  productPrice: string | null;
  productPrimaryImageUrl: string | null;
  quantity: number;
}

function metaFromSet(s: AdminSet): MetaForm {
  return {
    name: s.name,
    slug: s.slug,
    sku: s.sku ?? "",
    description: s.description ?? "",
    manufacturerId:
      s.manufacturerId === null ? NO_MANUFACTURER : String(s.manufacturerId),
    setPrice: s.setPrice ?? "",
    displayOrder: String(s.displayOrder),
    isActive: s.isActive,
  };
}

function draftFromItems(items: AdminSetItem[]): DraftItem[] {
  return items.map((it) => ({
    productId: it.productId,
    productSku: it.productSku,
    productName: it.productName,
    productPrice: it.productPrice,
    productPrimaryImageUrl: it.productPrimaryImageUrl,
    quantity: it.quantity,
  }));
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

export default function SetEdit() {
  const params = useParams<{ id?: string }>();
  const setId = params.id ? Number(params.id) : null;
  const qc = useQueryClient();
  const toast = useToast();
  const [, navigate] = useLocation();

  const detail = useAdminGetSet(setId ?? 0, {
    query: {
      enabled: setId !== null && Number.isFinite(setId),
      queryKey: getAdminGetSetQueryKey(setId ?? 0),
    },
  });
  const mfgList = useAdminListManufacturers();
  const productList = useAdminListProducts();
  const updateMut = useAdminUpdateSet();
  const replaceItemsMut = useAdminReplaceSetItems();

  const [meta, setMeta] = useState<MetaForm | null>(null);
  const [items, setItems] = useState<DraftItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [itemsError, setItemsError] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState("");
  const [pickerProductId, setPickerProductId] = useState<string>("");

  // Hydrate once we have detail + manufacturers + products
  useEffect(() => {
    if (
      !hydrated &&
      detail.data &&
      !mfgList.isLoading &&
      !productList.isLoading
    ) {
      setMeta(metaFromSet(detail.data));
      setItems(draftFromItems(detail.data.items));
      setHydrated(true);
    }
  }, [hydrated, detail.data, mfgList.isLoading, productList.isLoading]);

  // Reset on id change
  useEffect(() => {
    setHydrated(false);
    setMeta(null);
    setItems([]);
    setMetaError(null);
    setItemsError(null);
    setPickerProductId("");
    setProductSearch("");
  }, [setId]);

  const manufacturers = mfgList.data ?? [];
  const allProducts: AdminProduct[] = productList.data?.products ?? [];

  const usedProductIds = useMemo(
    () => new Set(items.map((i) => i.productId)),
    [items],
  );

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return allProducts
      .filter((p) => !usedProductIds.has(p.id))
      .filter((p) => {
        if (!q) return true;
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.manufacturerName ?? "").toLowerCase().includes(q)
        );
      })
      .slice(0, 50);
  }, [allProducts, usedProductIds, productSearch]);

  // Recompute total whenever items change
  const itemsSubtotal = useMemo(() => {
    let total = 0;
    for (const it of items) {
      const n = Number(it.productPrice ?? 0);
      if (Number.isFinite(n)) total += n * it.quantity;
    }
    return total;
  }, [items]);

  if (setId === null || !Number.isFinite(setId)) {
    return (
      <>
        <PageHeader title="Edit Set" />
        <PageBody>
          <div className="text-sm text-rose-600">Invalid set id.</div>
        </PageBody>
      </>
    );
  }

  // Error path must come before the loading guard, otherwise a 404 leaves
  // `hydrated` permanently false and the UI gets stuck on a spinner.
  if (!detail.isLoading && (detail.isError || !detail.data)) {
    return (
      <>
        <PageHeader title="Edit Set" />
        <PageBody>
          <div className="text-sm text-rose-600">
            Failed to load set. It may have been deleted.
          </div>
          <div className="mt-4">
            <Button variant="outline" onClick={() => navigate("/admin/sets")}>
              <ArrowLeft className="size-4 mr-1.5" />
              Back to sets
            </Button>
          </div>
        </PageBody>
      </>
    );
  }

  if (detail.isLoading || !hydrated || !meta) {
    return (
      <>
        <PageHeader title="Edit Set" />
        <PageBody>
          <div className="p-12 flex justify-center">
            <Spinner />
          </div>
        </PageBody>
      </>
    );
  }

  const fullSet: AdminSet = detail.data!;

  async function handleMetaSubmit(e: FormEvent): Promise<void> {
    e.preventDefault();
    if (!meta) return;
    setMetaError(null);

    const name = meta.name.trim();
    if (!name) {
      setMetaError("Name is required");
      return;
    }
    const slug = meta.slug.trim();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setMetaError("Slug must be lowercase letters, numbers, and dashes only");
      return;
    }
    const displayOrder = Number(meta.displayOrder);
    if (!Number.isFinite(displayOrder) || !Number.isInteger(displayOrder)) {
      setMetaError("Display order must be a whole number");
      return;
    }
    let setPrice: string | null = null;
    if (meta.setPrice.trim()) {
      if (!/^\d+(\.\d{1,2})?$/.test(meta.setPrice.trim())) {
        setMetaError("Bundle price must be a number like 1299.00");
        return;
      }
      setPrice = meta.setPrice.trim();
    }
    const manufacturerId =
      meta.manufacturerId === NO_MANUFACTURER
        ? null
        : Number(meta.manufacturerId);

    try {
      await updateMut.mutateAsync({
        id: setId!,
        data: {
          name,
          slug,
          sku: meta.sku.trim() || null,
          description: meta.description.trim() || null,
          manufacturerId,
          setPrice,
          displayOrder,
          isActive: meta.isActive,
        },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getAdminGetSetQueryKey(setId!) }),
        qc.invalidateQueries({ queryKey: getAdminListSetsQueryKey() }),
      ]);
      toast.toast({ title: "Set updated", description: name });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update set";
      setMetaError(msg);
    }
  }

  function addProductToItems(productIdStr: string): void {
    const id = Number(productIdStr);
    if (!Number.isFinite(id)) return;
    if (usedProductIds.has(id)) return;
    const p = allProducts.find((x) => x.id === id);
    if (!p) return;
    setItems((prev) => [
      ...prev,
      {
        productId: p.id,
        productSku: p.sku,
        productName: p.name,
        productPrice: p.price,
        productPrimaryImageUrl: p.primaryImageUrl,
        quantity: 1,
      },
    ]);
    setPickerProductId("");
    setProductSearch("");
    setItemsError(null);
  }

  function moveItem(idx: number, dir: -1 | 1): void {
    setItems((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      const [row] = next.splice(idx, 1);
      next.splice(target, 0, row);
      return next;
    });
  }

  function setItemQty(idx: number, qty: number): void {
    if (!Number.isFinite(qty) || qty < 1) return;
    setItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, quantity: qty } : it)),
    );
  }

  function removeItem(idx: number): void {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSaveItems(): Promise<void> {
    setItemsError(null);
    for (const it of items) {
      if (!Number.isInteger(it.quantity) || it.quantity < 1) {
        setItemsError(
          `Quantity for ${it.productSku} must be a whole number ≥ 1`,
        );
        return;
      }
    }
    try {
      await replaceItemsMut.mutateAsync({
        id: setId!,
        data: {
          items: items.map((it, idx) => ({
            productId: it.productId,
            quantity: it.quantity,
            displayOrder: idx,
          })),
        },
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: getAdminGetSetQueryKey(setId!) }),
        qc.invalidateQueries({ queryKey: getAdminListSetsQueryKey() }),
      ]);
      toast.toast({
        title: "Items saved",
        description: `${items.length} product${
          items.length === 1 ? "" : "s"
        } in set`,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save items";
      setItemsError(msg);
    }
  }

  return (
    <>
      <PageHeader
        title={`Edit Set: ${fullSet.name}`}
        subtitle={`/${fullSet.slug}${fullSet.sku ? ` · SKU ${fullSet.sku}` : ""}`}
        action={
          <Button variant="outline" asChild>
            <Link href="/admin/sets">
              <ArrowLeft className="size-4 mr-1.5" />
              Back
            </Link>
          </Button>
        }
      />
      <PageBody>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Metadata card */}
          <form
            onSubmit={handleMetaSubmit}
            className="xl:col-span-1 bg-white rounded-lg border border-slate-200 p-5 space-y-4 h-fit"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                Set Details
              </h2>
              {fullSet.isActive ? (
                <Badge variant="secondary">Active</Badge>
              ) : (
                <Badge variant="outline" className="text-slate-500">
                  Inactive
                </Badge>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={meta.name}
                onChange={(e) =>
                  setMeta((m) => (m ? { ...m, name: e.target.value } : m))
                }
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="slug">Slug</Label>
              <Input
                id="slug"
                value={meta.slug}
                onChange={(e) =>
                  setMeta((m) => (m ? { ...m, slug: e.target.value } : m))
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="sku">Bundle SKU</Label>
                <Input
                  id="sku"
                  value={meta.sku}
                  onChange={(e) =>
                    setMeta((m) => (m ? { ...m, sku: e.target.value } : m))
                  }
                  placeholder="optional"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="setPrice">Bundle Price</Label>
                <Input
                  id="setPrice"
                  inputMode="decimal"
                  value={meta.setPrice}
                  onChange={(e) =>
                    setMeta((m) =>
                      m ? { ...m, setPrice: e.target.value } : m,
                    )
                  }
                  placeholder={`Items: ${formatMoney(itemsSubtotal.toFixed(2))}`}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="manufacturerId">Manufacturer</Label>
              <Select
                value={meta.manufacturerId}
                onValueChange={(v) =>
                  setMeta((m) => (m ? { ...m, manufacturerId: v } : m))
                }
              >
                <SelectTrigger id="manufacturerId">
                  <SelectValue placeholder="Select manufacturer" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_MANUFACTURER}>— None —</SelectItem>
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
                value={meta.description}
                onChange={(e) =>
                  setMeta((m) =>
                    m ? { ...m, description: e.target.value } : m,
                  )
                }
                rows={4}
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1.5 flex-1">
                <Label htmlFor="displayOrder">Display order</Label>
                <Input
                  id="displayOrder"
                  type="number"
                  value={meta.displayOrder}
                  onChange={(e) =>
                    setMeta((m) =>
                      m ? { ...m, displayOrder: e.target.value } : m,
                    )
                  }
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-700 mt-6">
                <Switch
                  checked={meta.isActive}
                  onCheckedChange={(v) =>
                    setMeta((m) => (m ? { ...m, isActive: v } : m))
                  }
                />
                Active
              </label>
            </div>

            {metaError && (
              <div className="text-sm text-rose-600 flex items-start gap-1.5">
                <X className="size-4 mt-0.5 shrink-0" />
                {metaError}
              </div>
            )}

            <div className="pt-2 border-t border-slate-100">
              <Button
                type="submit"
                disabled={updateMut.isPending}
                className="w-full"
              >
                <Save className="size-4 mr-1.5" />
                {updateMut.isPending ? "Saving…" : "Save Details"}
              </Button>
            </div>
          </form>

          {/* Items card */}
          <div className="xl:col-span-2 bg-white rounded-lg border border-slate-200 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wide">
                Products in this Set
              </h2>
              <span className="text-xs text-slate-500">
                {items.length} item{items.length === 1 ? "" : "s"} · subtotal{" "}
                <span className="tabular-nums text-slate-700">
                  {formatMoney(itemsSubtotal.toFixed(2))}
                </span>
              </span>
            </div>

            <div className="flex flex-wrap items-end gap-2 p-3 bg-slate-50 rounded border border-slate-200">
              <div className="flex-1 min-w-[200px] space-y-1.5">
                <Label htmlFor="productSearch" className="text-xs">
                  Search products
                </Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 size-4 text-slate-400" />
                  <Input
                    id="productSearch"
                    value={productSearch}
                    onChange={(e) => {
                      setProductSearch(e.target.value);
                      setPickerProductId("");
                    }}
                    placeholder="By name, SKU, or manufacturer"
                    className="pl-8"
                  />
                </div>
              </div>
              <div className="flex-[2] min-w-[240px] space-y-1.5">
                <Label htmlFor="picker" className="text-xs">
                  Pick a product
                </Label>
                <Select
                  value={pickerProductId}
                  onValueChange={(v) => setPickerProductId(v)}
                >
                  <SelectTrigger id="picker">
                    <SelectValue
                      placeholder={
                        productList.isLoading
                          ? "Loading…"
                          : filteredProducts.length === 0
                            ? "No matching products"
                            : "Select a product to add"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProducts.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        <span className="font-mono text-xs text-slate-500 mr-2">
                          {p.sku}
                        </span>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                type="button"
                disabled={!pickerProductId}
                onClick={() => addProductToItems(pickerProductId)}
              >
                <Plus className="size-4 mr-1.5" />
                Add
              </Button>
            </div>

            {items.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 border border-dashed border-slate-200 rounded">
                No products in this set yet. Add some above.
              </div>
            ) : (
              <div className="border border-slate-200 rounded overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-slate-600 text-xs uppercase tracking-wide">
                    <tr>
                      <th className="text-left font-medium px-3 py-2 w-[60px]">
                        Order
                      </th>
                      <th className="text-left font-medium px-3 py-2">
                        Product
                      </th>
                      <th className="text-right font-medium px-3 py-2 w-[100px]">
                        Unit
                      </th>
                      <th className="text-right font-medium px-3 py-2 w-[100px]">
                        Qty
                      </th>
                      <th className="text-right font-medium px-3 py-2 w-[100px]">
                        Line
                      </th>
                      <th className="px-3 py-2 w-[60px]" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => {
                      const unit = Number(it.productPrice ?? 0);
                      const line =
                        Number.isFinite(unit) && it.productPrice
                          ? unit * it.quantity
                          : null;
                      return (
                        <tr
                          key={it.productId}
                          className="border-t border-slate-100"
                        >
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-0.5">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-6"
                                onClick={() => moveItem(idx, -1)}
                                disabled={idx === 0}
                                title="Move up"
                              >
                                <ArrowUp className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-6"
                                onClick={() => moveItem(idx, 1)}
                                disabled={idx === items.length - 1}
                                title="Move down"
                              >
                                <ArrowDown className="size-3.5" />
                              </Button>
                            </div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="font-medium text-slate-900">
                              {it.productName}
                            </div>
                            <div className="text-xs text-slate-500 font-mono">
                              {it.productSku}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-600">
                            {formatMoney(it.productPrice)}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Input
                              type="number"
                              min={1}
                              value={it.quantity}
                              onChange={(e) =>
                                setItemQty(idx, Number(e.target.value))
                              }
                              className="text-right h-8"
                            />
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                            {line === null
                              ? "—"
                              : formatMoney(line.toFixed(2))}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7 text-rose-600 hover:text-rose-700"
                              onClick={() => removeItem(idx)}
                              title="Remove"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {itemsError && (
              <div className="text-sm text-rose-600 flex items-start gap-1.5">
                <X className="size-4 mt-0.5 shrink-0" />
                {itemsError}
              </div>
            )}

            <div className="flex items-center justify-end pt-2 border-t border-slate-100">
              <Button
                onClick={handleSaveItems}
                disabled={replaceItemsMut.isPending}
              >
                <Save className="size-4 mr-1.5" />
                {replaceItemsMut.isPending ? "Saving…" : "Save Items"}
              </Button>
            </div>
          </div>
        </div>

        {setId != null && Number.isFinite(setId) ? (
          <div className="mt-6">
            <HistoryPanel entityType="product_set" entityId={setId} />
          </div>
        ) : null}
      </PageBody>
    </>
  );
}
