import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Image as ImageIcon,
  Plus,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import {
  useAdminGetProduct,
  useAdminCreateProduct,
  useAdminUpdateProduct,
  useAdminAddProductImage,
  useAdminReorderProductImages,
  useAdminDeleteProductImage,
  useAdminUpdateProductInventory,
  useAdminListManufacturers,
  useAdminListCategories,
  getAdminGetProductQueryKey,
  getAdminListProductsQueryKey,
  type AdminProductImage,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Spinner } from "@/components/ui/spinner";
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

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface FormState {
  name: string;
  slug: string;
  slugTouched: boolean;
  sku: string;
  description: string;
  shortDescription: string;
  manufacturerId: string;
  categoryId: string;
  price: string;
  cost: string;
  msrp: string;
  markupPercent: string;
  pricingMode: "fixed" | "cost_plus_markup" | "msrp_minus_dealer_rate";
  weight: string;
  dimensions: string;
  showPriceOnline: boolean;
  availableOnline: boolean;
  inStoreOnly: boolean;
  featured: boolean;
  displayOrder: string;
  lowStockThreshold: string;
  isActive: boolean;
  // Inventory
  onHand: string;
  reorderThreshold: string;
}

function emptyForm(): FormState {
  return {
    name: "",
    slug: "",
    slugTouched: false,
    sku: "",
    description: "",
    shortDescription: "",
    manufacturerId: "none",
    categoryId: "none",
    price: "",
    cost: "",
    msrp: "",
    markupPercent: "",
    pricingMode: "fixed",
    weight: "",
    dimensions: "",
    showPriceOnline: true,
    availableOnline: true,
    inStoreOnly: false,
    featured: false,
    displayOrder: "0",
    lowStockThreshold: "0",
    isActive: true,
    onHand: "0",
    reorderThreshold: "0",
  };
}

