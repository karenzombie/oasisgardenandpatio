import { useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Pencil,
  Plus,
  Search,
  Power,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useAdminListManufacturers,
  useAdminCreateManufacturer,
  useAdminUpdateManufacturer,
  useAdminSetManufacturerActive,
  getAdminListManufacturersQueryKey,
  type AdminManufacturer,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { uploadFile, getStaffObjectUrl } from "../../lib/upload";
import { SortableHeader, sortRows, toggleSort, type SortState } from "../../lib/sortable";

type MfgSortKey = "name" | "slug" | "displayOrder";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type OrderMethod = "email" | "fax" | "manual";

interface FormState {
  name: string;
  slug: string;
  slugTouched: boolean;
  description: string;
  website: string;
  displayOrder: string;
  dealerRate: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string;
  fax: string;
  orderEmail: string;
  salesEmail: string;
  orderMethod: OrderMethod;
  isActive: boolean;
  logoUrl: string | null;
}

function emptyForm(): FormState {
  return {
    name: "",
    slug: "",
    slugTouched: false,
    description: "",
    website: "",
    displayOrder: "0",
    dealerRate: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    phone: "",
    fax: "",
    orderEmail: "",
    salesEmail: "",
    orderMethod: "manual",
    isActive: true,
    logoUrl: null,
  };
}

function formFromRow(row: AdminManufacturer): FormState {
  return {
    name: row.name,
    slug: row.slug,
    slugTouched: true,
    description: row.description ?? "",
    website: row.website ?? "",
    displayOrder: String(row.displayOrder),
    dealerRate: row.dealerRate ?? "",
    addressLine1: row.addressLine1 ?? "",
    addressLine2: row.addressLine2 ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    postalCode: row.postalCode ?? "",
    country: row.country ?? "",
    phone: row.phone ?? "",
    fax: row.fax ?? "",
    orderEmail: row.orderEmail ?? "",
    salesEmail: row.salesEmail ?? "",
    orderMethod: row.orderMethod,
    isActive: row.isActive,
    logoUrl: row.logoUrl,
  };
}

export default function Manufacturers() {
  const qc = useQueryClient();
  const toast = useToast();
  const list = useAdminListManufacturers({
    query: {
      queryKey: getAdminListManufacturersQueryKey(),
      staleTime: 10_000,
    },
  });
  const createMut = useAdminCreateManufacturer();
  const updateMut = useAdminUpdateManufacturer();
  const setActiveMut = useAdminSetManufacturerActive();

  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);
  const [editing, setEditing] = useState<AdminManufacturer | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] =
    useState<AdminManufacturer | null>(null);
  const [sort, setSort] = useState<SortState<MfgSortKey>>({ by: null, order: "desc" });

  const rows = list.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = rows.filter((r) => {
      if (!showInactive && !r.isActive) return false;
      if (!q) return true;
      return (
        r.name.toLowerCase().includes(q) || r.slug.toLowerCase().includes(q)
      );
    });
    return sortRows(base, sort, (row, key) => row[key]);
  }, [rows, search, showInactive, sort]);

  const handleSort = (key: MfgSortKey) => setSort((prev) => toggleSort(prev, key));

  function openNew() {
    setEditing(null);
    setForm(emptyForm());
    setError(null);
    setOpen(true);
  }
  function openEdit(row: AdminManufacturer) {
    setEditing(row);
    setForm(formFromRow(row));
    setError(null);
    setOpen(true);
  }

  async function handleLogo(file: File | null) {
    if (!file) {
      setForm((f) => ({ ...f, logoUrl: null }));
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.toast({
        variant: "destructive",
        title: "Wrong file type",
        description: "Please choose an image file.",
      });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.toast({
        variant: "destructive",
        title: "Too large",
        description: "Logo must be under 5 MB.",
      });
      return;
    }
    setUploading(true);
    try {
      const { objectPath } = await uploadFile(file);
      setForm((f) => ({ ...f, logoUrl: objectPath }));
    } catch (err) {
      toast.toast({
        variant: "destructive",
        title: "Upload failed",
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    const slug = form.slug.trim();
    if (!name) {
      setError("Name is required");
      return;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setError("Slug must be lowercase letters, numbers, and dashes only");
      return;
    }
    const displayOrder = Number.parseInt(form.displayOrder, 10);
    if (Number.isNaN(displayOrder)) {
      setError("Display order must be a number");
      return;
    }
    const dealerRateTrim = form.dealerRate.trim();
    let dealerRate: string | null = null;
    if (dealerRateTrim) {
      if (!/^\d+(\.\d{1,2})?$/.test(dealerRateTrim)) {
        setError("Dealer rate must be a number with up to 2 decimals");
        return;
      }
      const n = Number(dealerRateTrim);
      if (n < 0 || n > 100) {
        setError("Dealer rate must be between 0 and 100");
        return;
      }
      dealerRate = dealerRateTrim;
    }

    const orderMethod = form.orderMethod;
    if (orderMethod === "email" && !form.orderEmail.trim()) {
      setError("Order email is required when orders are sent by email.");
      return;
    }
    if (orderMethod === "fax" && !form.fax.trim()) {
      setError("Fax number is required when orders are sent by fax.");
      return;
    }

    const payload = {
      name,
      slug,
      description: form.description.trim() || null,
      website: form.website.trim() || null,
      logoUrl: form.logoUrl,
      displayOrder,
      dealerRate,
      addressLine1: form.addressLine1.trim() || null,
      addressLine2: form.addressLine2.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      postalCode: form.postalCode.trim() || null,
      country: form.country.trim() || null,
      phone: form.phone.trim() || null,
      fax: form.fax.trim() || null,
      orderEmail: form.orderEmail.trim() || null,
      salesEmail: form.salesEmail.trim() || null,
      orderMethod,
      isActive: form.isActive,
    };

    try {
      if (editing) {
        await updateMut.mutateAsync({ id: editing.id, data: payload });
        toast.toast({ title: "Vendor updated" });
      } else {
        await createMut.mutateAsync({ data: payload });
        toast.toast({ title: "Vendor created" });
      }
      await qc.invalidateQueries({
        queryKey: getAdminListManufacturersQueryKey(),
      });
      setOpen(false);
    } catch (err: unknown) {
      const e = err as { response?: { status?: number }; message?: string };
      if (e?.response?.status === 409) {
        setError("A vendor with that slug already exists.");
      } else {
        setError(e?.message ?? "Could not save vendor.");
      }
    }
  }

  async function toggleActive(row: AdminManufacturer, isActive: boolean) {
    try {
      await setActiveMut.mutateAsync({
        id: row.id,
        data: { isActive },
      });
      await qc.invalidateQueries({
        queryKey: getAdminListManufacturersQueryKey(),
      });
      toast.toast({
        title: isActive ? "Vendor activated" : "Vendor deactivated",
      });
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
        title="Vendors"
        subtitle="Brands you carry. Logos appear on storefront category pages."
        action={
          <Button
            onClick={openNew}
            className="bg-[#1A3C5E] hover:bg-[#15314c] text-white"
          >
            <Plus className="size-4" />
            New vendor
          </Button>
        }
      />
      <PageBody>
        <div className="bg-white border border-slate-200 rounded-md">
          <div className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center justify-between border-b border-slate-100">
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or slug…"
                className="pl-9"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700 select-none">
              <Switch
                checked={showInactive}
                onCheckedChange={setShowInactive}
              />
              Show inactive
            </label>
          </div>

          {list.isLoading ? (
            <div className="p-12 flex justify-center">
              <Spinner className="size-6 text-[#1A3C5E]" />
            </div>
          ) : list.isError ? (
            <div className="p-12 text-center text-sm text-red-600">
              Could not load vendors.{" "}
              <button
                className="underline"
                onClick={() => list.refetch()}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-12 text-center text-sm text-slate-500">
              {rows.length === 0
                ? "No vendors yet. Click New vendor to add your first."
                : "No matches for your search."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-600 text-left">
                  <tr>
                    <th className="px-4 py-2.5 font-medium w-16">Logo</th>
                    <SortableHeader sortKey="name" state={sort} onSort={handleSort} className="px-4 py-2.5 font-medium">Name</SortableHeader>
                    <SortableHeader sortKey="slug" state={sort} onSort={handleSort} className="px-4 py-2.5 font-medium">Slug</SortableHeader>
                    <th className="px-4 py-2.5 font-medium">Website</th>
                    <SortableHeader sortKey="displayOrder" state={sort} onSort={handleSort} align="center" className="px-4 py-2.5 font-medium w-20">Order</SortableHeader>
                    <th className="px-4 py-2.5 font-medium w-24">Status</th>
                    <th className="px-4 py-2.5 font-medium w-28 text-right">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map((row) => {
                    const logo = getStaffObjectUrl(row.logoUrl);
                    return (
                      <tr key={row.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          {logo ? (
                            <img
                              src={logo}
                              alt={`${row.name} logo`}
                              className="size-10 object-contain rounded border border-slate-200 bg-white"
                            />
                          ) : (
                            <div className="size-10 rounded border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">
                              —
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2.5 font-medium text-slate-900">
                          {row.name}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 font-mono text-xs">
                          {row.slug}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600 truncate max-w-[200px]">
                          {row.website ? (
                            <a
                              href={row.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[#1A3C5E] hover:underline"
                            >
                              {row.website}
                            </a>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-center text-slate-600">
                          {row.displayOrder}
                        </td>
                        <td className="px-4 py-2.5">
                          {row.isActive ? (
                            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                              Active
                            </Badge>
                          ) : (
                            <Badge variant="secondary">Inactive</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex justify-end gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEdit(row)}
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
        </div>
      </PageBody>

      {/* Create / edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
          <form onSubmit={handleSubmit} className="flex flex-col min-h-0 flex-1">
            <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
              <DialogTitle>
                {editing ? "Edit vendor" : "New vendor"}
              </DialogTitle>
              <DialogDescription>
                Brands you carry. The slug is used in URLs and CSV imports.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 px-6 py-4 overflow-y-auto flex-1 min-h-0">
              <div>
                <Label htmlFor="m-name">Name</Label>
                <Input
                  id="m-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      name: e.target.value,
                      slug: f.slugTouched ? f.slug : slugify(e.target.value),
                    }))
                  }
                  placeholder="Brown Jordan"
                  autoFocus
                />
              </div>

              <div>
                <Label htmlFor="m-slug">Slug</Label>
                <Input
                  id="m-slug"
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      slug: e.target.value,
                      slugTouched: true,
                    }))
                  }
                  placeholder="brown-jordan"
                  className="font-mono"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Lowercase letters, numbers, dashes only.
                </p>
              </div>

              <div>
                <Label htmlFor="m-desc">Description</Label>
                <Textarea
                  id="m-desc"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  rows={3}
                  placeholder="Optional — short blurb shown on the brand page."
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="m-website">Website</Label>
                  <Input
                    id="m-website"
                    value={form.website}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, website: e.target.value }))
                    }
                    placeholder="https://…"
                    type="url"
                  />
                </div>
                <div>
                  <Label htmlFor="m-order">Display order</Label>
                  <Input
                    id="m-order"
                    value={form.displayOrder}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, displayOrder: e.target.value }))
                    }
                    type="number"
                    min={0}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="m-dealer-rate">Default dealer rate (%)</Label>
                <Input
                  id="m-dealer-rate"
                  value={form.dealerRate}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dealerRate: e.target.value }))
                  }
                  placeholder="e.g. 50.00"
                  inputMode="decimal"
                />
                <p className="text-xs text-slate-500 mt-1">
                  % off MSRP for dealer (us). Used when a product is priced via
                  &ldquo;MSRP &minus; dealer rate&rdquo;. Leave blank if this
                  brand isn&rsquo;t priced that way.
                </p>
              </div>

              <div>
                <Label>Logo</Label>
                <div className="mt-1 flex items-center gap-3">
                  {form.logoUrl ? (
                    <div className="relative">
                      <img
                        src={getStaffObjectUrl(form.logoUrl)}
                        alt="Logo preview"
                        className="size-16 object-contain rounded border border-slate-200 bg-white p-1"
                      />
                      <button
                        type="button"
                        onClick={() => handleLogo(null)}
                        className="absolute -top-2 -right-2 size-5 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-red-600 flex items-center justify-center"
                        aria-label="Remove logo"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ) : (
                    <div className="size-16 rounded border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400">
                      No logo
                    </div>
                  )}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) =>
                        handleLogo(e.target.files?.[0] ?? null)
                      }
                    />
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded text-sm hover:bg-slate-50">
                      {uploading ? (
                        <>
                          <Spinner className="size-4" /> Uploading…
                        </>
                      ) : (
                        <>
                          <Upload className="size-4" />{" "}
                          {form.logoUrl ? "Replace" : "Upload"}
                        </>
                      )}
                    </div>
                  </label>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  PNG or SVG with transparent background works best. Max 5 MB.
                </p>
              </div>

              <div className="flex items-center justify-between border-t pt-4">
                <div>
                  <Label htmlFor="m-active" className="cursor-pointer">
                    Active
                  </Label>
                  <p className="text-xs text-slate-500">
                    Inactive vendors are hidden from the storefront.
                  </p>
                </div>
                <Switch
                  id="m-active"
                  checked={form.isActive}
                  onCheckedChange={(c) =>
                    setForm((f) => ({ ...f, isActive: c }))
                  }
                />
              </div>

              {/* Address */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">
                  Address
                </h4>
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="m-addr1">Street address</Label>
                    <Input
                      id="m-addr1"
                      value={form.addressLine1}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, addressLine1: e.target.value }))
                      }
                      placeholder="123 Industry Way"
                    />
                  </div>
                  <div>
                    <Label htmlFor="m-addr2">Address line 2</Label>
                    <Input
                      id="m-addr2"
                      value={form.addressLine2}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, addressLine2: e.target.value }))
                      }
                      placeholder="Suite, building, etc."
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label htmlFor="m-city">City</Label>
                      <Input
                        id="m-city"
                        value={form.city}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, city: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="m-state">State / region</Label>
                      <Input
                        id="m-state"
                        value={form.state}
                        onChange={(e) =>
                          setForm((f) => ({ ...f, state: e.target.value }))
                        }
                      />
                    </div>
                    <div>
                      <Label htmlFor="m-zip">Postal code</Label>
                      <Input
                        id="m-zip"
                        value={form.postalCode}
                        onChange={(e) =>
                          setForm((f) => ({
                            ...f,
                            postalCode: e.target.value,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="m-country">Country</Label>
                    <Input
                      id="m-country"
                      value={form.country}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, country: e.target.value }))
                      }
                      placeholder="USA"
                    />
                  </div>
                </div>
              </div>

              {/* Contact */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">
                  Contact
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="m-phone">Phone</Label>
                    <Input
                      id="m-phone"
                      value={form.phone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      type="tel"
                      placeholder="(555) 555-1234"
                    />
                  </div>
                  <div>
                    <Label htmlFor="m-fax">Fax</Label>
                    <Input
                      id="m-fax"
                      value={form.fax}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, fax: e.target.value }))
                      }
                      type="tel"
                      placeholder="(555) 555-5678"
                    />
                  </div>
                  <div>
                    <Label htmlFor="m-order-email">Order email</Label>
                    <Input
                      id="m-order-email"
                      value={form.orderEmail}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, orderEmail: e.target.value }))
                      }
                      type="email"
                      placeholder="orders@brand.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="m-sales-email">Sales / rep email</Label>
                    <Input
                      id="m-sales-email"
                      value={form.salesEmail}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, salesEmail: e.target.value }))
                      }
                      type="email"
                      placeholder="sales@brand.com"
                    />
                  </div>
                </div>
              </div>

              {/* Order delivery method */}
              <div className="border-t pt-4">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">
                  Order delivery
                </h4>
                <Label htmlFor="m-order-method">How orders are sent</Label>
                <Select
                  value={form.orderMethod}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, orderMethod: v as OrderMethod }))
                  }
                >
                  <SelectTrigger id="m-order-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">
                      Email (uses order email above)
                    </SelectItem>
                    <SelectItem value="fax">
                      Fax (uses fax number above)
                    </SelectItem>
                    <SelectItem value="manual">
                      Manual (we send POs ourselves)
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  Determines how purchase orders generated by the site are
                  routed to this vendor.
                </p>
              </div>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
                  {error}
                </div>
              )}
            </div>

            <DialogFooter className="px-6 py-4 border-t shrink-0 bg-slate-50">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createMut.isPending || updateMut.isPending}
                className="bg-[#1A3C5E] hover:bg-[#15314c] text-white"
              >
                {createMut.isPending || updateMut.isPending
                  ? "Saving…"
                  : editing
                    ? "Save changes"
                    : "Create vendor"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Deactivate confirm */}
      <AlertDialog
        open={confirmDeactivate !== null}
        onOpenChange={(o) => !o && setConfirmDeactivate(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate vendor?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDeactivate?.name} will be hidden from the storefront.
              Existing products keep their vendor link and you can
              reactivate at any time.
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
