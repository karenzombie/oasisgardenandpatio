import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  useAdminListManufacturers,
  useAdminListCategories,
  useAdminListFabrics,
  useAdminBulkUpdateProducts,
  getAdminListProductsQueryKey,
  getAdminListManufacturersQueryKey,
  getAdminListCategoriesQueryKey,
  type AdminBulkUpdateProductsRequest,
} from "@workspace/api-client-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

type FabricMode = "none" | "replace" | "add" | "remove" | "clear";
type TriBool = "none" | "true" | "false";
type FkChoice = "none" | "clear" | string;
type PriceMode = "flat" | "percent";

const PRICE_FIELD_OPTIONS: { value: string; label: string }[] = [
  { value: "price", label: "Sell price" },
  { value: "salePrice", label: "Sale price" },
  { value: "cost", label: "Cost" },
  { value: "msrp", label: "MSRP" },
  { value: "frameOnlyPrice", label: "Frame only price" },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productIds: number[];
  onComplete: () => void;
}

export function BulkUpdateProductsDialog({
  open,
  onOpenChange,
  productIds,
  onComplete,
}: Props) {
  const qc = useQueryClient();
  const toast = useToast();
  const mut = useAdminBulkUpdateProducts();

  const mfgList = useAdminListManufacturers({
    query: {
      enabled: open,
      queryKey: getAdminListManufacturersQueryKey(),
    },
  });
  const catList = useAdminListCategories({
    query: { enabled: open, queryKey: getAdminListCategoriesQueryKey() },
  });
  const fabricsList = useAdminListFabrics({
    query: { enabled: open, queryKey: ["/api/admin/fabrics"] as const },
  });

  // Field state
  const [isActive, setIsActive] = useState<TriBool>("none");
  const [featured, setFeatured] = useState<TriBool>("none");
  const [inStoreOnly, setInStoreOnly] = useState<TriBool>("none");
  const [availableOnline, setAvailableOnline] = useState<TriBool>("none");
  const [categoryId, setCategoryId] = useState<FkChoice>("none");
  const [manufacturerId, setManufacturerId] = useState<FkChoice>("none");
  const [rankGroup, setRankGroup] = useState<FkChoice>("none");

  // Fabrics
  const [poolMode, setPoolMode] = useState<FabricMode>("none");
  const [poolMfgIds, setPoolMfgIds] = useState<Set<number>>(new Set());
  const [pickMode, setPickMode] = useState<FabricMode>("none");
  const [pickFabricIds, setPickFabricIds] = useState<Set<number>>(new Set());
  const [expandedFabricMfgs, setExpandedFabricMfgs] = useState<Set<number>>(
    new Set(),
  );

  // Pricing adjustment
  const [priceFields, setPriceFields] = useState<Set<string>>(new Set());
  const [priceMode, setPriceMode] = useState<PriceMode>("flat");
  const [priceAmount, setPriceAmount] = useState("");

  function reset() {
    setIsActive("none");
    setFeatured("none");
    setInStoreOnly("none");
    setAvailableOnline("none");
    setCategoryId("none");
    setManufacturerId("none");
    setRankGroup("none");
    setPoolMode("none");
    setPoolMfgIds(new Set());
    setPickMode("none");
    setPickFabricIds(new Set());
    setExpandedFabricMfgs(new Set());
    setPriceFields(new Set());
    setPriceMode("flat");
    setPriceAmount("");
  }

  const fabricsByMfg = useMemo(() => {
    const groups = new Map<
      number,
      {
        manufacturerId: number;
        manufacturerName: string;
        fabrics: typeof fabricsList.data extends infer T
          ? T extends Array<infer F>
            ? F[]
            : never
          : never;
      }
    >();
    for (const f of fabricsList.data ?? []) {
      const cur = groups.get(f.manufacturerId);
      if (cur) {
        cur.fabrics.push(f);
      } else {
        groups.set(f.manufacturerId, {
          manufacturerId: f.manufacturerId,
          manufacturerName: f.manufacturerName,
          fabrics: [f],
        });
      }
    }
    return Array.from(groups.values()).sort((a, b) =>
      a.manufacturerName.localeCompare(b.manufacturerName),
    );
  }, [fabricsList.data]);

  function toggleSet<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  }

  function buildPayload(): AdminBulkUpdateProductsRequest | { error: string } {
    const fields: NonNullable<AdminBulkUpdateProductsRequest["fields"]> = {};
    if (isActive !== "none") fields.isActive = isActive === "true";
    if (featured !== "none") fields.featured = featured === "true";
    if (inStoreOnly !== "none") fields.inStoreOnly = inStoreOnly === "true";
    if (availableOnline !== "none")
      fields.availableOnline = availableOnline === "true";
    if (categoryId !== "none")
      fields.categoryId = categoryId === "clear" ? null : Number(categoryId);
    if (manufacturerId !== "none")
      fields.manufacturerId =
        manufacturerId === "clear" ? null : Number(manufacturerId);
    if (rankGroup !== "none")
      fields.rankGroup = rankGroup === "clear" ? null : Number(rankGroup);

    const payload: AdminBulkUpdateProductsRequest = { productIds };
    if (Object.keys(fields).length > 0) payload.fields = fields;

    if (poolMode !== "none") {
      if (poolMode !== "clear" && poolMfgIds.size === 0) {
        return { error: "Pick at least one fabric brand for the pool change." };
      }
      payload.fabricPools = {
        mode: poolMode,
        ...(poolMode !== "clear"
          ? { manufacturerIds: Array.from(poolMfgIds) }
          : {}),
      };
    }
    if (pickMode !== "none") {
      if (pickMode !== "clear" && pickFabricIds.size === 0) {
        return { error: "Pick at least one fabric for the pick change." };
      }
      payload.fabricPicks = {
        mode: pickMode,
        ...(pickMode !== "clear"
          ? { fabricIds: Array.from(pickFabricIds) }
          : {}),
      };
    }

    if (priceFields.size > 0) {
      const amount = Number(priceAmount);
      if (priceAmount === "" || isNaN(amount) || amount === 0) {
        return {
          error:
            "Enter a non-zero amount for the pricing adjustment.",
        };
      }
      payload.priceAdjustments = {
        fields: Array.from(priceFields) as NonNullable<
          AdminBulkUpdateProductsRequest["priceAdjustments"]
        >["fields"],
        mode: priceMode,
        amount,
      };
    }

    if (
      !payload.fields &&
      !payload.fabricPools &&
      !payload.fabricPicks &&
      !payload.priceAdjustments
    ) {
      return { error: "Choose at least one change to apply." };
    }
    return payload;
  }

  async function submit() {
    const result = buildPayload();
    if ("error" in result) {
      toast.toast({
        variant: "destructive",
        title: "Nothing to do",
        description: result.error,
      });
      return;
    }
    try {
      const res = await mut.mutateAsync({ data: result });
      const parts: string[] = [];
      if (res.productsUpdated > 0)
        parts.push(`${res.productsUpdated} field update(s)`);
      if (res.pricesUpdated > 0)
        parts.push(`${res.pricesUpdated} price adjustment(s)`);
      if (res.fabricsUpdated > 0)
        parts.push(`${res.fabricsUpdated} fabric change(s)`);
      const desc =
        parts.length > 0
          ? parts.join(", ")
          : "No products needed updating.";
      toast.toast({
        title: "Bulk update complete",
        description:
          res.notFound.length > 0
            ? `${desc} (${res.notFound.length} not found)`
            : desc,
      });
      await qc.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
      reset();
      onComplete();
    } catch (err) {
      toast.toast({
        variant: "destructive",
        title: "Bulk update failed",
        description: err instanceof Error ? err.message : "Try again.",
      });
    }
  }

  const pricePreview = useMemo(() => {
    if (priceFields.size === 0) return null;
    const amount = Number(priceAmount);
    if (!priceAmount || isNaN(amount) || amount === 0) return null;
    const sign = amount > 0 ? "+" : "";
    const change =
      priceMode === "flat"
        ? `${sign}$${Math.abs(amount).toFixed(2)}`
        : `${sign}${amount}%`;
    const fieldLabels = Array.from(priceFields)
      .map((f) => PRICE_FIELD_OPTIONS.find((o) => o.value === f)?.label ?? f)
      .join(", ");
    return `${change} applied to: ${fieldLabels}`;
  }, [priceFields, priceMode, priceAmount]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk update {productIds.length} product(s)</DialogTitle>
          <DialogDescription>
            Only fields you change will be touched. Leave a setting on
            "No change" to skip it.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Scalar fields */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Fields</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <FieldSelect
                label="Status"
                value={isActive}
                onChange={(v) => setIsActive(v as TriBool)}
                options={[
                  { value: "none", label: "No change" },
                  { value: "true", label: "Active" },
                  { value: "false", label: "Inactive" },
                ]}
              />
              <FieldSelect
                label="Featured"
                value={featured}
                onChange={(v) => setFeatured(v as TriBool)}
                options={[
                  { value: "none", label: "No change" },
                  { value: "true", label: "Featured" },
                  { value: "false", label: "Not featured" },
                ]}
              />
              <FieldSelect
                label="In-store only"
                value={inStoreOnly}
                onChange={(v) => setInStoreOnly(v as TriBool)}
                options={[
                  { value: "none", label: "No change" },
                  { value: "true", label: "In-store only" },
                  { value: "false", label: "Available everywhere" },
                ]}
              />
              <FieldSelect
                label="Available online"
                value={availableOnline}
                onChange={(v) => setAvailableOnline(v as TriBool)}
                options={[
                  { value: "none", label: "No change" },
                  { value: "true", label: "Yes" },
                  { value: "false", label: "No" },
                ]}
              />
              <FieldSelect
                label="Category"
                value={categoryId}
                onChange={setCategoryId}
                options={[
                  { value: "none", label: "No change" },
                  { value: "clear", label: "(Clear category)" },
                  ...(catList.data ?? []).map((c) => ({
                    value: String(c.id),
                    label: c.name,
                  })),
                ]}
              />
              <FieldSelect
                label="Brand / vendor"
                value={manufacturerId}
                onChange={setManufacturerId}
                options={[
                  { value: "none", label: "No change" },
                  { value: "clear", label: "(Clear brand)" },
                  ...(mfgList.data ?? []).map((m) => ({
                    value: String(m.id),
                    label: m.name,
                  })),
                ]}
              />
              <FieldSelect
                label="Rank group"
                value={rankGroup}
                onChange={setRankGroup}
                options={[
                  { value: "none", label: "No change" },
                  { value: "clear", label: "(Remove from group)" },
                  { value: "1", label: "Group 1 (highest priority)" },
                  { value: "2", label: "Group 2" },
                  { value: "3", label: "Group 3" },
                ]}
              />
            </div>
          </section>

          {/* Pricing adjustment */}
          <section className="space-y-3 border-t border-slate-200 pt-5">
            <h3 className="text-sm font-semibold text-slate-800">
              Pricing adjustment
            </h3>
            <p className="text-xs text-slate-500">
              Apply a flat dollar amount or percentage change to selected price
              fields. Fields that are blank on a product are skipped.
            </p>

            {/* Field checkboxes */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
              {PRICE_FIELD_OPTIONS.map((f) => (
                <label
                  key={f.value}
                  className="flex items-center gap-2 text-sm text-slate-700 hover:bg-slate-50 px-2 py-1.5 rounded cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={priceFields.has(f.value)}
                    onChange={() =>
                      setPriceFields((s) => toggleSet(s, f.value))
                    }
                  />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>

            {priceFields.size > 0 && (
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {/* Mode toggle */}
                <div className="flex rounded border border-slate-200 overflow-hidden text-sm">
                  <button
                    type="button"
                    onClick={() => setPriceMode("flat")}
                    className={`px-3 py-1.5 ${
                      priceMode === "flat"
                        ? "bg-[#1A3C5E] text-white"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    $ Flat
                  </button>
                  <button
                    type="button"
                    onClick={() => setPriceMode("percent")}
                    className={`px-3 py-1.5 border-l border-slate-200 ${
                      priceMode === "percent"
                        ? "bg-[#1A3C5E] text-white"
                        : "bg-white text-slate-700 hover:bg-slate-50"
                    }`}
                  >
                    % Percent
                  </button>
                </div>

                {/* Amount */}
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={priceAmount}
                    onChange={(e) => setPriceAmount(e.target.value)}
                    placeholder={
                      priceMode === "flat" ? "e.g. 50 or −25" : "e.g. 5 or −3"
                    }
                    className="h-8 w-36 text-sm"
                  />
                  <span className="text-sm text-slate-500">
                    {priceMode === "flat" ? "dollars" : "%"}
                  </span>
                </div>
              </div>
            )}

            {/* Live preview */}
            {pricePreview && (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                Preview: {pricePreview}
              </p>
            )}

            {priceFields.size > 0 && (
              <p className="text-xs text-slate-500">
                Positive values increase prices; negative values decrease them.
                Results are rounded to 2 decimal places and never go below $0.
              </p>
            )}
          </section>

          {/* Fabric pools */}
          <section className="space-y-3 border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">
                Fabric brand pools
              </h3>
              <FieldSelect
                value={poolMode}
                onChange={(v) => setPoolMode(v as FabricMode)}
                options={[
                  { value: "none", label: "No change" },
                  { value: "add", label: "Add brands" },
                  { value: "replace", label: "Replace with…" },
                  { value: "remove", label: "Remove brands" },
                  { value: "clear", label: "Clear all brands" },
                ]}
                compact
              />
            </div>
            {poolMode !== "none" && poolMode !== "clear" && (
              <div className="border border-slate-200 rounded-md max-h-48 overflow-auto p-2 grid grid-cols-1 sm:grid-cols-2 gap-1">
                {(mfgList.data ?? []).map((m) => {
                  const checked = poolMfgIds.has(m.id);
                  return (
                    <label
                      key={m.id}
                      className="flex items-center gap-2 text-sm text-slate-700 hover:bg-slate-50 px-2 py-1 rounded cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setPoolMfgIds((s) => toggleSet(s, m.id))
                        }
                      />
                      <span className="truncate">{m.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            {poolMode !== "none" && (
              <p className="text-xs text-slate-500">
                {poolMode === "add" &&
                  `Add the selected fabric brand(s) to every chosen product's pool — existing brands stay.`}
                {poolMode === "replace" &&
                  `Replace each chosen product's brand pool with exactly the selected brand(s).`}
                {poolMode === "remove" &&
                  `Remove the selected fabric brand(s) from every chosen product's pool.`}
                {poolMode === "clear" &&
                  `Remove all fabric brand pools from every chosen product.`}
              </p>
            )}
          </section>

          {/* Fabric individual picks */}
          <section className="space-y-3 border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-800">
                Individual fabric picks
              </h3>
              <FieldSelect
                value={pickMode}
                onChange={(v) => setPickMode(v as FabricMode)}
                options={[
                  { value: "none", label: "No change" },
                  { value: "add", label: "Add fabrics" },
                  { value: "replace", label: "Replace with…" },
                  { value: "remove", label: "Remove fabrics" },
                  { value: "clear", label: "Clear all picks" },
                ]}
                compact
              />
            </div>
            {pickMode !== "none" && pickMode !== "clear" && (
              <div className="border border-slate-200 rounded-md max-h-72 overflow-auto p-2 space-y-1">
                {fabricsByMfg.length === 0 && (
                  <p className="text-sm text-slate-500 px-2 py-1">
                    No fabrics in the catalog yet.
                  </p>
                )}
                {fabricsByMfg.map((g) => {
                  const expanded = expandedFabricMfgs.has(g.manufacturerId);
                  const pickedInGroup = g.fabrics.filter((f) =>
                    pickFabricIds.has(f.id),
                  ).length;
                  return (
                    <div
                      key={g.manufacturerId}
                      className="border border-slate-100 rounded"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedFabricMfgs((s) =>
                            toggleSet(s, g.manufacturerId),
                          )
                        }
                        className="w-full flex items-center gap-2 px-2 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                      >
                        {expanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        )}
                        <span>{g.manufacturerName}</span>
                        <span className="ml-auto text-xs text-slate-500">
                          {pickedInGroup} / {g.fabrics.length}
                        </span>
                      </button>
                      {expanded && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 px-2 pb-2">
                          {g.fabrics.map((f) => {
                            const checked = pickFabricIds.has(f.id);
                            return (
                              <label
                                key={f.id}
                                className="flex items-center gap-2 text-sm text-slate-700 hover:bg-slate-50 px-2 py-1 rounded cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() =>
                                    setPickFabricIds((s) => toggleSet(s, f.id))
                                  }
                                />
                                {f.swatchImageUrl && (
                                  <img
                                    src={f.swatchImageUrl}
                                    alt=""
                                    className="size-5 rounded object-cover border border-slate-200"
                                  />
                                )}
                                <span className="font-mono text-xs text-slate-500">
                                  {f.itemNumber}
                                </span>
                                <span className="truncate">{f.name}</span>
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {pickMode !== "none" && (
              <p className="text-xs text-slate-500">
                {pickMode === "add" &&
                  "Add the chosen fabrics on top of each product's existing picks."}
                {pickMode === "replace" &&
                  "Replace each product's pick list with exactly the chosen fabrics."}
                {pickMode === "remove" &&
                  "Remove the chosen fabrics from each product's pick list."}
                {pickMode === "clear" &&
                  "Clear every chosen product's individual fabric picks."}
              </p>
            )}
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={submit}
            disabled={mut.isPending}
            className="bg-[#1A3C5E] hover:bg-[#15314c] text-white"
          >
            {mut.isPending
              ? "Applying…"
              : `Apply to ${productIds.length} product(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FieldSelect({
  label,
  value,
  onChange,
  options,
  compact = false,
}: {
  label?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  compact?: boolean;
}) {
  return (
    <div className={compact ? "" : "space-y-1"}>
      {label && (
        <label className="block text-xs font-medium text-slate-600">
          {label}
        </label>
      )}
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className={compact ? "h-8 text-xs w-44" : ""}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
