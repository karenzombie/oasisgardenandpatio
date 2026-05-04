import { useMemo, useState, type FormEvent } from "react";
import { Link } from "wouter";
import {
  useListCatalogFabrics,
  useListCatalogProducts,
  useSubmitCushionOrder,
  type CatalogFabricOption,
  type CatalogProduct,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  CUSHION_TYPE_META,
  type CushionTypeKey,
  type MeasurementField,
} from "@/components/cushions/cushionTypes";
import { CheckCircle2, Plus, Trash2, X } from "lucide-react";

type Mode = "custom" | "stock";

type CustomItem = {
  cushionType: CushionTypeKey;
  quantity: number;
  notes: string;
  m: Record<MeasurementField, string>;
  thickness: string;
};

type StockItem = {
  productId: number | null;
  productLabel: string;
  fabricId: number | null;
  fabricLabel: string;
  fabricCustom: boolean;
  quantity: number;
  notes: string;
};

const TIE_OPTIONS = [
  { value: "velcro", label: "Velcro" },
  { value: "tie", label: "Tie" },
];
const WELT_OPTIONS = [
  { value: "self", label: "Self welt" },
  { value: "contrasting", label: "Contrasting" },
  { value: "none", label: "None" },
];
const YN_OPTIONS = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
];

function emptyCustomItem(type: CushionTypeKey): CustomItem {
  return {
    cushionType: type,
    quantity: 1,
    notes: "",
    m: { a: "", b: "", c: "", d: "", e: "", f: "" },
    thickness: "",
  };
}

function emptyStockItem(): StockItem {
  return {
    productId: null,
    productLabel: "",
    fabricId: null,
    fabricLabel: "",
    fabricCustom: false,
    quantity: 1,
    notes: "",
  };
}

