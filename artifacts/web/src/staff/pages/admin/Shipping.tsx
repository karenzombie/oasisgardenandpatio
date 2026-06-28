import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Truck, Search, X } from "lucide-react";
import {
  useAdminListShippingRules,
  useAdminCreateShippingRule,
  useAdminUpdateShippingRule,
  useAdminDeleteShippingRule,
  getAdminListShippingRulesQueryKey,
  useAdminGetShippingWeightTiers,
  useAdminUpdateShippingWeightTiers,
  getAdminGetShippingWeightTiersQueryKey,
  useAdminGetShippingSubcategories,
  getAdminGetShippingSubcategoriesQueryKey,
  useAdminListCategories,
  useAdminListManufacturers,
  useAdminListProducts,
  getAdminListProductsQueryKey,
  type ShippingRule,
  type ShippingRuleScope,
  type ShippingRuleRateType,
  type ShippingWeightTier,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";

const SCOPE_LABELS: Record<ShippingRuleScope, string> = {
  site_wide: "Site-wide",
  category: "Category",
  manufacturer: "Manufacturer",
  product: "Specific products",
};

const SCOPE_ORDER: ShippingRuleScope[] = [
  "site_wide",
  "category",
  "manufacturer",
  "product",
];

function rateSummary(r: { rateType: ShippingRuleRateType; rateValue: string }) {
  const n = Number(r.rateValue);
  return r.rateType === "flat"
    ? `$${n.toFixed(2)} per item`
    : `${n}% of item price`;
}

function scopeTarget(r: ShippingRule): string {
  switch (r.scope) {
    case "site_wide":
      return "All online orders";
    case "category":
      return r.subCategory
        ? `${r.categoryName ?? "—"} › ${r.subCategory}`
        : r.categoryName ?? "—";
    case "manufacturer":
      return r.manufacturerName ?? "—";
    case "product":
      return `${r.products.length} product${
        r.products.length === 1 ? "" : "s"
      }`;
    default:
      return "—";
  }
}

export default function Shipping() {
  const qc = useQueryClient();
  const toast = useToast();
  const rulesQuery = useAdminListShippingRules();
  const deleteMut = useAdminDeleteShippingRule();
  const [editing, setEditing] = useState<ShippingRule | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ShippingRule | null>(null);

  async function refetchRules() {
    await qc.invalidateQueries({
      queryKey: getAdminListShippingRulesQueryKey(),
    });
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync({ id: deleteTarget.id });
      await refetchRules();
      toast.toast({ title: "Shipping rule deleted" });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to delete shipping rule.";
      toast.toast({
        title: "Could not delete rule",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setDeleteTarget(null);
    }
  }

  const rules = rulesQuery.data?.rules ?? [];
  const grouped = useMemo(() => {
    const m = new Map<ShippingRuleScope, ShippingRule[]>();
    for (const s of SCOPE_ORDER) m.set(s, []);
    for (const r of rules) m.get(r.scope)?.push(r);
    return m;
  }, [rules]);

  return (
    <>
      <PageHeader
        title="Shipping"
        action={
          <Button onClick={() => setEditing("new")}>
            <Plus className="size-4 mr-1.5" />
            Add shipping rule
          </Button>
        }
      />
      <PageBody>
        <p className="text-sm text-slate-500 mb-4 max-w-3xl">
          Shipping rules are the single source of truth for shipping on online
          customer orders. Matching rules <strong>stack</strong> — site-wide,
          category, manufacturer and product charges all add together per item,
          plus one by-weight charge for the whole order. Flat rates are charged
          per quantity; percentage rates apply to each item&rsquo;s price.
          Shipping is never taxed, and ship-to-store orders are always free.
        </p>

        <div className="bg-white rounded-lg border overflow-x-auto mb-8">
          {rulesQuery.isLoading ? (
            <div className="p-12 flex justify-center">
              <Spinner />
            </div>
          ) : rulesQuery.isError ? (
            <div className="p-6 text-sm text-rose-600">
              Failed to load shipping rules.
            </div>
          ) : rules.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              <Truck className="size-8 mx-auto mb-3 text-slate-300" />
              No shipping rules yet. Online orders ship free until you add one.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Scope</th>
                  <th className="px-4 py-3 font-semibold">Applies to</th>
                  <th className="px-4 py-3 font-semibold">Rate</th>
                  <th className="px-4 py-3 font-semibold">Label</th>
                  <th className="px-4 py-3 font-semibold">Active</th>
                  <th className="px-4 py-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {SCOPE_ORDER.flatMap((scope) =>
                  (grouped.get(scope) ?? []).map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50 align-top">
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="font-normal">
                          {SCOPE_LABELS[r.scope]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        <div>{scopeTarget(r)}</div>
                        {r.scope === "product" && r.products.length > 0 && (
                          <div className="mt-1 text-xs text-slate-400 font-mono break-all">
                            {r.products.map((p) => p.sku).join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-900">
                        {rateSummary(r)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.label || <span className="text-slate-400">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.isActive ? (
                          <Badge className="font-normal">Active</Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="font-normal text-slate-500"
                          >
                            Inactive
                          </Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditing(r)}
                        >
                          <Pencil className="size-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ml-1 text-rose-600 hover:text-rose-700"
                          onClick={() => setDeleteTarget(r)}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  )),
                )}
              </tbody>
            </table>
          )}
        </div>

        <WeightTiersCard />

        {editing !== null && (
          <RuleDialog
            target={editing}
            onClose={() => setEditing(null)}
            onSaved={refetchRules}
          />
        )}

        <AlertDialog
          open={deleteTarget !== null}
          onOpenChange={(o) => !o && setDeleteTarget(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete shipping rule?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the {deleteTarget && SCOPE_LABELS[deleteTarget.scope]}{" "}
                rule. Online orders will stop including this charge immediately.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-rose-600 hover:bg-rose-700"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </PageBody>
    </>
  );
}

function WeightTiersCard() {
  const qc = useQueryClient();
  const toast = useToast();
  const tiersQuery = useAdminGetShippingWeightTiers();
  const updateMut = useAdminUpdateShippingWeightTiers();
  const [amounts, setAmounts] = useState<Record<number, string>>({});

  useEffect(() => {
    const tiers = tiersQuery.data?.tiers;
    if (tiers) {
      setAmounts(
        Object.fromEntries(tiers.map((t) => [t.id, String(Number(t.amount))])),
      );
    }
  }, [tiersQuery.data]);

  function tierLabel(t: ShippingWeightTier): string {
    return t.maxWeight == null
      ? `${t.minWeight}+ lbs`
      : `${t.minWeight}–${t.maxWeight} lbs`;
  }

  async function handleSave() {
    const tiers = tiersQuery.data?.tiers ?? [];
    const payload = tiers.map((t) => ({
      id: t.id,
      amount: Number(amounts[t.id] ?? t.amount) || 0,
    }));
    try {
      await updateMut.mutateAsync({ data: { tiers: payload } });
      await qc.invalidateQueries({
        queryKey: getAdminGetShippingWeightTiersQueryKey(),
      });
      toast.toast({ title: "Weight tiers saved" });
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to save weight tiers.";
      toast.toast({
        title: "Could not save weight tiers",
        description: msg,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="bg-white rounded-lg border p-5 max-w-2xl">
      <h2 className="text-base font-semibold text-slate-900">
        By-weight shipping
      </h2>
      <p className="text-sm text-slate-500 mt-1 mb-4">
        One charge per order based on the total weight of all items. This adds on
        top of any per-item rules above. Set a tier to $0 to disable it.
      </p>
      {tiersQuery.isLoading ? (
        <div className="py-6 flex justify-center">
          <Spinner />
        </div>
      ) : tiersQuery.isError ? (
        <div className="text-sm text-rose-600">Failed to load weight tiers.</div>
      ) : (
        <>
          <div className="space-y-3">
            {(tiersQuery.data?.tiers ?? []).map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-4">
                <span className="text-sm text-slate-700">{tierLabel(t)}</span>
                <div className="relative w-40">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">
                    $
                  </span>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    className="pl-6"
                    value={amounts[t.id] ?? ""}
                    onChange={(e) =>
                      setAmounts((prev) => ({
                        ...prev,
                        [t.id]: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-5 flex justify-end">
            <Button onClick={handleSave} disabled={updateMut.isPending}>
              {updateMut.isPending ? "Saving…" : "Save weight tiers"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

type PickedProduct = { productId: number; sku: string; name: string };

function RuleDialog({
  target,
  onClose,
  onSaved,
}: {
  target: ShippingRule | "new";
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const createMut = useAdminCreateShippingRule();
  const updateMut = useAdminUpdateShippingRule();
  const deleteMut = useAdminDeleteShippingRule();

  const isEdit = target !== "new";

  const [scope, setScope] = useState<ShippingRuleScope>("site_wide");
  const [rateType, setRateType] = useState<ShippingRuleRateType>("flat");
  const [rateValue, setRateValue] = useState("");
  const [label, setLabel] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [subCategory, setSubCategory] = useState<string>("");
  const [manufacturerId, setManufacturerId] = useState<number | null>(null);
  const [picked, setPicked] = useState<PickedProduct[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (target === "new") {
      setScope("site_wide");
      setRateType("flat");
      setRateValue("");
      setLabel("");
      setIsActive(true);
      setCategoryId(null);
      setSubCategory("");
      setManufacturerId(null);
      setPicked([]);
      setError(null);
    } else {
      setScope(target.scope);
      setRateType(target.rateType);
      setRateValue(String(Number(target.rateValue)));
      setLabel(target.label ?? "");
      setIsActive(target.isActive);
      setCategoryId(target.categoryId);
      setSubCategory(target.subCategory ?? "");
      setManufacturerId(target.manufacturerId);
      setPicked(
        target.products.map((p) => ({
          productId: p.productId,
          sku: p.sku,
          name: p.name,
        })),
      );
      setError(null);
    }
  }, [target]);

  const categoriesQuery = useAdminListCategories();
  const manufacturersQuery = useAdminListManufacturers();
  const subcatParams = { categoryId: categoryId ?? 0 };
  const subcatsQuery = useAdminGetShippingSubcategories(subcatParams, {
    query: {
      queryKey: getAdminGetShippingSubcategoriesQueryKey(subcatParams),
      enabled: scope === "category" && categoryId != null,
    },
  });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const rv = Number(rateValue);
    if (!Number.isFinite(rv) || rv < 0) {
      setError("Enter a valid rate of 0 or more.");
      return;
    }
    if (rateType === "percentage" && rv > 100) {
      setError("A percentage rate cannot exceed 100%.");
      return;
    }
    if (scope === "category" && categoryId == null) {
      setError("Choose a category.");
      return;
    }
    if (scope === "manufacturer" && manufacturerId == null) {
      setError("Choose a manufacturer (vendor).");
      return;
    }
    if (scope === "product" && picked.length === 0) {
      setError("Select at least one product.");
      return;
    }

    try {
      if (isEdit) {
        await updateMut.mutateAsync({
          id: target.id,
          data: {
            rateType,
            rateValue: rv,
            label: label.trim() || null,
            isActive,
            categoryId: scope === "category" ? categoryId : null,
            subCategory:
              scope === "category" && subCategory.trim()
                ? subCategory.trim()
                : null,
            manufacturerId: scope === "manufacturer" ? manufacturerId : null,
            productIds:
              scope === "product" ? picked.map((p) => p.productId) : [],
          },
        });
        toast.toast({ title: "Shipping rule updated" });
      } else {
        const res = await createMut.mutateAsync({
          data: {
            scope,
            rateType,
            rateValue: rv,
            label: label.trim() || null,
            isActive,
            categoryId: scope === "category" ? categoryId : null,
            subCategory:
              scope === "category" && subCategory.trim()
                ? subCategory.trim()
                : null,
            manufacturerId: scope === "manufacturer" ? manufacturerId : null,
            productIds:
              scope === "product" ? picked.map((p) => p.productId) : [],
          },
        });
        const conflicts = res.conflictSkus ?? [];
        if (conflicts.length > 0) {
          const newRuleId = res.rule.id;
          toast.toast({
            title: "Heads up — shipping will stack",
            description: `A shipping rate already exists for ${conflicts.join(
              ", ",
            )} and will be added together.`,
            duration: 1000 * 60 * 60,
            action: (
              <ToastAction
                altText="Undo"
                onClick={async () => {
                  try {
                    await deleteMut.mutateAsync({ id: newRuleId });
                    await onSaved();
                    toast.toast({ title: "Rule removed" });
                  } catch {
                    toast.toast({
                      title: "Could not undo",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Undo
              </ToastAction>
            ),
          });
        } else {
          toast.toast({ title: "Shipping rule created" });
        }
      }
      await onSaved();
      onClose();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to save shipping rule.";
      setError(msg);
    }
  }

  const categories = categoriesQuery.data ?? [];
  const manufacturers = manufacturersQuery.data ?? [];
  const pending = createMut.isPending || updateMut.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit shipping rule" : "Add shipping rule"}
          </DialogTitle>
          <DialogDescription>
            Define how much shipping to charge and which items it applies to.
            Rules with overlapping items stack together.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Applies to</Label>
            <Select
              value={scope}
              onValueChange={(v) => setScope(v as ShippingRuleScope)}
              disabled={isEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SCOPE_ORDER.map((s) => (
                  <SelectItem key={s} value={s}>
                    {SCOPE_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {isEdit && (
              <p className="mt-1 text-xs text-slate-400">
                The scope can&rsquo;t be changed after creation.
              </p>
            )}
          </div>

          {scope === "category" && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Category</Label>
                <Select
                  value={categoryId != null ? String(categoryId) : ""}
                  onValueChange={(v) => {
                    setCategoryId(Number(v));
                    setSubCategory("");
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Subcategory (optional)</Label>
                <Select
                  value={subCategory || "__all__"}
                  onValueChange={(v) =>
                    setSubCategory(v === "__all__" ? "" : v)
                  }
                  disabled={categoryId == null}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All subcategories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">All subcategories</SelectItem>
                    {(subcatsQuery.data?.subCategories ?? []).map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {scope === "manufacturer" && (
            <div>
              <Label>Manufacturer (vendor)</Label>
              <Select
                value={manufacturerId != null ? String(manufacturerId) : ""}
                onValueChange={(v) => setManufacturerId(Number(v))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose manufacturer" />
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
          )}

          {scope === "product" && (
            <ProductPicker picked={picked} onChange={setPicked} />
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Rate type</Label>
              <Select
                value={rateType}
                onValueChange={(v) => setRateType(v as ShippingRuleRateType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="flat">Flat ($ per item)</SelectItem>
                  <SelectItem value="percentage">
                    Percentage (% of price)
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="s-rate">
                {rateType === "flat" ? "Amount ($)" : "Percent (%)"}
              </Label>
              <Input
                id="s-rate"
                type="number"
                min={0}
                step={rateType === "flat" ? "0.01" : "0.1"}
                value={rateValue}
                onChange={(e) => setRateValue(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="s-label">Label (optional)</Label>
            <Input
              id="s-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Oversized umbrella handling"
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="s-active">Active</Label>
            <Switch
              id="s-active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

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
                  : "Create rule"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ProductPicker({
  picked,
  onChange,
}: {
  picked: PickedProduct[];
  onChange: (next: PickedProduct[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const enabled = debounced.length >= 2;
  const params = { page: 1, pageSize: 10, ...(debounced ? { q: debounced } : {}) };
  const results = useAdminListProducts(params, {
    query: {
      queryKey: getAdminListProductsQueryKey(params),
      enabled,
    },
  });
  const products = enabled ? results.data?.products ?? [] : [];
  const pickedIds = new Set(picked.map((p) => p.productId));

  function add(p: { id: number; sku: string; name: string }) {
    if (pickedIds.has(p.id)) return;
    onChange([...picked, { productId: p.id, sku: p.sku, name: p.name }]);
  }
  function remove(id: number) {
    onChange(picked.filter((p) => p.productId !== id));
  }

  return (
    <div>
      <Label>Products</Label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
        <Input
          className="pl-9"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name or SKU…"
        />
      </div>

      {enabled && (
        <div className="mt-2 border rounded-md max-h-44 overflow-y-auto divide-y">
          {results.isLoading ? (
            <div className="p-3 flex justify-center">
              <Spinner />
            </div>
          ) : products.length === 0 ? (
            <div className="p-3 text-sm text-slate-400">No products found.</div>
          ) : (
            products.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => add(p)}
                disabled={pickedIds.has(p.id)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed flex justify-between gap-2"
              >
                <span className="truncate">{p.name}</span>
                <span className="font-mono text-xs text-slate-400 shrink-0">
                  {p.sku}
                </span>
              </button>
            ))
          )}
        </div>
      )}

      {picked.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {picked.map((p) => (
            <Badge
              key={p.productId}
              variant="secondary"
              className="font-normal gap-1 pr-1"
            >
              <span className="font-mono text-xs">{p.sku}</span>
              <button
                type="button"
                onClick={() => remove(p.productId)}
                className="rounded-full hover:bg-slate-300/50 p-0.5"
                aria-label={`Remove ${p.sku}`}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
        </div>
      )}
      <p className="mt-1.5 text-xs text-slate-400">
        {picked.length} product{picked.length === 1 ? "" : "s"} selected.
      </p>
    </div>
  );
}
