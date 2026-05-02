import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Plus, Trash2, Search } from "lucide-react";
import {
  useAdminListCustomers,
  useAdminGetCustomer,
  useAdminListProducts,
  useAdminCreateOrder,
  getAdminGetCustomerQueryKey,
  type AdminProduct,
  type AdminCustomer,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";

interface LineItem {
  productId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

export default function AgentNewOrder() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const createOrder = useAdminCreateOrder();

  const [customer, setCustomer] = useState<AdminCustomer | null>(null);
  const [shippingAddressId, setShippingAddressId] = useState<string>("");
  const [items, setItems] = useState<LineItem[]>([
    { productId: null, description: "", quantity: 1, unitPrice: 0 },
  ]);
  const [taxRatePct, setTaxRatePct] = useState("8.75");
  const [deliveryAmount, setDeliveryAmount] = useState("0");
  const [depositAmount, setDepositAmount] = useState("0");
  const [salespersonName, setSalespersonName] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");
  const [pickProductFor, setPickProductFor] = useState<number | null>(null);

  const detail = useAdminGetCustomer(customer?.id ?? 0, {
    query: {
      queryKey: getAdminGetCustomerQueryKey(customer?.id ?? 0),
      enabled: customer !== null,
    },
  });
  const addresses = detail.data?.addresses ?? [];

  useEffect(() => {
    if (addresses.length > 0 && !shippingAddressId) {
      const def = addresses.find((a) => a.isDefault) ?? addresses[0];
      setShippingAddressId(String(def.id));
    }
  }, [addresses, shippingAddressId]);

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0),
    [items],
  );
  const taxRate = (Number(taxRatePct) || 0) / 100;
  const taxAmount = subtotal * taxRate;
  const delivery = Number(deliveryAmount) || 0;
  const total = subtotal + taxAmount + delivery;
  const deposit = Number(depositAmount) || 0;
  const balanceDue = total - deposit;

  function updateItem(idx: number, patch: Partial<LineItem>) {
    setItems((curr) => curr.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  }
  function removeItem(idx: number) {
    setItems((curr) => curr.filter((_, i) => i !== idx));
  }
  function addItem() {
    setItems((curr) => [...curr, { productId: null, description: "", quantity: 1, unitPrice: 0 }]);
  }
  function applyProductToItem(idx: number, p: AdminProduct) {
    updateItem(idx, {
      productId: p.id,
      description: p.name,
      unitPrice: Number(p.price) || 0,
    });
    setPickProductFor(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customer) {
      toast({ title: "Pick a customer", variant: "destructive" });
      return;
    }
    const cleanItems = items.filter((it) => it.description.trim() && it.quantity > 0 && it.unitPrice >= 0);
    if (cleanItems.length === 0) {
      toast({ title: "Add at least one item with a description", variant: "destructive" });
      return;
    }
    try {
      const order = await createOrder.mutateAsync({
        data: {
          customerId: customer.id,
          shippingAddressId: shippingAddressId ? Number(shippingAddressId) : null,
          billingAddressId: shippingAddressId ? Number(shippingAddressId) : null,
          taxRate,
          deliveryAmount: delivery,
          depositAmount: deposit,
          orderType: "in_store",
          salespersonName: salespersonName.trim() || null,
          specialInstructions: specialInstructions.trim() || null,
          items: cleanItems.map((it) => ({
            productId: it.productId,
            variantId: null,
            fabricId: null,
            description: it.description.trim(),
            quantity: it.quantity,
            unitPrice: it.unitPrice,
            discountAmount: 0,
            discountReason: null,
            notes: null,
          })),
        },
      });
      toast({ title: `Order ${order.orderNumber} created` });
      navigate(`/agent/orders/${order.id}`);
    } catch (e: unknown) {
      toast({
        title: "Create failed",
        description: e instanceof Error ? e.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  return (
    <>
      <PageHeader title="New Order" subtitle="Build an in-store order for a customer." />
      <PageBody>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-md border bg-white p-4">
              <div className="text-xs font-medium text-slate-500 uppercase mb-2">Customer</div>
              {customer ? (
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <div className="font-medium">{customer.firstName} {customer.lastName}</div>
                    <div className="text-slate-500">{customer.email}</div>
                  </div>
                  <Button type="button" size="sm" variant="outline" onClick={() => { setCustomer(null); setShippingAddressId(""); }}>
                    Change
                  </Button>
                </div>
              ) : (
                <CustomerPicker onPick={setCustomer} />
              )}
            </div>

            {customer && addresses.length > 0 && (
              <div className="rounded-md border bg-white p-4">
                <Label>Shipping address</Label>
                <Select value={shippingAddressId} onValueChange={setShippingAddressId}>
                  <SelectTrigger className="mt-1.5"><SelectValue placeholder="Pick an address" /></SelectTrigger>
                  <SelectContent>
                    {addresses.map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.street1}, {a.city} {a.state} {a.zip}{a.isDefault ? " (default)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="rounded-md border bg-white">
              <div className="px-4 py-3 border-b font-medium flex justify-between items-center">
                <span>Items</span>
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  <Plus className="size-4 mr-1" /> Add line
                </Button>
              </div>
              <div className="p-4 space-y-3">
                {items.map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <Label className="text-xs">Description</Label>
                      <div className="flex gap-1">
                        <Input value={it.description} onChange={(e) => updateItem(idx, { description: e.target.value })}
                          placeholder="Item description" />
                        <Button type="button" variant="outline" size="sm" onClick={() => setPickProductFor(idx)} title="Pick product">
                          <Search className="size-4" />
                        </Button>
                      </div>
                      {it.productId && <div className="text-xs text-slate-500 mt-0.5">Product #{it.productId}</div>}
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" min={1} value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Unit price</Label>
                      <Input type="number" min={0} step="0.01" value={it.unitPrice}
                        onChange={(e) => updateItem(idx, { unitPrice: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-2 text-right text-sm pt-5">
                      {fmtMoney((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))}
                    </div>
                    <div className="col-span-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)}
                        disabled={items.length === 1}>
                        <Trash2 className="size-4 text-red-600" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border bg-white p-4 grid grid-cols-2 gap-3">
              <div>
                <Label>Salesperson name</Label>
                <Input value={salespersonName} onChange={(e) => setSalespersonName(e.target.value)} />
              </div>
              <div className="col-span-2">
                <Label>Special instructions</Label>
                <Textarea rows={2} value={specialInstructions} onChange={(e) => setSpecialInstructions(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-md border bg-white p-4 space-y-3">
              <div className="text-xs font-medium text-slate-500 uppercase">Totals</div>
              <div>
                <Label>Tax rate (%)</Label>
                <Input type="number" min={0} step="0.001" value={taxRatePct}
                  onChange={(e) => setTaxRatePct(e.target.value)} />
              </div>
              <div>
                <Label>Delivery</Label>
                <Input type="number" min={0} step="0.01" value={deliveryAmount}
                  onChange={(e) => setDeliveryAmount(e.target.value)} />
              </div>
              <div>
                <Label>Deposit</Label>
                <Input type="number" min={0} step="0.01" value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)} />
              </div>
              <div className="border-t pt-3 text-sm space-y-1">
                <div className="flex justify-between"><span>Subtotal</span><span>{fmtMoney(subtotal)}</span></div>
                <div className="flex justify-between"><span>Tax</span><span>{fmtMoney(taxAmount)}</span></div>
                <div className="flex justify-between"><span>Delivery</span><span>{fmtMoney(delivery)}</span></div>
                <div className="flex justify-between font-medium border-t pt-1"><span>Total</span><span>{fmtMoney(total)}</span></div>
                <div className="flex justify-between"><span>Deposit</span><span>{fmtMoney(deposit)}</span></div>
                <div className="flex justify-between font-medium"><span>Balance due</span><span>{fmtMoney(balanceDue)}</span></div>
              </div>
              <Button type="submit" className="w-full" disabled={createOrder.isPending || !customer}>
                {createOrder.isPending ? "Creating…" : "Create order"}
              </Button>
            </div>
          </div>
        </form>

        <ProductPickerDialog
          open={pickProductFor !== null}
          onOpenChange={(v) => !v && setPickProductFor(null)}
          onPick={(p) => pickProductFor !== null && applyProductToItem(pickProductFor, p)}
        />
      </PageBody>
    </>
  );
}

function CustomerPicker({ onPick }: { onPick: (c: AdminCustomer) => void }) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const list = useAdminListCustomers({
    ...(search ? { q: search } : {}),
    limit: 10,
    offset: 0,
  });

  return (
    <div>
      <div className="relative">
        <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Search customers by name or email…" className="pl-8" />
      </div>
      {search && (
        <div className="mt-2 border rounded max-h-60 overflow-y-auto">
          {list.isLoading ? (
            <div className="p-3 text-sm text-slate-500"><Spinner /></div>
          ) : (list.data?.rows ?? []).length === 0 ? (
            <div className="p-3 text-sm text-slate-500">No matches.</div>
          ) : (
            (list.data?.rows ?? []).map((c) => (
              <button key={c.id} type="button"
                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-t first:border-t-0 text-sm"
                onClick={() => onPick(c)}>
                <div className="font-medium">{c.firstName} {c.lastName}</div>
                <div className="text-xs text-slate-500">{c.email}{c.phone ? ` · ${c.phone}` : ""}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ProductPickerDialog({
  open, onOpenChange, onPick,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onPick: (p: AdminProduct) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  const list = useAdminListProducts({
    page: 1,
    pageSize: 20,
    ...(search ? { q: search } : {}),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Pick a product</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="size-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input autoFocus value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, SKU, or slug…" className="pl-8" />
        </div>
        <div className="border rounded max-h-96 overflow-y-auto">
          {list.isLoading ? (
            <div className="p-6 flex justify-center"><Spinner /></div>
          ) : (list.data?.products ?? []).length === 0 ? (
            <div className="p-6 text-sm text-slate-500 text-center">No products match.</div>
          ) : (
            (list.data?.products ?? []).map((p) => (
              <button key={p.id} type="button"
                className="w-full text-left px-3 py-2 hover:bg-slate-50 border-t first:border-t-0"
                onClick={() => { onPick(p); onOpenChange(false); }}>
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-medium text-sm">{p.name}</div>
                    <div className="text-xs text-slate-500 font-mono">{p.sku}</div>
                  </div>
                  <div className="text-sm tabular-nums">{p.price != null ? fmtMoney(Number(p.price)) : "—"}</div>
                </div>
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
