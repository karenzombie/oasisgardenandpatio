import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useLocation } from "wouter";
import { Plus, Trash2, Search, Sparkles } from "lucide-react";
import {
  useAdminListCustomers,
  useAdminGetCustomer,
  useAdminListProducts,
  useAdminListManufacturers,
  useAdminCreateOrder,
  useAdminCreateCustomer,
  useAdminQuoteOrderPricing,
  useGetCatalogProductBySlug,
  getAdminGetCustomerQueryKey,
  getAdminListProductsQueryKey,
  getGetCatalogProductBySlugQueryKey,
  type AdminProduct,
  type AdminCustomer,
  type CatalogProductVariant,
  type CatalogFabricOption,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { PageBody, PageHeader } from "../../StaffShell";
import { useStaffSession } from "../../lib/staffSession";

type CustomerMode = "existing" | "new" | "quick" | "restock";

interface LineItem {
  productId: number | null;
  productSlug: string | null;
  variantId: number | null;
  variantName: string | null;
  fabricId: number | null;
  fabricName: string | null;
  // Optional: source the fabric from a different manufacturer than the
  // product's own vendor. When set, the server splits this line into
  // its own fabric-only PO grouped by `fabricVendorId`.
  fabricVendorId: number | null;
  description: string;
  quantity: number;
  unitPrice: number;
  unitPriceOverridden: boolean;
}

interface NewCustomerForm {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  companyName: string;
  sendInvite: boolean;
}

interface WalkInForm {
  name: string;
  email: string;
  phone: string;
}

interface CustomShipAddressForm {
  recipientName: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
}

function emptyCustomAddress(): CustomShipAddressForm {
  return {
    recipientName: "",
    street1: "",
    street2: "",
    city: "",
    state: "",
    zip: "",
    phone: "",
  };
}

// "saved" = pick from the customer's saved addresses (existing customers only).
// "custom" = staff types a one-off direct-ship address that gets attached to
// the customer and used on the receipt + vendor PO Ship-To.
type DirectShipAddressMode = "saved" | "custom";

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function emptyLine(): LineItem {
  return {
    productId: null,
    productSlug: null,
    variantId: null,
    variantName: null,
    fabricId: null,
    fabricName: null,
    fabricVendorId: null,
    description: "",
    quantity: 1,
    unitPrice: 0,
    unitPriceOverridden: false,
  };
}

export default function AgentNewOrder() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const { user } = useStaffSession();
  const orderRoutePrefix = user?.role === "admin" ? "/admin/orders" : "/agent/orders";
  const createOrder = useAdminCreateOrder();
  const createCustomer = useAdminCreateCustomer();
  const quotePricing = useAdminQuoteOrderPricing();
  // Manufacturer list powers the per-line "alternate fabric vendor"
  // picker. Only the id+name are needed; the list is small enough that
  // a one-shot fetch is fine.
  const manufacturersQuery = useAdminListManufacturers();
  const manufacturers = manufacturersQuery.data ?? [];

  const [customerMode, setCustomerMode] = useState<CustomerMode>("existing");
  const [customer, setCustomer] = useState<AdminCustomer | null>(null);
  const [newCustomer, setNewCustomer] = useState<NewCustomerForm>({
    firstName: "", lastName: "", email: "", phone: "", companyName: "", sendInvite: false,
  });
  const [walkIn, setWalkIn] = useState<WalkInForm>({ name: "", email: "", phone: "" });

  const [shippingAddressId, setShippingAddressId] = useState<string>("");
  // Default true — manufacturer ships to the Oasis store. Toggle off when
  // staff wants the manufacturer to drop-ship direct to the customer.
  const [shipToStore, setShipToStore] = useState<boolean>(true);
  // Direct-ship address source: pick a saved address on the customer, or
  // type a one-off address inline. New customers start in "custom" mode
  // because they don't have saved addresses yet.
  const [directShipMode, setDirectShipMode] =
    useState<DirectShipAddressMode>("saved");
  const [customShipAddr, setCustomShipAddr] =
    useState<CustomShipAddressForm>(emptyCustomAddress);
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);

  // Tax/Delivery: auto by default, manual override per-field.
  const [taxMode, setTaxMode] = useState<"auto" | "manual">("auto");
  const [deliveryMode, setDeliveryMode] = useState<"auto" | "manual">("auto");
  const [taxRatePctManual, setTaxRatePctManual] = useState("8.75");
  const [deliveryAmountManual, setDeliveryAmountManual] = useState("0");
  // Auto-quote results (filled by debounced quote call):
  const [autoTaxRate, setAutoTaxRate] = useState<number>(0);
  const [autoTaxAmount, setAutoTaxAmount] = useState<number>(0);
  const [autoDelivery, setAutoDelivery] = useState<number>(0);
  const [autoTaxJurisdiction, setAutoTaxJurisdiction] = useState<string>("");

  const [depositAmount, setDepositAmount] = useState("0");
  const [salespersonName, setSalespersonName] = useState("");
  const [specialInstructions, setSpecialInstructions] = useState("");

  // Quick-order specifics:
  const [skipVendorOrder, setSkipVendorOrder] = useState(false);
  // Manual address fields used for the auto-quote when no shipping address is picked.
  const [quoteState, setQuoteState] = useState("CA");
  const [quoteZip, setQuoteZip] = useState("");

  const [pickProductFor, setPickProductFor] = useState<{
    idx: number;
    preselect: AdminProduct | null;
  } | null>(null);

  // Inline product typeahead on the description field. We track which
  // line is "active" (focused) plus the live + debounced query so a
  // single useAdminListProducts hook serves all lines without N hooks.
  const [typeaheadIdx, setTypeaheadIdx] = useState<number | null>(null);
  const [typeaheadQuery, setTypeaheadQuery] = useState("");
  const [typeaheadDebounced, setTypeaheadDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(
      () => setTypeaheadDebounced(typeaheadQuery.trim()),
      200,
    );
    return () => clearTimeout(t);
  }, [typeaheadQuery]);
  const typeaheadEnabled =
    typeaheadIdx !== null && typeaheadDebounced.length >= 2;
  const typeaheadParams = {
    page: 1,
    pageSize: 8,
    ...(typeaheadDebounced ? { q: typeaheadDebounced } : {}),
  };
  const typeaheadResults = useAdminListProducts(typeaheadParams, {
    query: {
      queryKey: getAdminListProductsQueryKey(typeaheadParams),
      enabled: typeaheadEnabled,
    },
  });
  const typeaheadProducts = typeaheadEnabled
    ? typeaheadResults.data?.products ?? []
    : [];

  const isQuickOrder = customerMode === "quick";
  const isRestockOrder = customerMode === "restock";

  // Reset side-state when changing modes.
  useEffect(() => {
    if (customerMode !== "existing") {
      setCustomer(null);
      setShippingAddressId("");
    }
    if (customerMode !== "quick") {
      setSkipVendorOrder(false);
    }
    if (customerMode === "restock") {
      // Restock orders are zero-priced internal records — clear pricing
      // toggles so the user is never confused by stale auto-quote numbers.
      setTaxMode("auto");
      setDeliveryMode("auto");
      setDepositAmount("0");
    }
    // New customers can't have saved addresses yet, so default the
    // direct-ship address source to the inline custom form.
    if (customerMode === "new") {
      setDirectShipMode("custom");
    } else if (customerMode === "existing") {
      setDirectShipMode("saved");
    }
  }, [customerMode]);

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

  const pickedAddress = addresses.find((a) => String(a.id) === shippingAddressId) ?? null;
  const shippingState = pickedAddress?.state ?? (isQuickOrder ? quoteState : null);
  const shippingZip = pickedAddress?.zip ?? (isQuickOrder ? quoteZip : null);

  const subtotal = useMemo(
    () => items.reduce((sum, it) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0), 0),
    [items],
  );

  // Debounced auto-quote with response-version guard so a stale response
  // can't overwrite a newer one when the user is typing quickly.
  const quoteSeqRef = useRef(0);
  useEffect(() => {
    if (isRestockOrder) return; // No pricing on internal restock orders.
    if (taxMode === "manual" && deliveryMode === "manual") return;
    const cleanItems = items
      .filter((it) => it.quantity > 0 && it.unitPrice >= 0 && (it.description.trim() || it.productId))
      .map((it) => ({
        productId: it.productId,
        quantity: it.quantity,
        unitPrice: it.unitPrice,
        discountAmount: 0,
      }));
    if (cleanItems.length === 0) {
      setAutoTaxRate(0);
      setAutoTaxAmount(0);
      setAutoDelivery(0);
      return;
    }
    const t = setTimeout(() => {
      const mySeq = ++quoteSeqRef.current;
      quotePricing.mutate(
        {
          data: {
            items: cleanItems,
            shippingState: shippingState ?? null,
            shippingZip: shippingZip ?? null,
          },
        },
        {
          onSuccess: (q) => {
            if (mySeq !== quoteSeqRef.current) return; // stale response
            setAutoTaxRate(q.taxRate);
            setAutoTaxAmount(q.taxAmount);
            setAutoDelivery(q.deliveryAmount);
            setAutoTaxJurisdiction(q.taxJurisdiction);
          },
        },
      );
    }, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, shippingState, shippingZip, taxMode, deliveryMode, isRestockOrder]);

  const taxRate = taxMode === "auto" ? autoTaxRate : (Number(taxRatePctManual) || 0) / 100;
  const taxAmount = taxMode === "auto" ? autoTaxAmount : subtotal * taxRate;
  const delivery = deliveryMode === "auto" ? autoDelivery : Number(deliveryAmountManual) || 0;
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
    setItems((curr) => [...curr, emptyLine()]);
  }

  function applyPickedProduct(
    idx: number,
    p: AdminProduct,
    variant: CatalogProductVariant | null,
    fabric: CatalogFabricOption | null,
  ) {
    const basePrice = Number(p.price) || 0;
    const variantAdj = variant ? Number(variant.priceAdjustment) || 0 : 0;
    const description = [
      p.name,
      variant ? variant.name : null,
      fabric ? `${fabric.name} (${fabric.itemNumber})` : null,
    ]
      .filter(Boolean)
      .join(" — ");
    updateItem(idx, {
      productId: p.id,
      productSlug: p.slug,
      variantId: variant?.id ?? null,
      variantName: variant?.name ?? null,
      fabricId: fabric?.id ?? null,
      fabricName: fabric?.name ?? null,
      // Reset alt fabric vendor whenever fabric changes; the previous
      // selection might not even apply to the new fabric.
      fabricVendorId: null,
      description,
      unitPrice: basePrice + variantAdj,
      unitPriceOverridden: false,
    });
    setPickProductFor(null);
    setTypeaheadIdx(null);
    setTypeaheadQuery("");
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    // Pre-flight validation that must run BEFORE we make any side-effecting
    // calls (e.g. creating a new customer). Direct-ship + custom address
    // failures here used to leak a half-created customer record because the
    // address validation lived after createCustomer.
    const willUseCustomAddress =
      !shipToStore &&
      !isRestockOrder &&
      !isQuickOrder &&
      (customerMode === "new" ||
        (customerMode === "existing" &&
          (directShipMode === "custom" || addresses.length === 0)));
    if (willUseCustomAddress) {
      const c = customShipAddr;
      if (!c.street1.trim() || !c.city.trim() || !c.state.trim() || !c.zip.trim()) {
        toast({
          title: "Direct-ship address is incomplete",
          description: "Street, city, state, and ZIP are required.",
          variant: "destructive",
        });
        return;
      }
      if (c.state.trim().length !== 2) {
        toast({ title: "State must be a 2-letter code", variant: "destructive" });
        return;
      }
    }
    // Saved-address direct-ship: must have picked an address up-front.
    if (
      !shipToStore &&
      !isRestockOrder &&
      !isQuickOrder &&
      !willUseCustomAddress &&
      customerMode === "existing" &&
      !shippingAddressId
    ) {
      toast({
        title: "Pick a shipping address",
        description: "Drop-ship orders need somewhere to send the items.",
        variant: "destructive",
      });
      return;
    }

    let customerIdToUse: number | null = null;

    if (isRestockOrder) {
      // Validated below — every line must reference a product.
    } else if (customerMode === "existing") {
      if (!customer) {
        toast({ title: "Pick a customer", variant: "destructive" });
        return;
      }
      customerIdToUse = customer.id;
    } else if (customerMode === "new") {
      const nf = newCustomer;
      if (!nf.firstName.trim() || !nf.lastName.trim() || !nf.email.trim()) {
        toast({ title: "Customer name and email are required", variant: "destructive" });
        return;
      }
      try {
        const created = await createCustomer.mutateAsync({
          data: {
            firstName: nf.firstName.trim(),
            lastName: nf.lastName.trim(),
            email: nf.email.trim(),
            phone: nf.phone.trim() || null,
            companyName: nf.companyName.trim() || null,
            customerType: "residential",
            notes: null,
            sendInvite: nf.sendInvite,
          },
        });
        customerIdToUse = created.id;
        if (nf.sendInvite) {
          if (created.inviteSent === false) {
            toast({
              title: "Customer created",
              description: "Saved, but the invite email could not be sent. You can resend it from the customer page.",
              variant: "destructive",
            });
          } else if (created.inviteSent === true) {
            toast({ title: "Customer created", description: "Login invite emailed." });
          }
        }
      } catch (err) {
        toast({
          title: "Could not create customer",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
        return;
      }
    }
    // Quick: customerIdToUse stays null.

    const cleanItems = items.filter((it) => it.description.trim() && it.quantity > 0 && it.unitPrice >= 0);
    if (cleanItems.length === 0) {
      toast({ title: "Add at least one item with a description", variant: "destructive" });
      return;
    }
    if (isRestockOrder && cleanItems.some((it) => it.productId == null)) {
      toast({
        title: "Pick a product for every restock line",
        description: "Inventory restock lines must reference a product so the system can group them by vendor.",
        variant: "destructive",
      });
      return;
    }

    // Same predicate as the pre-flight check above — kept local so we can
    // build the request payload right here without re-deriving conditions.
    const usingCustomAddress = willUseCustomAddress;

    const customShippingAddress = usingCustomAddress
      ? {
          recipientName: customShipAddr.recipientName.trim() || null,
          street1: customShipAddr.street1.trim(),
          street2: customShipAddr.street2.trim() || null,
          city: customShipAddr.city.trim(),
          state: customShipAddr.state.trim().toUpperCase(),
          zip: customShipAddr.zip.trim(),
          country: "US",
          phone: customShipAddr.phone.trim() || null,
        }
      : null;

    const savedShippingAddressId =
      !usingCustomAddress &&
      customerMode === "existing" &&
      shippingAddressId
        ? Number(shippingAddressId)
        : null;

    try {
      const order = await createOrder.mutateAsync({
        data: {
          customerId: customerIdToUse,
          isQuickOrder,
          isInternalRestock: isRestockOrder,
          skipVendorOrder: isQuickOrder ? skipVendorOrder : false,
          // Restocks always ship to the store. Customer orders default to
          // ship-to-store (PO ships to Oasis); when unchecked we drop-ship
          // direct to the customer's address — either a saved address or a
          // one-off `customShippingAddress` typed inline.
          shipToStore: isRestockOrder ? true : shipToStore,
          walkInName: isQuickOrder ? walkIn.name.trim() || null : null,
          walkInEmail: isQuickOrder ? walkIn.email.trim() || null : null,
          walkInPhone: isQuickOrder ? walkIn.phone.trim() || null : null,
          shippingAddressId: savedShippingAddressId,
          customShippingAddress,
          billingAddressId: savedShippingAddressId,
          taxRate: isRestockOrder ? 0 : taxRate,
          deliveryAmount: isRestockOrder ? 0 : delivery,
          depositAmount: isRestockOrder ? 0 : deposit,
          orderType: "in_store",
          salespersonName: isRestockOrder ? null : salespersonName.trim() || null,
          specialInstructions: specialInstructions.trim() || null,
          items: cleanItems.map((it) => ({
            productId: it.productId,
            variantId: it.variantId,
            fabricId: it.fabricId,
            fabricVendorId: it.fabricId != null ? it.fabricVendorId : null,
            description: it.description.trim(),
            quantity: it.quantity,
            unitPrice: isRestockOrder ? 0 : it.unitPrice,
            discountAmount: 0,
            discountReason: null,
            notes: null,
          })),
        },
      });
      if (isRestockOrder) {
        const voCount = order.vendorOrders?.length ?? 0;
        toast({
          title: `Restock created`,
          description:
            voCount > 0
              ? `${voCount} vendor order${voCount === 1 ? "" : "s"} generated.`
              : "No vendor orders were generated — check that each product has a vendor.",
        });
      } else {
        toast({ title: `Order ${order.orderNumber} created` });
      }
      navigate(`${orderRoutePrefix}/${order.id}`);
    } catch (err: unknown) {
      toast({
        title: "Create failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    }
  }

  const submitDisabled =
    createOrder.isPending ||
    createCustomer.isPending ||
    (customerMode === "existing" && !customer) ||
    (isRestockOrder && items.some((it) => it.description.trim() && it.productId == null));

  return (
    <>
      <PageHeader
        title="New Order"
        subtitle={
          isRestockOrder
            ? "Create an internal inventory restock — items will be grouped into vendor orders by vendor."
            : "Build an in-store order for a customer."
        }
      />
      <PageBody>
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-md border bg-white p-4">
              <div className="text-xs font-medium text-slate-500 uppercase mb-2">Customer</div>
              <Tabs value={customerMode} onValueChange={(v) => setCustomerMode(v as CustomerMode)}>
                <TabsList className="grid grid-cols-4 w-full">
                  <TabsTrigger value="existing">Existing</TabsTrigger>
                  <TabsTrigger value="new">New</TabsTrigger>
                  <TabsTrigger value="quick">Quick / walk-in</TabsTrigger>
                  <TabsTrigger value="restock">Inventory restock</TabsTrigger>
                </TabsList>

                <TabsContent value="existing" className="mt-3">
                  {customer ? (
                    <div className="flex items-center justify-between">
                      <div className="text-sm">
                        <div className="font-medium">{customer.firstName} {customer.lastName}</div>
                        <div className="text-slate-500">{customer.email}</div>
                      </div>
                      <Button type="button" size="sm" variant="outline"
                        onClick={() => { setCustomer(null); setShippingAddressId(""); }}>
                        Change
                      </Button>
                    </div>
                  ) : (
                    <CustomerPicker onPick={setCustomer} />
                  )}
                </TabsContent>

                <TabsContent value="new" className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <Label>First name *</Label>
                    <Input value={newCustomer.firstName}
                      onChange={(e) => setNewCustomer((c) => ({ ...c, firstName: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Last name *</Label>
                    <Input value={newCustomer.lastName}
                      onChange={(e) => setNewCustomer((c) => ({ ...c, lastName: e.target.value }))} />
                  </div>
                  <div className="col-span-2">
                    <Label>Email *</Label>
                    <Input type="email" value={newCustomer.email}
                      onChange={(e) => setNewCustomer((c) => ({ ...c, email: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={newCustomer.phone}
                      onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))} />
                  </div>
                  <div>
                    <Label>Company</Label>
                    <Input value={newCustomer.companyName}
                      onChange={(e) => setNewCustomer((c) => ({ ...c, companyName: e.target.value }))} />
                  </div>
                  <label className="col-span-2 inline-flex items-center gap-2 text-sm">
                    <Checkbox checked={newCustomer.sendInvite}
                      onCheckedChange={(v) => setNewCustomer((c) => ({ ...c, sendInvite: !!v }))} />
                    Send login invite email (lets the customer set their own password and view this order online).
                  </label>
                </TabsContent>

                <TabsContent value="quick" className="mt-3 space-y-3">
                  <div className="text-xs text-slate-500">
                    Walk-in / in-stock sale. Customer info is optional. The order is recorded against
                    inventory but is not tied to a saved customer record.
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Name</Label>
                      <Input value={walkIn.name}
                        onChange={(e) => setWalkIn((w) => ({ ...w, name: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Email</Label>
                      <Input type="email" value={walkIn.email}
                        onChange={(e) => setWalkIn((w) => ({ ...w, email: e.target.value }))} />
                    </div>
                    <div>
                      <Label>Phone</Label>
                      <Input value={walkIn.phone}
                        onChange={(e) => setWalkIn((w) => ({ ...w, phone: e.target.value }))} />
                    </div>
                  </div>
                  <label className="inline-flex items-center gap-2 text-sm">
                    <Checkbox checked={skipVendorOrder}
                      onCheckedChange={(v) => setSkipVendorOrder(!!v)} />
                    Skip vendor order (in-stock sale — do not create a vendor PO).
                  </label>
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t">
                    <div>
                      <Label className="text-xs">Tax state (for auto pricing)</Label>
                      <Input value={quoteState}
                        onChange={(e) => setQuoteState(e.target.value.toUpperCase())} maxLength={2} />
                    </div>
                    <div>
                      <Label className="text-xs">Tax ZIP (for auto pricing)</Label>
                      <Input value={quoteZip}
                        onChange={(e) => setQuoteZip(e.target.value)} />
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="restock" className="mt-3 space-y-2">
                  <div className="text-sm text-slate-700">
                    No customer or pricing — this is an internal inventory restock.
                  </div>
                  <div className="text-xs text-slate-500">
                    Add as many products as you need. On submit, the system groups them
                    by vendor and creates one vendor order for each
                    automatically. Tax, delivery, and deposits are skipped.
                  </div>
                </TabsContent>
              </Tabs>
            </div>

            {!isRestockOrder && (
              <div className="rounded-md border bg-white p-4 space-y-3">
                <label className="flex items-start gap-2 cursor-pointer">
                  <Checkbox
                    checked={shipToStore}
                    onCheckedChange={(v) => setShipToStore(v === true)}
                    className="mt-0.5"
                  />
                  <div>
                    <div className="text-sm font-medium">
                      Ship to Oasis store
                    </div>
                    <div className="text-xs text-slate-500">
                      Vendor ships the items to the Oasis store. Uncheck
                      to have the vendor drop-ship the items direct to
                      the customer's address (a customer + shipping address are
                      required).
                    </div>
                  </div>
                </label>
                {!shipToStore && isQuickOrder && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    Direct ship isn't available for quick / walk-in orders.
                    Use the "Existing" or "New" customer tab to drop-ship.
                  </div>
                )}
              </div>
            )}

            {!shipToStore && !isQuickOrder && !isRestockOrder && (
              <div className="rounded-md border bg-white p-4 space-y-3">
                <div className="text-sm font-medium">
                  Direct-ship address
                  <span className="ml-1 text-red-600" title="Required">*</span>
                </div>
                <div className="text-xs text-slate-500">
                  Where the vendor should drop-ship this order. Used on
                  the printable receipt and the vendor PO Ship-To block.
                </div>

                {customerMode === "existing" && customer && addresses.length > 0 && (
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      className={`px-2.5 py-1 rounded border ${
                        directShipMode === "saved"
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-700 border-slate-300"
                      }`}
                      onClick={() => setDirectShipMode("saved")}
                    >
                      Use saved address
                    </button>
                    <button
                      type="button"
                      className={`px-2.5 py-1 rounded border ${
                        directShipMode === "custom"
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-700 border-slate-300"
                      }`}
                      onClick={() => setDirectShipMode("custom")}
                    >
                      Enter a new address
                    </button>
                  </div>
                )}

                {customerMode === "existing" &&
                  customer &&
                  addresses.length === 0 && (
                    <div className="text-xs text-slate-600">
                      This customer has no saved shipping addresses — enter
                      one below. It'll be saved to their profile and used for
                      this order.
                    </div>
                  )}

                {customerMode === "existing" && !customer && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
                    Pick an existing customer above, or switch to the "New"
                    tab to create one with this shipping address.
                  </div>
                )}

                {customerMode === "existing" &&
                  customer &&
                  directShipMode === "saved" &&
                  addresses.length > 0 && (
                    <div>
                      <Label>Saved address</Label>
                      <Select value={shippingAddressId} onValueChange={setShippingAddressId}>
                        <SelectTrigger className="mt-1.5">
                          <SelectValue placeholder="Pick an address" />
                        </SelectTrigger>
                        <SelectContent>
                          {addresses.map((a) => (
                            <SelectItem key={a.id} value={String(a.id)}>
                              {a.street1}, {a.city} {a.state} {a.zip}
                              {a.isDefault ? " (default)" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {!shippingAddressId && (
                        <div className="mt-2 text-xs text-amber-700">
                          Pick an address — drop-ship orders need somewhere
                          to send the items.
                        </div>
                      )}
                    </div>
                  )}

                {((customerMode === "existing" &&
                  (directShipMode === "custom" || addresses.length === 0) &&
                  customer) ||
                  customerMode === "new") && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <Label>Recipient name</Label>
                      <Input
                        value={customShipAddr.recipientName}
                        placeholder="Defaults to customer name"
                        onChange={(e) =>
                          setCustomShipAddr((a) => ({ ...a, recipientName: e.target.value }))
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Street address *</Label>
                      <Input
                        value={customShipAddr.street1}
                        onChange={(e) =>
                          setCustomShipAddr((a) => ({ ...a, street1: e.target.value }))
                        }
                      />
                    </div>
                    <div className="col-span-2">
                      <Label>Apt / suite</Label>
                      <Input
                        value={customShipAddr.street2}
                        onChange={(e) =>
                          setCustomShipAddr((a) => ({ ...a, street2: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label>City *</Label>
                      <Input
                        value={customShipAddr.city}
                        onChange={(e) =>
                          setCustomShipAddr((a) => ({ ...a, city: e.target.value }))
                        }
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>State *</Label>
                        <Input
                          maxLength={2}
                          value={customShipAddr.state}
                          onChange={(e) =>
                            setCustomShipAddr((a) => ({
                              ...a,
                              state: e.target.value.toUpperCase(),
                            }))
                          }
                        />
                      </div>
                      <div>
                        <Label>ZIP *</Label>
                        <Input
                          value={customShipAddr.zip}
                          onChange={(e) =>
                            setCustomShipAddr((a) => ({ ...a, zip: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                    <div className="col-span-2">
                      <Label>Phone</Label>
                      <Input
                        value={customShipAddr.phone}
                        onChange={(e) =>
                          setCustomShipAddr((a) => ({ ...a, phone: e.target.value }))
                        }
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {shipToStore &&
              customerMode === "existing" &&
              customer &&
              addresses.length > 0 && (
              <div className="rounded-md border bg-white p-4">
                <Label>Customer shipping address (optional)</Label>
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
                    <div className="col-span-5 relative">
                      <Label className="text-xs">Description</Label>
                      <div className="flex gap-1">
                        <Input
                          value={it.description}
                          onChange={(e) => {
                            const v = e.target.value;
                            // Clear linked product whenever the user manually
                            // edits the description so we never silently keep
                            // a stale productId tied to a different label.
                            updateItem(idx, {
                              description: v,
                              productId: null,
                              productSlug: null,
                              variantId: null,
                              variantName: null,
                              fabricId: null,
                              fabricName: null,
                              fabricVendorId: null,
                            });
                            setTypeaheadIdx(idx);
                            setTypeaheadQuery(v);
                          }}
                          onFocus={() => {
                            setTypeaheadIdx(idx);
                            setTypeaheadQuery(it.description);
                          }}
                          onBlur={() => {
                            // Delay so a click on a suggestion can fire
                            // before the dropdown unmounts.
                            setTimeout(() => {
                              setTypeaheadIdx((curr) => (curr === idx ? null : curr));
                            }, 150);
                          }}
                          placeholder="Type a name, SKU, or vendor to search…"
                        />
                        <Button type="button" variant="outline" size="sm"
                          onClick={() => setPickProductFor({ idx, preselect: null })}
                          title="Browse all products">
                          <Search className="size-4" />
                        </Button>
                      </div>
                      {typeaheadIdx === idx &&
                        typeaheadDebounced.length >= 2 && (
                          <div className="absolute left-0 right-10 top-full mt-1 z-50 rounded-md border bg-white shadow-lg max-h-64 overflow-y-auto">
                            {typeaheadResults.isFetching ? (
                              <div className="p-3 flex justify-center">
                                <Spinner />
                              </div>
                            ) : typeaheadProducts.length === 0 ? (
                              <div className="p-3 text-xs text-slate-500">
                                No matching products
                              </div>
                            ) : (
                              typeaheadProducts.map((p) => (
                                <button
                                  key={p.id}
                                  type="button"
                                  // mousedown fires before the input blurs,
                                  // so capturing it here keeps the click from
                                  // being swallowed by the blur-driven hide.
                                  onMouseDown={(e) => e.preventDefault()}
                                  onClick={() => {
                                    setTypeaheadIdx(null);
                                    setTypeaheadQuery("");
                                    setPickProductFor({ idx, preselect: p });
                                  }}
                                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-t first:border-t-0"
                                >
                                  <div className="flex justify-between items-start gap-2">
                                    <div className="min-w-0">
                                      <div className="font-medium text-sm truncate">
                                        {p.name}
                                      </div>
                                      <div className="text-[11px] text-slate-500 font-mono truncate">
                                        {p.sku}
                                        {p.manufacturerName
                                          ? ` · ${p.manufacturerName}`
                                          : ""}
                                      </div>
                                    </div>
                                    <div className="text-xs tabular-nums shrink-0">
                                      {p.price != null
                                        ? fmtMoney(Number(p.price))
                                        : "—"}
                                    </div>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        )}
                      {it.productId && (
                        <div className="text-xs text-slate-500 mt-0.5">
                          Product #{it.productId}
                          {it.variantName ? ` · ${it.variantName}` : ""}
                          {it.fabricName ? ` · ${it.fabricName}` : ""}
                        </div>
                      )}
                      {/* Per-line alternate fabric vendor. Only relevant
                          when the line has a fabric — otherwise there's
                          nothing to source from a different vendor. */}
                      {it.fabricId != null && (
                        <div className="mt-2">
                          <Label className="text-xs">Alt fabric vendor</Label>
                          <Select
                            value={
                              it.fabricVendorId != null
                                ? String(it.fabricVendorId)
                                : "none"
                            }
                            onValueChange={(v) =>
                              updateItem(idx, {
                                fabricVendorId: v === "none" ? null : Number(v),
                              })
                            }
                          >
                            <SelectTrigger className="mt-1 h-8 text-xs">
                              <SelectValue placeholder="Use product's vendor" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">
                                Use product's vendor (default)
                              </SelectItem>
                              {manufacturers.map((m) => (
                                <SelectItem key={m.id} value={String(m.id)}>
                                  {m.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {it.fabricVendorId != null && (
                            <div className="mt-1 text-[11px] text-slate-500">
                              A separate fabric-only PO will be created
                              for this vendor.
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Qty</Label>
                      <Input type="number" min={1} value={it.quantity}
                        onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 0 })} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">
                        {isRestockOrder ? (
                          <span className="text-slate-400">Unit price (n/a)</span>
                        ) : (
                          <>Unit price{it.unitPriceOverridden && <span className="text-amber-600"> (override)</span>}</>
                        )}
                      </Label>
                      <Input type="number" min={0} step="0.01" value={isRestockOrder ? 0 : it.unitPrice}
                        disabled={isRestockOrder}
                        onChange={(e) => updateItem(idx, {
                          unitPrice: Number(e.target.value) || 0,
                          unitPriceOverridden: true,
                        })} />
                    </div>
                    <div className="col-span-2 text-right text-sm pt-5">
                      {isRestockOrder
                        ? <span className="text-slate-400">—</span>
                        : fmtMoney((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0))}
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
              {!isRestockOrder && (
                <div>
                  <Label>Salesperson name</Label>
                  <Input value={salespersonName} onChange={(e) => setSalespersonName(e.target.value)} />
                </div>
              )}
              <div className={isRestockOrder ? "col-span-2" : "col-span-2"}>
                <Label>{isRestockOrder ? "Notes" : "Special instructions"}</Label>
                <Textarea rows={2} value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)} />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            {isRestockOrder ? (
              <div className="rounded-md border bg-white p-4 space-y-3">
                <div className="text-xs font-medium text-slate-500 uppercase">Restock summary</div>
                <div className="text-sm text-slate-600">
                  This is an internal inventory order. No customer, pricing, tax,
                  delivery, or deposit will be recorded. Each line must reference
                  a product so the system can group lines by vendor into
                  vendor orders.
                </div>
                <div className="text-sm border-t pt-3 space-y-1">
                  <div className="flex justify-between">
                    <span>Lines</span>
                    <span>{items.filter((it) => it.description.trim()).length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total units</span>
                    <span>
                      {items
                        .filter((it) => it.description.trim())
                        .reduce((s, it) => s + (Number(it.quantity) || 0), 0)}
                    </span>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={submitDisabled}>
                  {createOrder.isPending ? "Creating restock…" : "Create restock & vendor orders"}
                </Button>
              </div>
            ) : (
            <div className="rounded-md border bg-white p-4 space-y-3">
              <div className="text-xs font-medium text-slate-500 uppercase">Totals</div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>Tax</Label>
                  <button type="button"
                    className="text-xs text-blue-700 hover:underline"
                    onClick={() => setTaxMode((m) => (m === "auto" ? "manual" : "auto"))}>
                    {taxMode === "auto" ? "Override" : "Use auto"}
                  </button>
                </div>
                {taxMode === "auto" ? (
                  <div className="text-sm text-slate-600 mt-1 inline-flex items-center gap-1">
                    <Sparkles className="size-3 text-blue-500" />
                    {(autoTaxRate * 100).toFixed(3)}%
                    {autoTaxJurisdiction && (
                      <span className="text-xs text-slate-400"> · {autoTaxJurisdiction}</span>
                    )}
                  </div>
                ) : (
                  <Input type="number" min={0} step="0.001" value={taxRatePctManual}
                    onChange={(e) => setTaxRatePctManual(e.target.value)}
                    placeholder="Tax rate %" />
                )}
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <Label>Delivery</Label>
                  <button type="button"
                    className="text-xs text-blue-700 hover:underline"
                    onClick={() => setDeliveryMode((m) => (m === "auto" ? "manual" : "auto"))}>
                    {deliveryMode === "auto" ? "Override" : "Use auto"}
                  </button>
                </div>
                {deliveryMode === "auto" ? (
                  <div className="text-sm text-slate-600 mt-1 inline-flex items-center gap-1">
                    <Sparkles className="size-3 text-blue-500" />
                    {fmtMoney(autoDelivery)}
                  </div>
                ) : (
                  <Input type="number" min={0} step="0.01" value={deliveryAmountManual}
                    onChange={(e) => setDeliveryAmountManual(e.target.value)} />
                )}
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
              <Button type="submit" className="w-full" disabled={submitDisabled}>
                {createOrder.isPending || createCustomer.isPending ? "Creating…" : "Create order"}
              </Button>
            </div>
            )}
          </div>
        </form>

        <ProductPickerDialog
          open={pickProductFor !== null}
          initialProduct={pickProductFor?.preselect ?? null}
          onOpenChange={(v) => !v && setPickProductFor(null)}
          onApply={(p, variant, fabric) =>
            pickProductFor !== null &&
            applyPickedProduct(pickProductFor.idx, p, variant, fabric)
          }
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
  open, initialProduct, onOpenChange, onApply,
}: {
  open: boolean;
  initialProduct?: AdminProduct | null;
  onOpenChange: (v: boolean) => void;
  onApply: (p: AdminProduct, variant: CatalogProductVariant | null, fabric: CatalogFabricOption | null) => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<AdminProduct | null>(null);
  const [variantId, setVariantId] = useState<string>("");
  const [fabricId, setFabricId] = useState<string>("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 250);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset selections whenever the dialog opens or product changes.
  // When opening with an `initialProduct` (clicked from the inline
  // typeahead), seed `picked` so the dialog jumps straight to the
  // variant/fabric step instead of forcing the user to search again.
  useEffect(() => {
    if (!open) {
      setPicked(null);
      setVariantId("");
      setFabricId("");
      setSearchInput("");
      setSearch("");
    } else if (initialProduct) {
      setPicked(initialProduct);
    }
  }, [open, initialProduct]);
  useEffect(() => {
    setVariantId("");
    setFabricId("");
  }, [picked?.id]);

  const list = useAdminListProducts({
    page: 1,
    pageSize: 20,
    ...(search ? { q: search } : {}),
  });

  const detailSlug = picked?.slug ?? "";
  const detail = useGetCatalogProductBySlug(detailSlug, {
    query: {
      queryKey: getGetCatalogProductBySlugQueryKey(detailSlug),
      enabled: !!picked?.slug,
    },
  });
  const variants = detail.data?.variants ?? [];
  const fabricOptions = detail.data?.fabricOptions ?? [];
  const detailReady = !!picked && !detail.isLoading && !!detail.data;
  const needsVariant = variants.length > 0;
  const needsFabric = fabricOptions.length > 0;
  // Block "Add to order" until product detail has actually loaded — otherwise
  // empty variants/fabric arrays would falsely report "no required picks".
  const canAdd =
    detailReady &&
    (!needsVariant || !!variantId) &&
    (!needsFabric || !!fabricId);

  // Group fabrics by manufacturer for nicer scanning.
  const fabricGroups = useMemo(() => {
    const m = new Map<string, CatalogFabricOption[]>();
    for (const f of fabricOptions) {
      const arr = m.get(f.manufacturerName) ?? [];
      arr.push(f);
      m.set(f.manufacturerName, arr);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [fabricOptions]);

  function handleAdd() {
    if (!picked || !detailReady) return;
    if (needsVariant && !variantId) return;
    if (needsFabric && !fabricId) return;
    const v = needsVariant ? variants.find((x) => String(x.id) === variantId) ?? null : null;
    const f = needsFabric ? fabricOptions.find((x) => String(x.id) === fabricId) ?? null : null;
    onApply(picked, v, f);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Pick a product</DialogTitle></DialogHeader>

        {!picked ? (
          <>
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
                    onClick={() => setPicked(p)}>
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
          </>
        ) : (
          <div className="space-y-3">
            <div className="rounded border bg-slate-50 p-3 flex justify-between items-start">
              <div>
                <div className="font-medium">{picked.name}</div>
                <div className="text-xs text-slate-500 font-mono">{picked.sku}</div>
                <div className="text-sm tabular-nums mt-1">
                  Base: {picked.price != null ? fmtMoney(Number(picked.price)) : "—"}
                </div>
              </div>
              <Button type="button" size="sm" variant="ghost"
                onClick={() => { setPicked(null); setVariantId(""); setFabricId(""); }}>
                Change product
              </Button>
            </div>

            {detail.isLoading && (
              <div className="flex justify-center py-3"><Spinner /></div>
            )}

            {needsVariant && (
              <div>
                <Label className="text-xs">
                  {variants[0]?.optionLabel || "Variant"} <span className="text-red-600">*</span>
                </Label>
                <Select value={variantId} onValueChange={setVariantId}>
                  <SelectTrigger><SelectValue placeholder="Pick a variant" /></SelectTrigger>
                  <SelectContent>
                    {variants.map((v) => {
                      const adj = Number(v.priceAdjustment) || 0;
                      return (
                        <SelectItem key={v.id} value={String(v.id)}>
                          {v.name}{adj !== 0 ? ` (${adj > 0 ? "+" : ""}${fmtMoney(adj)})` : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {needsFabric && (
              <div>
                <Label className="text-xs">Fabric <span className="text-red-600">*</span></Label>
                <Select value={fabricId} onValueChange={setFabricId}>
                  <SelectTrigger><SelectValue placeholder="Pick a fabric" /></SelectTrigger>
                  <SelectContent className="max-h-72">
                    {fabricGroups.map(([mfg, fabrics]) => (
                      <div key={mfg}>
                        <div className="px-2 py-1 text-xs font-semibold text-slate-500 bg-slate-50">
                          {mfg}
                        </div>
                        {fabrics.map((f) => (
                          <SelectItem key={f.id} value={String(f.id)}>
                            {f.name} ({f.itemNumber})
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {!needsVariant && !needsFabric && !detail.isLoading && (
              <div className="text-xs text-slate-500">No variants or fabrics required for this product.</div>
            )}
          </div>
        )}

        {picked && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="button" disabled={!canAdd} onClick={handleAdd}>Add to order</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