export default function Cushions() {
  const [mode, setMode] = useState<Mode>("custom");
  const [customItems, setCustomItems] = useState<Record<string, CustomItem>>({});
  const [stockItems, setStockItems] = useState<StockItem[]>([emptyStockItem()]);

  // Customer info
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNotes, setCustomerNotes] = useState("");

  // Custom-mode fabric & options
  const [fabricSelection, setFabricSelection] = useState<{
    fabricId: number | null;
    label: string;
    itemNumber: string;
    custom: boolean;
  }>({ fabricId: null, label: "", itemNumber: "", custom: false });
  const [contrastingFabric, setContrastingFabric] = useState("");
  const [ties, setTies] = useState<string>("");
  const [seatWelt, setSeatWelt] = useState<string>("");
  const [backWelt, setBackWelt] = useState<string>("");
  const [buttons, setButtons] = useState<string>("");
  const [tuft, setTuft] = useState<string>("");
  const [templateAvailable, setTemplateAvailable] = useState<string>("");

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ orderNumber: string } | null>(null);

  const submit = useSubmitCushionOrder();

  function toggleCustomType(key: CushionTypeKey) {
    setCustomItems((prev) => {
      const next = { ...prev };
      if (next[key]) {
        delete next[key];
      } else {
        next[key] = emptyCustomItem(key);
      }
      return next;
    });
  }

  function updateCustomItem(key: CushionTypeKey, patch: Partial<CustomItem>) {
    setCustomItems((prev) => ({ ...prev, [key]: { ...prev[key]!, ...patch } }));
  }

  function updateStockItem(idx: number, patch: Partial<StockItem>) {
    setStockItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx]!, ...patch };
      return next;
    });
  }

  function addStockItem() {
    setStockItems((prev) => [...prev, emptyStockItem()]);
  }

  function removeStockItem(idx: number) {
    setStockItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function validate(): string | null {
    if (!customerName.trim()) return "Please enter your name.";
    if (
      customerEmail &&
      !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(customerEmail.trim())
    ) {
      return "Please enter a valid email address.";
    }
    if (mode === "custom") {
      const items = Object.values(customItems);
      if (items.length === 0) {
        return "Please select at least one cushion type.";
      }
      if (!fabricSelection.label.trim()) {
        return "Please choose a fabric.";
      }
      for (const it of items) {
        if (it.quantity < 1) return "Quantity must be at least 1 for each cushion.";
        for (const f of Object.values(it.m)) {
          if (f && !(Number(f) > 0)) {
            return "Measurements must be positive numbers.";
          }
        }
        if (it.thickness && !(Number(it.thickness) > 0)) {
          return "Thickness must be a positive number.";
        }
      }
    } else {
      if (stockItems.length === 0) return "Please add at least one item.";
      for (const it of stockItems) {
        if (!it.productId) return "Please choose a product for each line.";
        if (!it.fabricLabel.trim()) return "Please choose a fabric for each line.";
        if (it.quantity < 1) return "Quantity must be at least 1.";
      }
    }
    return null;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);

    const baseFields = {
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim() || null,
      customerPhone: customerPhone.trim() || null,
      customerNotes: customerNotes.trim() || null,
    };

    try {
      if (mode === "custom") {
        const items = Object.values(customItems).map((it) => ({
          cushionType: it.cushionType,
          quantity: it.quantity,
          notes: it.notes.trim() || null,
          measurementA: it.m.a ? Number(it.m.a) : null,
          measurementB: it.m.b ? Number(it.m.b) : null,
          measurementC: it.m.c ? Number(it.m.c) : null,
          measurementD: it.m.d ? Number(it.m.d) : null,
          measurementE: it.m.e ? Number(it.m.e) : null,
          measurementF: it.m.f ? Number(it.m.f) : null,
          thickness: it.thickness ? Number(it.thickness) : null,
        }));
        const res = await submit.mutateAsync({
          data: {
            orderKind: "custom",
            ...baseFields,
            fabricName: fabricSelection.label.trim(),
            fabricItemNumber: fabricSelection.itemNumber.trim() || null,
            contrastingFabricName: contrastingFabric.trim() || null,
            ties: (ties || null) as never,
            seatWelt: (seatWelt || null) as never,
            backWelt: (backWelt || null) as never,
            buttons: (buttons || null) as never,
            tuft: (tuft || null) as never,
            templateAvailable: (templateAvailable || null) as never,
            items,
          } as never,
        });
        setSuccess({ orderNumber: res.orderNumber });
      } else {
        const items = stockItems.map((it) => ({
          quantity: it.quantity,
          notes: it.notes.trim() || null,
          productId: it.productId,
          fabricId: it.fabricCustom ? null : it.fabricId,
          fabricName: it.fabricLabel.trim() || null,
        }));
        const res = await submit.mutateAsync({
          data: {
            orderKind: "stock",
            ...baseFields,
            items,
          } as never,
        });
        setSuccess({ orderNumber: res.orderNumber });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit.");
    }
  }

  if (success) {
    return (
      <div className="container mx-auto px-4 py-16 max-w-2xl text-center">
        <div className="flex justify-center mb-6">
          <CheckCircle2 className="w-16 h-16 text-[hsl(var(--brand-green,142_30%_30%))]" />
        </div>
        <h1 className="text-3xl font-serif text-foreground mb-3">
          Order received
        </h1>
        <p className="text-muted-foreground mb-2">
          Thank you, {customerName}. We have your cushion order.
        </p>
        <p className="text-lg font-mono text-foreground mb-8">
          Order #{success.orderNumber}
        </p>
        <p className="text-sm text-muted-foreground mb-8">
          {customerEmail
            ? "A confirmation email is on its way. We'll be in touch soon to confirm details and pricing."
            : "We'll be in touch soon to confirm details and pricing."}
        </p>
        <Link href="/">
          <Button variant="outline">Return to home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span className="mx-2">/</span>
        <span>Custom Cushions</span>
      </nav>

      <h1 className="text-4xl font-serif text-foreground mb-3">
        Custom Cushion Order
      </h1>
      <p className="text-muted-foreground max-w-2xl mb-8">
        Order replacement cushions for your existing patio furniture, or design
        a custom set with your own measurements. We'll follow up to confirm
        your requirements, pricing and lead time.
      </p>

      {/* Mode toggle */}
      <div className="inline-flex border border-border rounded-md overflow-hidden mb-10">
        <button
          type="button"
          className={`px-5 py-2 text-sm font-medium transition-colors ${
            mode === "custom"
              ? "bg-foreground text-background"
              : "bg-background text-foreground hover:bg-muted"
          }`}
          onClick={() => setMode("custom")}
        >
          Custom (with measurements)
        </button>
        <button
          type="button"
          className={`px-5 py-2 text-sm font-medium transition-colors border-l border-border ${
            mode === "stock"
              ? "bg-foreground text-background"
              : "bg-background text-foreground hover:bg-muted"
          }`}
          onClick={() => setMode("stock")}
        >
          For an existing product
        </button>
      </div>

      <form onSubmit={onSubmit} className="space-y-10">
        {mode === "custom" ? (
          <CustomSection
            customItems={customItems}
            toggle={toggleCustomType}
            update={updateCustomItem}
            fabricSelection={fabricSelection}
            setFabricSelection={setFabricSelection}
            contrastingFabric={contrastingFabric}
            setContrastingFabric={setContrastingFabric}
            ties={ties} setTies={setTies}
            seatWelt={seatWelt} setSeatWelt={setSeatWelt}
            backWelt={backWelt} setBackWelt={setBackWelt}
            buttons={buttons} setButtons={setButtons}
            tuft={tuft} setTuft={setTuft}
            templateAvailable={templateAvailable} setTemplateAvailable={setTemplateAvailable}
          />
        ) : (
          <StockSection
            items={stockItems}
            update={updateStockItem}
            add={addStockItem}
            remove={removeStockItem}
          />
        )}

        {/* Customer info */}
        <section>
          <h2 className="text-2xl font-serif text-foreground mb-4">
            Your Information
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="cname">Name <span className="text-destructive">*</span></Label>
              <Input
                id="cname"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                required
              />
            </div>
            <div>
              <Label htmlFor="cemail">Email</Label>
              <Input
                id="cemail"
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="for confirmation and follow-up"
              />
            </div>
            <div>
              <Label htmlFor="cphone">Phone</Label>
              <Input
                id="cphone"
                type="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="cnotes">Notes for our team (optional)</Label>
              <Textarea
                id="cnotes"
                value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>
        </section>

        {error && (
          <div className="p-4 bg-destructive/10 border border-destructive/30 rounded text-destructive text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center gap-4">
          <Button type="submit" size="lg" disabled={submit.isPending}>
            {submit.isPending ? "Submitting…" : "Submit order"}
          </Button>
          <p className="text-xs text-muted-foreground">
            We'll review and contact you to confirm details and pricing.
          </p>
        </div>
      </form>
    </div>
  );
}

// ---------- Custom mode ----------
function CustomSection(props: {
  customItems: Record<string, CustomItem>;
  toggle: (key: CushionTypeKey) => void;
  update: (key: CushionTypeKey, patch: Partial<CustomItem>) => void;
  fabricSelection: {
    fabricId: number | null;
    label: string;
    itemNumber: string;
    custom: boolean;
  };
  setFabricSelection: (v: {
    fabricId: number | null;
    label: string;
    itemNumber: string;
    custom: boolean;
  }) => void;
  contrastingFabric: string;
  setContrastingFabric: (v: string) => void;
  ties: string; setTies: (v: string) => void;
  seatWelt: string; setSeatWelt: (v: string) => void;
  backWelt: string; setBackWelt: (v: string) => void;
  buttons: string; setButtons: (v: string) => void;
  tuft: string; setTuft: (v: string) => void;
  templateAvailable: string; setTemplateAvailable: (v: string) => void;
}) {
  return (
    <>
      <section>
        <h2 className="text-2xl font-serif text-foreground mb-1">
          Choose cushion types
        </h2>
        <p className="text-sm text-muted-foreground mb-6">
          Click a card to include that cushion type, then enter the measurements
          shown on the diagram.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CUSHION_TYPE_META.map((meta) => {
            const item = props.customItems[meta.key];
            const selected = !!item;
            return (
              <button
                key={meta.key}
                type="button"
                aria-pressed={selected}
                onClick={() => props.toggle(meta.key)}
                className={`text-left border rounded-md p-4 transition-all ${
                  selected
                    ? "border-foreground ring-2 ring-foreground/20 bg-background"
                    : "border-border bg-background hover:border-muted-foreground"
                }`}
              >
                <div className="flex items-center justify-center mb-3 h-40">
                  <div className="w-[180px] h-40">
                    <meta.Diagram className="block w-full h-full" />
                  </div>
                </div>
                <p className="font-medium text-foreground">{meta.label}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {meta.description}
                </p>
                <p className="text-xs mt-2 text-foreground/70">
                  {selected ? "✓ Included — click to remove" : "Click to include"}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {Object.values(props.customItems).length > 0 && (
        <section>
          <h2 className="text-2xl font-serif text-foreground mb-4">
            Measurements
          </h2>
          <div className="space-y-4">
            {CUSHION_TYPE_META.filter((m) => props.customItems[m.key]).map(
              (meta) => {
                const item = props.customItems[meta.key]!;
                return (
                  <div
                    key={meta.key}
                    className="border border-border rounded-md p-4 bg-card"
                  >
                    <div className="flex items-start gap-4 flex-col md:flex-row">
                      <div className="md:w-48 shrink-0 flex items-center justify-center">
                        <div className="w-[200px] h-44">
                          <meta.Diagram className="block w-full h-full" />
                        </div>
                      </div>
                      <div className="flex-1 w-full">
                        <p className="font-medium mb-3">{meta.label}</p>
                        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                          {meta.fields.map((f) => (
                            <div key={f}>
                              <Label className="text-xs uppercase">({f})</Label>
                              <Input
                                inputMode="decimal"
                                value={item.m[f as MeasurementField]}
                                onChange={(e) =>
                                  props.update(meta.key, {
                                    m: { ...item.m, [f]: e.target.value },
                                  })
                                }
                                placeholder="in."
                              />
                            </div>
                          ))}
                          <div>
                            <Label className="text-xs uppercase">Thick.</Label>
                            <Input
                              inputMode="decimal"
                              value={item.thickness}
                              onChange={(e) =>
                                props.update(meta.key, {
                                  thickness: e.target.value,
                                })
                              }
                              placeholder="in."
                            />
                          </div>
                          <div>
                            <Label className="text-xs uppercase">Qty</Label>
                            <Input
                              type="number"
                              min={1}
                              value={item.quantity}
                              onChange={(e) =>
                                props.update(meta.key, {
                                  quantity: Math.max(
                                    1,
                                    Number(e.target.value) || 1,
                                  ),
                                })
                              }
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              },
            )}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-2xl font-serif text-foreground mb-4">
          Fabric &amp; Options
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <Label>Fabric Name / # <span className="text-destructive">*</span></Label>
            <FabricPicker
              value={props.fabricSelection}
              onChange={props.setFabricSelection}
            />
          </div>
          <div>
            <Label htmlFor="cf">Contrasting fabric (optional)</Label>
            <Input
              id="cf"
              value={props.contrastingFabric}
              onChange={(e) => props.setContrastingFabric(e.target.value)}
              placeholder="Name or item #"
            />
          </div>
          <RadioGroup label="Ties" name="ties" options={TIE_OPTIONS} value={props.ties} onChange={props.setTies} />
          <RadioGroup label="Seat (bottom) welt" name="seatWelt" options={WELT_OPTIONS} value={props.seatWelt} onChange={props.setSeatWelt} />
          <RadioGroup label="Back (top) welt" name="backWelt" options={WELT_OPTIONS} value={props.backWelt} onChange={props.setBackWelt} />
          <RadioGroup label="Buttons" name="buttons" options={YN_OPTIONS} value={props.buttons} onChange={props.setButtons} />
          <RadioGroup label="Tuft" name="tuft" options={YN_OPTIONS} value={props.tuft} onChange={props.setTuft} />
          <RadioGroup label="Template available" name="templateAvailable" options={YN_OPTIONS} value={props.templateAvailable} onChange={props.setTemplateAvailable} />
        </div>
      </section>
    </>
  );
}

function RadioGroup({
  label, name, options, value, onChange,
}: {
  label: string; name: string;
  options: Array<{ value: string; label: string }>;
  value: string; onChange: (v: string) => void;
}) {
  return (
    <div>
      <Label className="block mb-2">{label}</Label>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(value === opt.value ? "" : opt.value)}
            className={`px-3 py-1.5 text-sm border rounded transition-colors ${
              value === opt.value
                ? "bg-foreground text-background border-foreground"
                : "bg-background text-foreground border-border hover:border-muted-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <input type="hidden" name={name} value={value} />
    </div>
  );
}

// ---------- Stock mode ----------
function StockSection({
  items, update, add, remove,
}: {
  items: StockItem[];
  update: (idx: number, patch: Partial<StockItem>) => void;
  add: () => void;
  remove: (idx: number) => void;
}) {
  return (
    <section>
      <h2 className="text-2xl font-serif text-foreground mb-1">
        Replacement cushions
      </h2>
      <p className="text-sm text-muted-foreground mb-6">
        Pick the product the cushions belong to. The vendor already has the
        measurements on file for in-line products.
      </p>
      <div className="space-y-4">
        {items.map((it, idx) => (
          <div key={idx} className="border border-border rounded-md p-4 bg-card">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              <div className="md:col-span-5">
                <Label>Product</Label>
                <ProductPicker
                  value={{ productId: it.productId, label: it.productLabel }}
                  onChange={(v) => update(idx, { productId: v.productId, productLabel: v.label })}
                />
              </div>
              <div className="md:col-span-4">
                <Label>Fabric</Label>
                <FabricPicker
                  value={{
                    fabricId: it.fabricId,
                    label: it.fabricLabel,
                    itemNumber: "",
                    custom: it.fabricCustom,
                  }}
                  onChange={(v) =>
                    update(idx, {
                      fabricId: v.fabricId,
                      fabricLabel: v.label,
                      fabricCustom: v.custom,
                    })
                  }
                />
              </div>
              <div className="md:col-span-2">
                <Label>Qty</Label>
                <Input
                  type="number"
                  min={1}
                  value={it.quantity}
                  onChange={(e) =>
                    update(idx, {
                      quantity: Math.max(1, Number(e.target.value) || 1),
                    })
                  }
                />
              </div>
              <div className="md:col-span-1 flex items-end justify-end">
                {items.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(idx)}
                    aria-label="Remove line"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              <div className="md:col-span-12">
                <Label>Notes (optional)</Label>
                <Input
                  value={it.notes}
                  onChange={(e) => update(idx, { notes: e.target.value })}
                  placeholder="Anything our vendor should know about this line"
                />
              </div>
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" onClick={add}>
          <Plus className="w-4 h-4 mr-2" /> Add another item
        </Button>
      </div>
    </section>
  );
}

// ---------- Pickers ----------
function FabricPicker({
  value,
  onChange,
}: {
  value: {
    fabricId: number | null;
    label: string;
    itemNumber: string;
    custom: boolean;
  };
  onChange: (v: {
    fabricId: number | null;
    label: string;
    itemNumber: string;
    custom: boolean;
  }) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useListCatalogFabrics();
  const all = data?.fabrics ?? [];
  const filtered = useMemo<CatalogFabricOption[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return all.slice(0, 20);
    return all
      .filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.itemNumber.toLowerCase().includes(q) ||
          (f.manufacturerName ?? "").toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [all, query]);

  if (value.label && !open) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 px-3 py-2 border border-border rounded bg-background text-sm">
          {value.label}
          {value.itemNumber && (
            <span className="text-muted-foreground ml-2">#{value.itemNumber}</span>
          )}
          {value.custom && (
            <span className="text-xs text-muted-foreground ml-2">(custom)</span>
          )}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(true);
            setQuery("");
            onChange({ fabricId: null, label: "", itemNumber: "", custom: false });
          }}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        placeholder="Search Sunbrella fabrics by name or item #"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto bg-popover border border-border rounded shadow-md">
          {isLoading && <div className="p-3 text-sm text-muted-foreground">Loading…</div>}
          {!isLoading && filtered.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">No matches.</div>
          )}
          {filtered.map((f) => (
            <button
              key={f.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex justify-between items-center"
              onClick={() => {
                onChange({
                  fabricId: f.id,
                  label: f.name,
                  itemNumber: f.itemNumber,
                  custom: false,
                });
                setOpen(false);
                setQuery("");
              }}
            >
              <span>{f.name}</span>
              <span className="text-xs text-muted-foreground">#{f.itemNumber}</span>
            </button>
          ))}
          {query.trim() && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-t border-border"
              onClick={() => {
                onChange({
                  fabricId: null,
                  label: query.trim(),
                  itemNumber: "",
                  custom: true,
                });
                setOpen(false);
                setQuery("");
              }}
            >
              Use "<strong>{query.trim()}</strong>" as a custom fabric
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ProductPicker({
  value,
  onChange,
}: {
  value: { productId: number | null; label: string };
  onChange: (v: { productId: number | null; label: string }) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useListCatalogProducts({
    pageSize: 60,
    ...(query.trim() ? { q: query.trim() } : {}),
  } as never);
  const products: CatalogProduct[] = (data?.products ?? []) as CatalogProduct[];

  if (value.productId && value.label && !open) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 px-3 py-2 border border-border rounded bg-background text-sm">
          {value.label}
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setOpen(true);
            setQuery("");
            onChange({ productId: null, label: "" });
          }}
        >
          <X className="w-4 h-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input
        placeholder="Search by product name or SKU"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="absolute z-20 mt-1 w-full max-h-72 overflow-auto bg-popover border border-border rounded shadow-md">
          {isLoading && (
            <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
              <Spinner className="w-4 h-4" /> Loading…
            </div>
          )}
          {!isLoading && products.length === 0 && (
            <div className="p-3 text-sm text-muted-foreground">No products found.</div>
          )}
          {products.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
              onClick={() => {
                onChange({
                  productId: p.id,
                  label: `${p.manufacturerName ? p.manufacturerName + " — " : ""}${p.name} (${p.sku})`,
                });
                setOpen(false);
                setQuery("");
              }}
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-muted-foreground">
                {p.manufacturerName ?? "—"} · SKU {p.sku}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