export default function ProductEdit() {
  const params = useParams<{ id?: string }>();
  const idStr = params.id;
  const isNew = !idStr || idStr === "new";
  const productId = isNew ? null : Number(idStr);

  const qc = useQueryClient();
  const toast = useToast();
  const [, navigate] = useLocation();

  const detailQuery = useAdminGetProduct(productId ?? 0, {
    query: {
      enabled: !isNew && Number.isFinite(productId) && (productId ?? 0) > 0,
      queryKey: getAdminGetProductQueryKey(productId ?? 0),
    },
  });
  const mfgList = useAdminListManufacturers();
  const catList = useAdminListCategories();
  const createMut = useAdminCreateProduct();
  const updateMut = useAdminUpdateProduct();
  const addImageMut = useAdminAddProductImage();
  const reorderMut = useAdminReorderProductImages();
  const deleteImageMut = useAdminDeleteProductImage();
  const inventoryMut = useAdminUpdateProductInventory();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteImage, setConfirmDeleteImage] =
    useState<AdminProductImage | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Reset hydration when the route param changes (router may reuse the
  // component when navigating between /products/A and /products/B), so the
  // form re-hydrates from the new product's data.
  useEffect(() => {
    setHydrated(false);
  }, [productId]);

  useEffect(() => {
    // Wait for all three queries to land before hydrating so the
    // manufacturer/category Selects have their <SelectItem> options
    // available the moment we set their controlled value (otherwise
    // Radix Select renders the placeholder until the user interacts).
    if (
      !isNew &&
      detailQuery.data &&
      mfgList.data &&
      catList.data &&
      !hydrated
    ) {
      const d = detailQuery.data;
      setForm({
        name: d.name,
        slug: d.slug,
        slugTouched: true,
        sku: d.sku,
        description: d.description ?? "",
        shortDescription: d.shortDescription ?? "",
        manufacturerId: d.manufacturerId != null ? String(d.manufacturerId) : "none",
        categoryId: d.categoryId != null ? String(d.categoryId) : "none",
        price: d.price ?? "",
        cost: d.cost ?? "",
        msrp: d.msrp ?? "",
        markupPercent: d.markupPercent ?? "",
        pricingMode: d.pricingMode,
        weight: d.weight ?? "",
        dimensions: d.dimensions ?? "",
        showPriceOnline: d.showPriceOnline,
        availableOnline: d.availableOnline,
        inStoreOnly: d.inStoreOnly,
        featured: d.featured,
        displayOrder: String(d.displayOrder),
        lowStockThreshold: String(d.lowStockThreshold),
        isActive: d.isActive,
        onHand: String(d.inventory.onHand),
        reorderThreshold: String(d.inventory.reorderThreshold),
      });
      setHydrated(true);
    }
  }, [detailQuery.data, mfgList.data, catList.data, isNew, hydrated]);

  const images: AdminProductImage[] = useMemo(
    () => detailQuery.data?.images ?? [],
    [detailQuery.data],
  );

  function buildPayload(): Record<string, unknown> | null {
    const name = form.name.trim();
    const slug = form.slug.trim();
    const sku = form.sku.trim();
    if (!name) {
      setError("Name is required");
      return null;
    }
    if (!sku) {
      setError("SKU is required");
      return null;
    }
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      setError("Slug must be lowercase letters, numbers, and dashes only");
      return null;
    }
    const displayOrder = Number.parseInt(form.displayOrder, 10);
    if (Number.isNaN(displayOrder)) {
      setError("Display order must be a number");
      return null;
    }
    const lowStockThreshold = Number.parseInt(form.lowStockThreshold, 10);
    if (Number.isNaN(lowStockThreshold) || lowStockThreshold < 0) {
      setError("Low stock threshold must be 0 or greater");
      return null;
    }

    const decimalOrNull = (s: string, label: string): string | null | "INVALID" => {
      const trimmed = s.trim();
      if (!trimmed) return null;
      if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) {
        setError(`${label} must be a number with up to 2 decimal places`);
        return "INVALID";
      }
      return trimmed;
    };
    const price = decimalOrNull(form.price, "Price");
    if (price === "INVALID") return null;
    const cost = decimalOrNull(form.cost, "Cost");
    if (cost === "INVALID") return null;
    const msrp = decimalOrNull(form.msrp, "MSRP");
    if (msrp === "INVALID") return null;
    const markupPercent = decimalOrNull(form.markupPercent, "Markup %");
    if (markupPercent === "INVALID") return null;
    const weight = decimalOrNull(form.weight, "Weight");
    if (weight === "INVALID") return null;

    return {
      name,
      slug,
      sku,
      description: form.description.trim() || null,
      shortDescription: form.shortDescription.trim() || null,
      manufacturerId: form.manufacturerId === "none" ? null : Number(form.manufacturerId),
      categoryId: form.categoryId === "none" ? null : Number(form.categoryId),
      materialId: null,
      price,
      cost,
      msrp,
      markupPercent,
      pricingMode: form.pricingMode,
      weight,
      dimensions: form.dimensions.trim() || null,
      showPriceOnline: form.showPriceOnline,
      availableOnline: form.availableOnline,
      inStoreOnly: form.inStoreOnly,
      featured: form.featured,
      displayOrder,
      lowStockThreshold,
      isActive: form.isActive,
    };
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const payload = buildPayload();
    if (!payload) return;

    // Validate inventory inputs UPFRONT (only relevant on edit) so that bad
    // input never produces a partial save where the product update commits
    // but the inventory call is skipped/fails.
    let onHand = 0;
    let reorderThreshold = 0;
    if (!isNew) {
      onHand = Number.parseInt(form.onHand, 10);
      reorderThreshold = Number.parseInt(form.reorderThreshold, 10);
      if (Number.isNaN(onHand) || onHand < 0) {
        setError("On-hand must be 0 or greater");
        return;
      }
      if (Number.isNaN(reorderThreshold) || reorderThreshold < 0) {
        setError("Reorder threshold must be 0 or greater");
        return;
      }
    }

    try {
      if (isNew) {
        const created = await createMut.mutateAsync({ data: payload as never });
        toast.toast({ title: "Product created" });
        await qc.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
        navigate(`/products/${created.id}`);
      } else if (productId) {
        await updateMut.mutateAsync({ id: productId, data: payload as never });
        try {
          await inventoryMut.mutateAsync({
            id: productId,
            data: { onHand, reorderThreshold },
          });
          toast.toast({ title: "Product saved" });
        } catch (invErr) {
          // Product update succeeded but inventory failed — be explicit.
          toast.toast({
            variant: "destructive",
            title: "Product saved, inventory failed",
            description:
              invErr instanceof Error
                ? invErr.message
                : "Try saving again to update stock.",
          });
        }
        await qc.invalidateQueries({ queryKey: getAdminGetProductQueryKey(productId) });
        await qc.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
      }
    } catch (err: unknown) {
      const e = err as { response?: { status?: number }; message?: string };
      if (e?.response?.status === 409) {
        setError("A product with that slug or SKU already exists.");
      } else if (e?.response?.status === 400) {
        setError(e?.message ?? "Please fix the errors below.");
      } else {
        setError(e?.message ?? "Could not save product.");
      }
    }
  }

  async function handleAddImages(files: FileList | null) {
    if (!productId || !files || files.length === 0) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) {
          toast.toast({
            variant: "destructive",
            title: `Skipped ${file.name}`,
            description: "Not an image file.",
          });
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.toast({
            variant: "destructive",
            title: `Skipped ${file.name}`,
            description: "Larger than 10 MB.",
          });
          continue;
        }
        const { objectPath } = await uploadFile(file);
        await addImageMut.mutateAsync({
          id: productId,
          data: { url: objectPath, altText: null },
        });
      }
      await qc.invalidateQueries({ queryKey: getAdminGetProductQueryKey(productId) });
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

  async function moveImage(idx: number, dir: -1 | 1) {
    if (!productId) return;
    const newImages = [...images];
    const target = idx + dir;
    if (target < 0 || target >= newImages.length) return;
    [newImages[idx], newImages[target]] = [newImages[target], newImages[idx]];
    try {
      await reorderMut.mutateAsync({
        id: productId,
        data: {
          images: newImages.map((img, i) => ({
            id: img.id,
            displayOrder: i,
            isPrimary: i === 0,
          })),
        },
      });
      await qc.invalidateQueries({ queryKey: getAdminGetProductQueryKey(productId) });
    } catch (err) {
      toast.toast({
        variant: "destructive",
        title: "Reorder failed",
        description: err instanceof Error ? err.message : "Try again.",
      });
    }
  }

  async function setPrimary(imageId: number) {
    if (!productId) return;
    try {
      await reorderMut.mutateAsync({
        id: productId,
        data: {
          images: images.map((img, i) => ({
            id: img.id,
            displayOrder: i,
            isPrimary: img.id === imageId,
          })),
        },
      });
      await qc.invalidateQueries({ queryKey: getAdminGetProductQueryKey(productId) });
    } catch (err) {
      toast.toast({
        variant: "destructive",
        title: "Could not set primary",
        description: err instanceof Error ? err.message : "Try again.",
      });
    }
  }

  async function deleteImage(img: AdminProductImage) {
    if (!productId) return;
    try {
      await deleteImageMut.mutateAsync({ id: productId, imageId: img.id });
      await qc.invalidateQueries({ queryKey: getAdminGetProductQueryKey(productId) });
    } catch (err) {
      toast.toast({
        variant: "destructive",
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Try again.",
      });
    }
  }

  if (!isNew && (detailQuery.isLoading || !hydrated)) {
    return (
      <>
        <PageHeader title="Loading product…" />
        <PageBody>
          <div className="flex justify-center p-12">
            <Spinner className="size-6 text-[#1A3C5E]" />
          </div>
        </PageBody>
      </>
    );
  }

  if (!isNew && detailQuery.isError) {
    return (
      <>
        <PageHeader title="Product not found" />
        <PageBody>
          <div className="bg-white border border-slate-200 rounded-md p-12 text-center">
            <p className="text-sm text-red-600 mb-4">
              Could not load this product. It may have been deleted.
            </p>
            <Button variant="outline" onClick={() => navigate("/products")}>
              <ArrowLeft className="size-4" />
              Back to products
            </Button>
          </div>
        </PageBody>
      </>
    );
  }

  const saving = createMut.isPending || updateMut.isPending || inventoryMut.isPending;

  return (
    <>
      <PageHeader
        title={isNew ? "New product" : form.name || "Product"}
        subtitle={isNew ? "Add a new item to your catalog." : `SKU ${form.sku}`}
        action={
          <Button variant="outline" onClick={() => navigate("/products")}>
            <ArrowLeft className="size-4" />
            Back
          </Button>
        }
      />
      <PageBody>
        <form onSubmit={handleSubmit} className="space-y-6 max-w-5xl">
          {/* Basics */}
          <section className="bg-white border border-slate-200 rounded-md p-6">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
              Basic information
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label htmlFor="p-name">Name</Label>
                <Input
                  id="p-name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      name: e.target.value,
                      slug: f.slugTouched ? f.slug : slugify(e.target.value),
                    }))
                  }
                  placeholder="Brown Jordan Aurora 5pc Dining Set"
                  autoFocus
                />
              </div>
              <div>
                <Label htmlFor="p-slug">Slug</Label>
                <Input
                  id="p-slug"
                  value={form.slug}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      slug: e.target.value,
                      slugTouched: true,
                    }))
                  }
                  placeholder="brown-jordan-aurora-5pc-dining"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">URL-friendly identifier.</p>
              </div>
              <div>
                <Label htmlFor="p-sku">SKU</Label>
                <Input
                  id="p-sku"
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                  placeholder="BJ-AURORA-5DIN"
                  className="font-mono text-sm"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Vendor SKU or your internal code.
                </p>
              </div>
              <div>
                <Label htmlFor="p-mfg">Manufacturer</Label>
                <Select
                  value={form.manufacturerId}
                  onValueChange={(v) => setForm((f) => ({ ...f, manufacturerId: v }))}
                >
                  <SelectTrigger id="p-mfg">
                    <SelectValue placeholder="Select brand" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {(mfgList.data ?? []).map((m) => (
                      <SelectItem key={m.id} value={String(m.id)}>
                        {m.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="p-cat">Category</Label>
                <Select
                  value={form.categoryId}
                  onValueChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
                >
                  <SelectTrigger id="p-cat">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {(catList.data ?? []).map((c) => (
                      <SelectItem key={c.id} value={String(c.id)}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="p-short">Short description</Label>
                <Input
                  id="p-short"
                  value={form.shortDescription}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, shortDescription: e.target.value }))
                  }
                  placeholder="One-liner shown in product listings."
                />
              </div>
              <div className="md:col-span-2">
                <Label htmlFor="p-desc">Description</Label>
                <Textarea
                  id="p-desc"
                  value={form.description}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, description: e.target.value }))
                  }
                  rows={5}
                  placeholder="Full description shown on the product page."
                />
              </div>
            </div>
          </section>

          {/* Pricing & specs */}
          <section className="bg-white border border-slate-200 rounded-md p-6">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
              Pricing &amp; specifications
            </h3>
            <div className="mb-4">
              <Label htmlFor="p-pricing-mode">Pricing mode</Label>
              <Select
                value={form.pricingMode}
                onValueChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    pricingMode: v as FormState["pricingMode"],
                  }))
                }
              >
                <SelectTrigger id="p-pricing-mode" className="w-full md:w-80">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed price (manual)</SelectItem>
                  <SelectItem value="cost_plus_markup">
                    Cost + markup %
                  </SelectItem>
                  <SelectItem value="msrp_minus_dealer_rate">
                    MSRP − dealer rate
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-500 mt-1">
                The sell price below is always what customers see. Mode is a
                hint for how the price was derived; computation helpers will
                use cost/markup or MSRP/dealer-rate accordingly.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label htmlFor="p-price">Sell price ($)</Label>
                <Input
                  id="p-price"
                  value={form.price}
                  onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
                  placeholder="0.00"
                  inputMode="decimal"
                />
              </div>
              <div>
                <Label htmlFor="p-cost">Cost ($)</Label>
                <Input
                  id="p-cost"
                  value={form.cost}
                  onChange={(e) => setForm((f) => ({ ...f, cost: e.target.value }))}
                  placeholder="0.00"
                  inputMode="decimal"
                />
                <p className="text-xs text-slate-500 mt-1">Internal only.</p>
              </div>
              <div>
                <Label htmlFor="p-msrp">MSRP ($)</Label>
                <Input
                  id="p-msrp"
                  value={form.msrp}
                  onChange={(e) => setForm((f) => ({ ...f, msrp: e.target.value }))}
                  placeholder="0.00"
                  inputMode="decimal"
                />
                <p className="text-xs text-slate-500 mt-1">Manufacturer list.</p>
              </div>
              <div>
                <Label htmlFor="p-markup">Markup (%)</Label>
                <Input
                  id="p-markup"
                  value={form.markupPercent}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, markupPercent: e.target.value }))
                  }
                  placeholder="0.00"
                  inputMode="decimal"
                />
                <p className="text-xs text-slate-500 mt-1">Over cost.</p>
              </div>
              <div>
                <Label htmlFor="p-weight">Weight (lb)</Label>
                <Input
                  id="p-weight"
                  value={form.weight}
                  onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                  placeholder="0.0"
                  inputMode="decimal"
                />
              </div>
              <div className="md:col-span-3">
                <Label htmlFor="p-dim">Dimensions</Label>
                <Input
                  id="p-dim"
                  value={form.dimensions}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, dimensions: e.target.value }))
                  }
                  placeholder="60×30×35 in"
                />
              </div>
            </div>
          </section>

          {/* Flags */}
          <section className="bg-white border border-slate-200 rounded-md p-6">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
              Visibility &amp; flags
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FlagRow
                label="Active"
                description="Inactive products are hidden from the storefront entirely."
                checked={form.isActive}
                onChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
              />
              <FlagRow
                label="Available online"
                description="Customers can add this to cart on the website."
                checked={form.availableOnline}
                onChange={(v) => setForm((f) => ({ ...f, availableOnline: v }))}
              />
              <FlagRow
                label="Show price online"
                description='If off, the storefront shows "Call for price".'
                checked={form.showPriceOnline}
                onChange={(v) => setForm((f) => ({ ...f, showPriceOnline: v }))}
              />
              <FlagRow
                label="In-store only"
                description="Visible online but cannot be ordered — agents can sell in store."
                checked={form.inStoreOnly}
                onChange={(v) => setForm((f) => ({ ...f, inStoreOnly: v }))}
              />
              <FlagRow
                label="Featured"
                description="Highlighted on the home page and category pages."
                checked={form.featured}
                onChange={(v) => setForm((f) => ({ ...f, featured: v }))}
              />
              <div>
                <Label htmlFor="p-order">Display order</Label>
                <Input
                  id="p-order"
                  type="number"
                  min={0}
                  value={form.displayOrder}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, displayOrder: e.target.value }))
                  }
                />
                <p className="text-xs text-slate-500 mt-1">
                  Lower numbers appear first within a category.
                </p>
              </div>
            </div>
          </section>

          {/* Images */}
          {!isNew && (
            <section className="bg-white border border-slate-200 rounded-md p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
                    Images
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    First image is primary. Use the arrows to reorder, or click the star
                    to choose a different primary image.
                  </p>
                </div>
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      handleAddImages(e.target.files);
                      e.target.value = "";
                    }}
                  />
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-slate-300 rounded text-sm hover:bg-slate-50">
                    {uploading ? (
                      <>
                        <Spinner className="size-4" /> Uploading…
                      </>
                    ) : (
                      <>
                        <Upload className="size-4" /> Add images
                      </>
                    )}
                  </div>
                </label>
              </div>

              {images.length === 0 ? (
                <div className="border-2 border-dashed border-slate-200 rounded p-12 text-center text-sm text-slate-500">
                  <ImageIcon className="size-8 mx-auto mb-2 text-slate-300" />
                  No images yet. Upload one or more product photos above.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {images.map((img, idx) => {
                    const url = getStaffObjectUrl(img.url);
                    return (
                      <div
                        key={img.id}
                        className={`relative border rounded-md overflow-hidden bg-slate-50 ${img.isPrimary ? "border-amber-400 ring-2 ring-amber-200" : "border-slate-200"}`}
                      >
                        <div className="aspect-square">
                          {url && (
                            <img
                              src={url}
                              alt={img.altText ?? ""}
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        {img.isPrimary && (
                          <div className="absolute top-2 left-2 bg-amber-500 text-white text-xs px-2 py-0.5 rounded flex items-center gap-1">
                            <Star className="size-3" /> Primary
                          </div>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 flex items-center justify-between gap-1">
                          <div className="flex gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-7 w-7 p-0"
                              disabled={idx === 0 || reorderMut.isPending}
                              onClick={() => moveImage(idx, -1)}
                              title="Move earlier"
                            >
                              <ArrowUp className="size-3" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-7 w-7 p-0"
                              disabled={idx === images.length - 1 || reorderMut.isPending}
                              onClick={() => moveImage(idx, 1)}
                              title="Move later"
                            >
                              <ArrowDown className="size-3" />
                            </Button>
                          </div>
                          <div className="flex gap-1">
                            {!img.isPrimary && (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-7 w-7 p-0"
                                onClick={() => setPrimary(img.id)}
                                title="Set as primary"
                              >
                                <Star className="size-3" />
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              className="h-7 w-7 p-0"
                              onClick={() => setConfirmDeleteImage(img)}
                              title="Delete image"
                            >
                              <Trash2 className="size-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Inventory */}
          {!isNew && (
            <section className="bg-white border border-slate-200 rounded-md p-6">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
                Inventory
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="p-onhand">On hand</Label>
                  <Input
                    id="p-onhand"
                    type="number"
                    min={0}
                    value={form.onHand}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, onHand: e.target.value }))
                    }
                  />
                  <p className="text-xs text-slate-500 mt-1">Current stock count.</p>
                </div>
                <div>
                  <Label htmlFor="p-reorder">Reorder threshold</Label>
                  <Input
                    id="p-reorder"
                    type="number"
                    min={0}
                    value={form.reorderThreshold}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, reorderThreshold: e.target.value }))
                    }
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Notify when stock drops to this level.
                  </p>
                </div>
                <div>
                  <Label htmlFor="p-lowstock">Low-stock badge threshold</Label>
                  <Input
                    id="p-lowstock"
                    type="number"
                    min={0}
                    value={form.lowStockThreshold}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, lowStockThreshold: e.target.value }))
                    }
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Show "Only X left" on storefront below this.
                  </p>
                </div>
              </div>
            </section>
          )}

          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded px-4 py-3">
              {error}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/products")}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#1A3C5E] hover:bg-[#15314c] text-white"
            >
              {saving ? "Saving…" : isNew ? "Create product" : "Save changes"}
            </Button>
          </div>
        </form>
      </PageBody>

      <AlertDialog
        open={confirmDeleteImage !== null}
        onOpenChange={(o) => !o && setConfirmDeleteImage(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete image?</AlertDialogTitle>
            <AlertDialogDescription>
              This image will be removed from the product. The image file remains in
              storage and can be re-added later if needed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmDeleteImage) {
                  deleteImage(confirmDeleteImage);
                  setConfirmDeleteImage(null);
                }
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function FlagRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start justify-between gap-4 border border-slate-200 rounded p-3 cursor-pointer hover:bg-slate-50">
      <div>
        <div className="text-sm font-medium text-slate-800">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}

// Suppress unused import warning - Plus is reserved for future "Add another" buttons
void Plus;
void X;
