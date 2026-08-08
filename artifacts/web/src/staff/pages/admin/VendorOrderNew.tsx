import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, Search } from "lucide-react";
import {
  useAdminListManufacturers,
  useAdminListProducts,
  useAdminGetProductPicker,
  getAdminGetProductPickerQueryKey,
  useAdminCreateStandaloneVendorOrder,
  type AdminProduct,
  type AdminProductPickerDetail,
  type CatalogProductVariant,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

type LineItem = {
  uid: string; // local-only ID for React keys
  productId: number;
  productName: string;
  productSku: string;
  variantId: number | null;
  variantName: string | null;
  /** Fabric grade key (e.g. "A", "B"). Null for non-grade-priced products. */
  grade: string | null;
  /** Finish ID for finish-graded (tile) products. */
  finishId: number | null;
  /** Human-readable label for the selected grade/finish, shown in the row. */
  gradeLabel: string | null;
  quantity: number;
  notes: string;
};

let _uidCounter = 1;
function makeUid(): string {
  return `li_${_uidCounter++}`;
}

export default function VendorOrderNew() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const [manufacturerId, setManufacturerId] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [noteToVendor, setNoteToVendor] = useState("");
  const [eta, setEta] = useState(""); // yyyy-mm-dd
  const [shipMode, setShipMode] = useState<"store" | "drop">("store");
  const [shipToName, setShipToName] = useState("");
  const [shipToLine1, setShipToLine1] = useState("");
  const [shipToLine2, setShipToLine2] = useState("");
  const [shipToCity, setShipToCity] = useState("");
  const [shipToState, setShipToState] = useState("");
  const [shipToPostalCode, setShipToPostalCode] = useState("");
  const [shipToPhone, setShipToPhone] = useState("");
  const [items, setItems] = useState<LineItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const mfgList = useAdminListManufacturers();
  const manufacturers = mfgList.data ?? [];

  const create = useAdminCreateStandaloneVendorOrder();

  function handleAddItem(
    product: AdminProduct,
    variant: CatalogProductVariant | null,
    grade: string | null,
    finishId: number | null,
    gradeLabel: string | null,
  ) {
    setItems((prev) => [
      ...prev,
      {
        uid: makeUid(),
        productId: product.id,
        productName: product.name,
        productSku: product.sku,
        variantId: variant?.id ?? null,
        variantName: variant?.name ?? null,
        grade,
        finishId,
        gradeLabel,
        quantity: 1,
        notes: "",
      },
    ]);
    setPickerOpen(false);
  }

  function updateItem(uid: string, patch: Partial<LineItem>) {
    setItems((prev) =>
      prev.map((it) => (it.uid === uid ? { ...it, ...patch } : it)),
    );
  }

  function removeItem(uid: string) {
    setItems((prev) => prev.filter((it) => it.uid !== uid));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!manufacturerId) {
      toast({ title: "Pick a vendor", variant: "destructive" });
      return;
    }
    if (items.length === 0) {
      toast({ title: "Add at least one line item", variant: "destructive" });
      return;
    }
    if (shipMode === "drop") {
      if (!shipToLine1 || !shipToCity || !shipToState || !shipToPostalCode) {
        toast({
          title: "Drop-ship address needs line 1, city, state and ZIP",
          variant: "destructive",
        });
        return;
      }
    }

    try {
      const created = await create.mutateAsync({
        data: {
          manufacturerId: Number(manufacturerId),
          notes: notes.trim() || null,
          noteToVendor: noteToVendor.trim() || null,
          vendorEstimatedDeliveryDate: eta
            ? new Date(eta).toISOString()
            : null,
          shipToStore: shipMode === "store",
          shipToName: shipMode === "drop" ? shipToName.trim() || null : null,
          shipToLine1: shipMode === "drop" ? shipToLine1.trim() : null,
          shipToLine2:
            shipMode === "drop" ? shipToLine2.trim() || null : null,
          shipToCity: shipMode === "drop" ? shipToCity.trim() : null,
          shipToState: shipMode === "drop" ? shipToState.trim() : null,
          shipToPostalCode:
            shipMode === "drop" ? shipToPostalCode.trim() : null,
          shipToPhone:
            shipMode === "drop" ? shipToPhone.trim() || null : null,
          items: items.map((it) => ({
            productId: it.productId,
            variantId: it.variantId,
            quantity: it.quantity,
            notes: it.notes.trim() || null,
            grade: it.grade ?? null,
            finishId: it.finishId ?? null,
          })),
        },
      });
      toast({
        title: "Vendor order created",
        description: created.vendorOrderNumber,
      });
      setLocation(`/admin/vendor-orders/${created.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create";
      toast({ title: msg, variant: "destructive" });
    }
  }

  return (
    <>
      <PageHeader
        title="New Vendor Order"
        subtitle="Create a purchase order directly, without a customer order."
        action={
          <Button
            type="button"
            variant="outline"
            onClick={() => setLocation("/admin/vendor-orders")}
          >
            <ArrowLeft className="size-4 mr-1" />
            Back
          </Button>
        }
      />
      <PageBody>
        <form
          onSubmit={handleSubmit}
          className="max-w-3xl mx-auto space-y-6"
        >
          {/* Vendor + meta */}
          <section className="rounded border bg-white p-4 space-y-3">
            <div>
              <Label className="text-xs">
                Vendor <span className="text-red-600">*</span>
              </Label>
              <Select
                value={manufacturerId}
                onValueChange={setManufacturerId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Pick a vendor" />
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
              <div>
                <Label className="text-xs">Vendor ETA</Label>
                <Input
                  type="date"
                  value={eta}
                  onChange={(e) => setEta(e.target.value)}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Note to Vendor</Label>
              <Textarea
                value={noteToVendor}
                onChange={(e) => setNoteToVendor(e.target.value)}
                rows={2}
                placeholder="Message to the vendor — printed in bold, ALL CAPS at the top of the PO"
              />
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Optional notes printed on the PO"
              />
            </div>
          </section>

          {/* Ship-to */}
          <section className="rounded border bg-white p-4 space-y-3">
            <div className="font-medium text-sm">Ship to</div>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="shipMode"
                  value="store"
                  checked={shipMode === "store"}
                  onChange={() => setShipMode("store")}
                />
                Oasis warehouse (receive bumps inventory)
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="shipMode"
                  value="drop"
                  checked={shipMode === "drop"}
                  onChange={() => setShipMode("drop")}
                />
                Drop-ship to address
              </label>
            </div>
            {shipMode === "drop" && (
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs">Recipient name</Label>
                  <Input
                    value={shipToName}
                    onChange={(e) => setShipToName(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">
                    Address line 1 <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    value={shipToLine1}
                    onChange={(e) => setShipToLine1(e.target.value)}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Address line 2</Label>
                  <Input
                    value={shipToLine2}
                    onChange={(e) => setShipToLine2(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    City <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    value={shipToCity}
                    onChange={(e) => setShipToCity(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    State <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    value={shipToState}
                    onChange={(e) => setShipToState(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">
                    Postal code <span className="text-red-600">*</span>
                  </Label>
                  <Input
                    value={shipToPostalCode}
                    onChange={(e) => setShipToPostalCode(e.target.value)}
                  />
                </div>
                <div>
                  <Label className="text-xs">Phone</Label>
                  <Input
                    value={shipToPhone}
                    onChange={(e) => setShipToPhone(e.target.value)}
                  />
                </div>
              </div>
            )}
          </section>

          {/* Line items */}
          <section className="rounded border bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="font-medium text-sm">
                Line items{" "}
                <span className="text-xs text-slate-500">
                  ({items.length})
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={() => setPickerOpen(true)}
              >
                <Plus className="size-4 mr-1" />
                Add product
              </Button>
            </div>
            {items.length === 0 ? (
              <div className="text-sm text-slate-500 py-6 text-center border-2 border-dashed rounded">
                No line items yet. Click <strong>Add product</strong> to pick
                products from the catalog.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs text-slate-500">
                    <tr>
                      <th className="py-1 pr-2 font-medium">Product</th>
                      <th className="py-1 px-2 font-medium w-20">Qty</th>
                      <th className="py-1 pl-2 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it) => (
                      <tr key={it.uid} className="border-t align-top">
                        <td className="py-2 pr-2">
                          <div className="font-medium">{it.productName}</div>
                          <div className="text-xs text-slate-500 font-mono">
                            {it.productSku}
                          </div>
                          {it.variantName && (
                            <div className="text-xs text-slate-600">
                              {it.variantName}
                            </div>
                          )}
                          {it.gradeLabel && (
                            <div className="text-xs text-slate-500">
                              {it.gradeLabel}
                            </div>
                          )}
                          <Input
                            value={it.notes}
                            onChange={(e) =>
                              updateItem(it.uid, { notes: e.target.value })
                            }
                            placeholder="Line notes (optional)"
                            className="mt-1 h-7 text-xs"
                          />
                        </td>
                        <td className="py-2 px-2">
                          <Input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) =>
                              updateItem(it.uid, {
                                quantity: Math.max(
                                  1,
                                  Math.floor(Number(e.target.value) || 1),
                                ),
                              })
                            }
                            className="h-8"
                          />
                        </td>
                        <td className="py-2 pl-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeItem(it.uid)}
                          >
                            <Trash2 className="size-4 text-red-600" />
                          </Button>
                        </td>
                      </tr>
                    ))}

                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setLocation("/admin/vendor-orders")}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creating…" : "Create vendor order"}
            </Button>
          </div>
        </form>

        <ProductPickerDialog
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          onApply={handleAddItem}
        />
      </PageBody>
    </>
  );
}

// ---------------------------------------------------------------------------
// Product picker — simplified version of the agent NewOrder picker.
// Asks for variant, and also for grade (grade-priced products) or finish
// (finish-graded / tile products) when applicable, so the server can freeze
// a meaningful unit_cost_snapshot on creation.
// ---------------------------------------------------------------------------
function ProductPickerDialog({
  open,
  onOpenChange,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onApply: (
    product: AdminProduct,
    variant: CatalogProductVariant | null,
    grade: string | null,
    finishId: number | null,
    gradeLabel: string | null,
  ) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<AdminProduct | null>(null);
  const [variantId, setVariantId] = useState<string>("");
  // Grade key for grade-priced variants (e.g. "A", "B", "C").
  const [gradeKey, setGradeKey] = useState<string>("");
  // Finish ID (as string for Select) for finish-graded (tile) products.
  const [finishIdStr, setFinishIdStr] = useState<string>("");

  // Debounced search so we don't query on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 200);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset when dialog closes.
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setVariantId("");
      setGradeKey("");
      setFinishIdStr("");
      setSearchInput("");
      setSearch("");
    }
  }, [open]);

  // Reset grade/finish when variant changes.
  useEffect(() => {
    setGradeKey("");
    setFinishIdStr("");
  }, [variantId]);

  const list = useAdminListProducts({
    page: 1,
    pageSize: 20,
    ...(search ? { q: search } : {}),
  });

  const pickedId = picked?.id ?? 0;
  const detail = useAdminGetProductPicker(pickedId, {
    query: {
      queryKey: getAdminGetProductPickerQueryKey(pickedId),
      enabled: !!picked,
      staleTime: 0,
    },
  });
  const variants = detail.data?.variants ?? [];
  const finishes: AdminProductPickerDetail["finishes"] =
    detail.data?.finishes ?? [];
  const selectedVariant =
    variants.find((x) => String(x.id) === variantId) ?? null;

  const needsVariant = variants.length > 0;
  // Finish-graded (tile): product has finishes — finish selector drives the grade key.
  const needsFinish = finishes.length > 0;
  // Grade-priced: variant has grade rows but product has no finish selector.
  const needsGrade =
    !needsFinish && (selectedVariant?.gradePrices.length ?? 0) > 0;

  const detailReady = !!picked && !detail.isLoading && !!detail.data;
  const canAdd =
    detailReady &&
    (!needsVariant || !!variantId) &&
    (!needsFinish || !!finishIdStr) &&
    (!needsGrade || !!gradeKey);

  function handleAdd() {
    if (!picked || !detailReady) return;
    if (needsVariant && !variantId) return;
    if (needsFinish && !finishIdStr) return;
    if (needsGrade && !gradeKey) return;

    const v = needsVariant ? selectedVariant : null;
    const resolvedGrade = needsGrade && gradeKey ? gradeKey : null;
    const resolvedFinishId =
      needsFinish && finishIdStr ? Number(finishIdStr) : null;

    // Build a human-readable label for the line item row.
    let resolvedLabel: string | null = null;
    if (needsGrade && gradeKey) {
      resolvedLabel = `Grade ${gradeKey}`;
    } else if (needsFinish && finishIdStr) {
      const f = finishes.find((x) => String(x.id) === finishIdStr);
      resolvedLabel = f ? f.name : null;
    }

    onApply(picked, v, resolvedGrade, resolvedFinishId, resolvedLabel);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Pick a product</DialogTitle>
        </DialogHeader>

        {!picked ? (
          <>
            <div className="relative">
              <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                autoFocus
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search by name, SKU, or slug…"
                className="pl-8"
              />
            </div>
            <div className="border rounded max-h-96 overflow-y-auto">
              {list.isLoading ? (
                <div className="p-6 flex justify-center">
                  <Spinner />
                </div>
              ) : (list.data?.products ?? []).length === 0 ? (
                <div className="p-6 text-sm text-slate-500 text-center">
                  No products match.
                </div>
              ) : (
                (list.data?.products ?? []).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 border-t first:border-t-0"
                    onClick={() => setPicked(p)}
                  >
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium text-sm">{p.name}</div>
                        <div className="text-xs text-slate-500 font-mono">
                          {p.sku}
                        </div>
                      </div>
                      <div className="text-sm tabular-nums text-slate-600">
                        cost{" "}
                        {p.cost != null && p.cost !== ""
                          ? fmtMoney(Number(p.cost))
                          : "—"}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </>
        ) : (
          <div className="space-y-3">
            <div className="rounded border bg-slate-50 p-3 flex justify-between items-start">
              <div>
                <div className="font-medium">{picked.name}</div>
                <div className="text-xs text-slate-500 font-mono">
                  {picked.sku}
                </div>
                <div className="text-xs text-slate-500 mt-1">
                  Cost resolved on save
                </div>
              </div>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setPicked(null);
                  setVariantId("");
                  setGradeKey("");
                  setFinishIdStr("");
                }}
              >
                Change product
              </Button>
            </div>

            {detail.isLoading && (
              <div className="flex justify-center py-3">
                <Spinner />
              </div>
            )}

            {needsVariant && (
              <div>
                <Label className="text-xs">
                  {variants[0]?.optionLabel || "Variant"}{" "}
                  <span className="text-red-600">*</span>
                </Label>
                <Select value={variantId} onValueChange={setVariantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a variant" />
                  </SelectTrigger>
                  <SelectContent>
                    {variants.map((v) => (
                      <SelectItem key={v.id} value={String(v.id)}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!needsVariant && !detail.isLoading && (
              <div className="text-xs text-slate-500">
                No variants required for this product.
              </div>
            )}

            {/* Grade selector — grade-priced variants (e.g. Frankford) */}
            {needsGrade && (
              <div>
                <Label className="text-xs">
                  Grade <span className="text-red-600">*</span>
                </Label>
                <Select value={gradeKey} onValueChange={setGradeKey}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a grade" />
                  </SelectTrigger>
                  <SelectContent>
                    {(selectedVariant?.gradePrices ?? []).map((gp) => (
                      <SelectItem key={gp.grade} value={gp.grade}>
                        Grade {gp.grade}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Finish selector — finish-graded / tile products */}
            {needsFinish && (
              <div>
                <Label className="text-xs">
                  Finish / Tile <span className="text-red-600">*</span>
                </Label>
                <Select value={finishIdStr} onValueChange={setFinishIdStr}>
                  <SelectTrigger>
                    <SelectValue placeholder="Pick a finish" />
                  </SelectTrigger>
                  <SelectContent>
                    {finishes.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {f.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        )}

        {picked && (
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="button" disabled={!canAdd} onClick={handleAdd}>
              Add to PO
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
