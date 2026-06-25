import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  History as HistoryIcon,
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
  useListMaterials,
  useAdminListFabrics,
  useAdminGetProductFabrics,
  useAdminUpdateProductFabrics,
  useAdminListFinishes,
  useAdminGetProductFinishes,
  useAdminUpdateProductFinishes,
  useAdminGetProductAttributes,
  useAdminUpdateProductAttributes,
  useAdminGetProductVariants,
  useAdminUpdateProductVariants,
  useAdminListHistory,
  getAdminGetProductQueryKey,
  getAdminListProductsQueryKey,
  getAdminGetProductFabricsQueryKey,
  getAdminGetProductFinishesQueryKey,
  getAdminGetProductAttributesQueryKey,
  getAdminGetProductVariantsQueryKey,
  type AdminProductImage,
  type AdminFabric,
  type AdminFinish,
  type AdminProductAttribute,
  type AdminProductVariant,
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
import HistoryPanel from "../../components/HistoryPanel";
import { uploadFile, getStaffObjectUrl } from "../../lib/upload";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Dropdown option sets — must match the DB CHECK constraints in
// lib/db/src/schema/products.ts exactly.
const SEAT_TYPE_OPTIONS = [
  "Sling",
  "Cushion",
  "Strap",
  "Wicker Weave",
  "Solid",
  "Padded Sling",
] as const;
const UMBRELLA_TYPE_OPTIONS = [
  "Cantilever",
  "Market",
  "Specialty",
  "Beach",
] as const;
const UMBRELLA_SHAPE_OPTIONS = [
  "Octagon",
  "Square",
  "Rectangle",
  "Round",
] as const;
const LIFT_MECHANISM_OPTIONS = [
  "Crank",
  "Manual",
  "Pulley",
  "Quad Pulley",
] as const;
const TILT_MECHANISM_OPTIONS = [
  "Auto",
  "Collar",
  "Push Button",
  "Glide",
  "Rotational",
  "None",
] as const;
const POLE_MATERIAL_OPTIONS = [
  "Aluminum",
  "Fiberglass",
  "Wood",
  "Teak",
  "Steel",
] as const;

interface FormState {
  name: string;
  slug: string;
  slugTouched: boolean;
  sku: string;
  description: string;
  shortDescription: string;
  manufacturerId: string;
  categoryId: string;
  materialIds: number[];
  collection: string;
  subCategory: string;
  subMaterial: string;
  seatType: string;
  umbrellaType: string;
  umbrellaShape: string;
  umbrellaSize: string;
  liftMechanism: string;
  tiltMechanism: string;
  poleMaterial: string;
  hasLedLighting: boolean;
  isCommercialGrade: boolean;
  price: string;
  salePrice: string;
  frameOnlyPrice: string;
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
  quoteOnly: boolean;
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
    materialIds: [],
    collection: "",
    subCategory: "",
    subMaterial: "",
    seatType: "none",
    umbrellaType: "none",
    umbrellaShape: "none",
    umbrellaSize: "",
    liftMechanism: "none",
    tiltMechanism: "none",
    poleMaterial: "none",
    hasLedLighting: false,
    isCommercialGrade: false,
    price: "",
    salePrice: "",
    frameOnlyPrice: "",
    cost: "",
    msrp: "",
    markupPercent: "",
    pricingMode: "fixed",
    weight: "",
    dimensions: "",
    showPriceOnline: false,
    availableOnline: true,
    inStoreOnly: false,
    featured: false,
    quoteOnly: true,
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
  const materialList = useListMaterials();
  const fabricsList = useAdminListFabrics({
    query: { enabled: !isNew, queryKey: ["/api/admin/fabrics"] as const },
  });
  const fabricsConfigQuery = useAdminGetProductFabrics(productId ?? 0, {
    query: {
      enabled: !isNew && Number.isFinite(productId) && (productId ?? 0) > 0,
      queryKey: getAdminGetProductFabricsQueryKey(productId ?? 0),
    },
  });
  const finishesList = useAdminListFinishes({
    query: { enabled: !isNew, queryKey: ["/api/admin/finishes"] as const },
  });
  const finishesConfigQuery = useAdminGetProductFinishes(productId ?? 0, {
    query: {
      enabled: !isNew && Number.isFinite(productId) && (productId ?? 0) > 0,
      queryKey: getAdminGetProductFinishesQueryKey(productId ?? 0),
    },
  });
  const attributesQuery = useAdminGetProductAttributes(productId ?? 0, {
    query: {
      enabled: !isNew && Number.isFinite(productId) && (productId ?? 0) > 0,
      queryKey: getAdminGetProductAttributesQueryKey(productId ?? 0),
    },
  });
  const variantsConfigQuery = useAdminGetProductVariants(productId ?? 0, {
    query: {
      enabled: !isNew && Number.isFinite(productId) && (productId ?? 0) > 0,
      queryKey: getAdminGetProductVariantsQueryKey(productId ?? 0),
    },
  });
  const createMut = useAdminCreateProduct();
  const updateMut = useAdminUpdateProduct();
  const addImageMut = useAdminAddProductImage();
  const reorderMut = useAdminReorderProductImages();
  const deleteImageMut = useAdminDeleteProductImage();
  const inventoryMut = useAdminUpdateProductInventory();
  const fabricsMut = useAdminUpdateProductFabrics();
  const finishesMut = useAdminUpdateProductFinishes();
  const attributesMut = useAdminUpdateProductAttributes();
  const variantsMut = useAdminUpdateProductVariants();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteImage, setConfirmDeleteImage] =
    useState<AdminProductImage | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Fabric pool (manufacturer-wide) selections + individual fabric picks.
  const [poolManufacturerIds, setPoolManufacturerIds] = useState<number[]>([]);
  const [pickedFabricIds, setPickedFabricIds] = useState<number[]>([]);
  const [expandedFabricMfgs, setExpandedFabricMfgs] = useState<Set<number>>(
    () => new Set(),
  );

  // Finish pool (manufacturer-wide) selections + individual finish picks.
  const [finishPoolMfgIds, setFinishPoolMfgIds] = useState<number[]>([]);
  const [pickedFinishIds, setPickedFinishIds] = useState<number[]>([]);
  // MSRP frame upcharge per individually-picked finish, keyed by finishId.
  // Only explicit picks carry an upcharge; pooled finishes are always 0.
  const [finishUpcharges, setFinishUpcharges] = useState<
    Record<number, string>
  >({});
  const [expandedFinishMfgs, setExpandedFinishMfgs] = useState<Set<number>>(
    () => new Set(),
  );

  // Free-form attributes (features / options / replacement parts).
  type AttrDraft = {
    key: string;
    attributeType: "feature" | "option" | "replacement_part";
    partName: string;
    value: string;
  };
  const [attrs, setAttrs] = useState<AttrDraft[]>([]);
  const [fabAttrHydrated, setFabAttrHydrated] = useState(false);

  // Variants + per-grade pricing (umbrella vents, cover sizes, frame/base
  // finishes, etc.). The full set is replaced on save.
  type GradePriceDraft = { grade: string; msrp: string; salePrice: string };
  type VariantDraft = {
    key: string;
    variantSku: string;
    variantName: string;
    optionLabel: string;
    priceAdjustment: string;
    msrp: string;
    salePrice: string;
    shippingSurcharge: string;
    weight: string;
    dimensions: string;
    notes: string;
    minOrderQty: string;
    excludeStripeFabrics: boolean;
    isActive: boolean;
    gradePrices: GradePriceDraft[];
  };
  const [variants, setVariants] = useState<VariantDraft[]>([]);
  const [variantsHydrated, setVariantsHydrated] = useState(false);

  // Reset hydration when the route param changes (router may reuse the
  // component when navigating between /products/A and /products/B), so the
  // form re-hydrates from the new product's data.
  useEffect(() => {
    setHydrated(false);
    setFabAttrHydrated(false);
    // Clear stale per-product state so the previous product's fabrics/attrs
    // can never be saved against a freshly-opened product if the user clicks
    // Save before the new queries hydrate.
    setPoolManufacturerIds([]);
    setPickedFabricIds([]);
    setFinishPoolMfgIds([]);
    setPickedFinishIds([]);
    setFinishUpcharges({});
    setAttrs([]);
    setVariants([]);
    setVariantsHydrated(false);
  }, [productId]);

  // Hydrate fabric + attribute state from server data once both queries land.
  useEffect(() => {
    if (
      !isNew &&
      fabricsConfigQuery.data &&
      finishesConfigQuery.data &&
      attributesQuery.data &&
      !fabAttrHydrated
    ) {
      setPoolManufacturerIds(
        fabricsConfigQuery.data.pools.map((p) => p.manufacturerId),
      );
      setPickedFabricIds(fabricsConfigQuery.data.fabricIds);
      setFinishPoolMfgIds(
        finishesConfigQuery.data.pools.map((p) => p.manufacturerId),
      );
      setPickedFinishIds(finishesConfigQuery.data.finishIds);
      setFinishUpcharges(
        Object.fromEntries(
          finishesConfigQuery.data.upcharges
            .filter((u) => Number(u.upchargeMsrp) > 0)
            .map((u) => [u.finishId, String(Number(u.upchargeMsrp))]),
        ),
      );
      setAttrs(
        attributesQuery.data.map((a: AdminProductAttribute, i: number) => ({
          key: `${a.id}-${i}`,
          attributeType: a.attributeType,
          partName: a.partName ?? "",
          value: a.value,
        })),
      );
      setFabAttrHydrated(true);
    }
  }, [fabricsConfigQuery.data, finishesConfigQuery.data, attributesQuery.data, isNew, fabAttrHydrated]);

  // Hydrate variant + grade-price drafts from server data.
  useEffect(() => {
    if (!isNew && variantsConfigQuery.data && !variantsHydrated) {
      setVariants(
        variantsConfigQuery.data.variants.map(
          (v: AdminProductVariant, i: number) => ({
            key: `${v.id}-${i}`,
            variantSku: v.variantSku,
            variantName: v.variantName,
            optionLabel: v.optionLabel,
            priceAdjustment: v.priceAdjustment,
            msrp: v.msrp ?? "",
            salePrice: v.salePrice ?? "",
            shippingSurcharge: v.shippingSurcharge ?? "0",
            weight: v.weight ?? "",
            dimensions: v.dimensions ?? "",
            notes: v.notes ?? "",
            minOrderQty: v.minOrderQty != null ? String(v.minOrderQty) : "",
            excludeStripeFabrics: v.excludeStripeFabrics,
            isActive: v.isActive,
            gradePrices: v.gradePrices.map((g) => ({
              grade: g.grade,
              msrp: g.msrp,
              salePrice: g.salePrice,
            })),
          }),
        ),
      );
      setVariantsHydrated(true);
    }
  }, [variantsConfigQuery.data, isNew, variantsHydrated]);

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
      materialList.data &&
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
        materialIds: d.materials.map((m) => m.id),
        collection: d.collection ?? "",
        subCategory: d.subCategory ?? "",
        subMaterial: d.subMaterial ?? "",
        seatType: d.seatType ?? "none",
        umbrellaType: d.umbrellaType ?? "none",
        umbrellaShape: d.umbrellaShape ?? "none",
        umbrellaSize: d.umbrellaSize ?? "",
        liftMechanism: d.liftMechanism ?? "none",
        tiltMechanism: d.tiltMechanism ?? "none",
        poleMaterial: d.poleMaterial ?? "none",
        hasLedLighting: d.hasLedLighting,
        isCommercialGrade: d.isCommercialGrade,
        price: d.price ?? "",
        salePrice: d.salePrice ?? "",
        frameOnlyPrice: d.frameOnlyPrice ?? "",
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
        quoteOnly: d.quoteOnly,
        displayOrder: String(d.displayOrder),
        lowStockThreshold: String(d.lowStockThreshold),
        isActive: d.isActive,
        onHand: String(d.inventory.onHand),
        reorderThreshold: String(d.inventory.reorderThreshold),
      });
      setHydrated(true);
    }
  }, [detailQuery.data, mfgList.data, catList.data, materialList.data, isNew, hydrated]);

  const images: AdminProductImage[] = useMemo(
    () => detailQuery.data?.images ?? [],
    [detailQuery.data],
  );

  // Umbrella Details section is shown only for the Umbrellas category
  // (slug `cat-umbrellas`), not for umbrella bases or anything else.
  const isUmbrellaCategory = useMemo(() => {
    if (form.categoryId === "none") return false;
    const cat = (catList.data ?? []).find(
      (c) => String(c.id) === form.categoryId,
    );
    return cat?.slug === "cat-umbrellas";
  }, [catList.data, form.categoryId]);

  // Umbrella category IDs — these products are available for online sale.
  // All others default to quote/call-for-price.
  const UMBRELLA_CATEGORY_IDS = [38, 39]; // Umbrellas, Umbrella Bases

  // When creating a new product, auto-set quoteOnly + showPriceOnline based
  // on the selected category. Existing products load these from the server.
  useEffect(() => {
    if (!isNew) return;
    const catId = form.categoryId !== "none" ? Number(form.categoryId) : null;
    if (catId === null) return;
    const isUmbrella = UMBRELLA_CATEGORY_IDS.includes(catId);
    setForm((f) => ({
      ...f,
      quoteOnly: !isUmbrella,
      showPriceOnline: isUmbrella,
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.categoryId, isNew]);

  // Group all finishes by manufacturer for the picker UI.
  const finishesByMfg = useMemo(() => {
    const map = new Map<
      number,
      { manufacturerId: number; manufacturerName: string; finishes: AdminFinish[] }
    >();
    for (const f of finishesList.data ?? []) {
      const cur = map.get(f.manufacturerId);
      if (cur) {
        cur.finishes.push(f);
      } else {
        map.set(f.manufacturerId, {
          manufacturerId: f.manufacturerId,
          manufacturerName: f.manufacturerName,
          finishes: [f],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.manufacturerName.localeCompare(b.manufacturerName),
    );
  }, [finishesList.data]);

  // Group all fabrics by manufacturer for the picker UI.
  const fabricsByMfg = useMemo(() => {
    const map = new Map<
      number,
      { manufacturerId: number; manufacturerName: string; fabrics: AdminFabric[] }
    >();
    for (const f of fabricsList.data ?? []) {
      const cur = map.get(f.manufacturerId);
      if (cur) {
        cur.fabrics.push(f);
      } else {
        map.set(f.manufacturerId, {
          manufacturerId: f.manufacturerId,
          manufacturerName: f.manufacturerName,
          fabrics: [f],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) =>
      a.manufacturerName.localeCompare(b.manufacturerName),
    );
  }, [fabricsList.data]);

  // Restrict the picker to the product's own manufacturer when one is set.
  const filteredFabricsByMfg = useMemo(() => {
    const mfgId =
      form.manufacturerId !== "none" ? Number(form.manufacturerId) : null;
    if (!mfgId) return fabricsByMfg;
    return fabricsByMfg.filter((g) => g.manufacturerId === mfgId);
  }, [fabricsByMfg, form.manufacturerId]);

  const filteredFinishesByMfg = useMemo(() => {
    const mfgId =
      form.manufacturerId !== "none" ? Number(form.manufacturerId) : null;
    if (!mfgId) return finishesByMfg;
    return finishesByMfg.filter((g) => g.manufacturerId === mfgId);
  }, [finishesByMfg, form.manufacturerId]);

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
    const salePrice = decimalOrNull(form.salePrice, "Sale price");
    if (salePrice === "INVALID") return null;
    const frameOnlyPrice = decimalOrNull(form.frameOnlyPrice, "Frame only price");
    if (frameOnlyPrice === "INVALID") return null;
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
      materialIds: form.materialIds,
      collection: form.collection.trim() || null,
      subCategory: form.subCategory.trim() || null,
      subMaterial: form.subMaterial.trim() || null,
      seatType: form.seatType === "none" ? null : form.seatType,
      umbrellaType: form.umbrellaType === "none" ? null : form.umbrellaType,
      umbrellaShape: form.umbrellaShape === "none" ? null : form.umbrellaShape,
      umbrellaSize: form.umbrellaSize.trim() || null,
      liftMechanism: form.liftMechanism === "none" ? null : form.liftMechanism,
      tiltMechanism: form.tiltMechanism === "none" ? null : form.tiltMechanism,
      poleMaterial: form.poleMaterial === "none" ? null : form.poleMaterial,
      hasLedLighting: form.hasLedLighting,
      isCommercialGrade: form.isCommercialGrade,
      price,
      salePrice,
      frameOnlyPrice,
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
      quoteOnly: form.quoteOnly,
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
        navigate(`/admin/products/${created.id}`);
      } else if (productId) {
        // Block save until fabric/attribute data has hydrated, otherwise we'd
        // overwrite the product's saved configuration with empty arrays.
        if (!fabAttrHydrated) {
          setError(
            "Still loading this product's fabrics and attributes. Try again in a moment.",
          );
          return;
        }

        // Block save until variant data has hydrated. The variants PUT replaces
        // the full set, so saving with an un-hydrated empty array would wipe
        // every variant + grade price for the product.
        if (!variantsHydrated) {
          setError(
            "Still loading this product's variants. Try again in a moment.",
          );
          return;
        }

        // Validate attributes locally BEFORE the main update so we don't
        // commit a partial save (product core fields would otherwise persist
        // even though attributes are invalid).
        for (const a of attrs) {
          if (a.value.trim() === "") {
            setError("All attributes need a value.");
            return;
          }
          if (a.attributeType === "replacement_part" && a.partName.trim() === "") {
            setError("Replacement parts need a part name.");
            return;
          }
        }

        await updateMut.mutateAsync({ id: productId, data: payload as never });

        const followUpFailures: string[] = [];

        try {
          await inventoryMut.mutateAsync({
            id: productId,
            data: { onHand, reorderThreshold },
          });
        } catch (invErr) {
          followUpFailures.push(
            `Inventory: ${invErr instanceof Error ? invErr.message : "failed"}`,
          );
        }

        try {
          await fabricsMut.mutateAsync({
            id: productId,
            data: {
              manufacturerIds: poolManufacturerIds,
              fabricIds: pickedFabricIds,
            },
          });
        } catch (fErr) {
          followUpFailures.push(
            `Fabrics: ${fErr instanceof Error ? fErr.message : "failed"}`,
          );
        }

        try {
          await finishesMut.mutateAsync({
            id: productId,
            data: {
              manufacturerIds: finishPoolMfgIds,
              finishIds: pickedFinishIds,
              upcharges: pickedFinishIds.map((fid) => ({
                finishId: fid,
                upchargeMsrp:
                  (finishUpcharges[fid] ?? "").trim() === ""
                    ? "0"
                    : finishUpcharges[fid]!.trim(),
              })),
            },
          });
        } catch (fErr) {
          followUpFailures.push(
            `Finishes: ${fErr instanceof Error ? fErr.message : "failed"}`,
          );
        }

        try {
          // Renumber displayOrder per group so it always reflects current UI order.
          const counters: Record<string, number> = {};
          await attributesMut.mutateAsync({
            id: productId,
            data: {
              attributes: attrs.map((a) => {
                const idx = counters[a.attributeType] ?? 0;
                counters[a.attributeType] = idx + 1;
                return {
                  attributeType: a.attributeType,
                  partName:
                    a.attributeType === "replacement_part"
                      ? a.partName.trim()
                      : null,
                  value: a.value.trim(),
                  displayOrder: idx,
                };
              }),
            },
          });
        } catch (aErr) {
          followUpFailures.push(
            `Attributes: ${aErr instanceof Error ? aErr.message : "failed"}`,
          );
        }

        try {
          await variantsMut.mutateAsync({
            id: productId,
            data: {
              variants: variants.map((v, i) => ({
                variantSku: v.variantSku.trim(),
                variantName: v.variantName.trim(),
                optionLabel: v.optionLabel.trim() || "Option",
                priceAdjustment: v.priceAdjustment.trim() || "0",
                msrp: v.msrp.trim() === "" ? null : v.msrp.trim(),
                salePrice: v.salePrice.trim() === "" ? null : v.salePrice.trim(),
                shippingSurcharge: v.shippingSurcharge.trim() || "0",
                weight: v.weight.trim() === "" ? null : v.weight.trim(),
                dimensions:
                  v.dimensions.trim() === "" ? null : v.dimensions.trim(),
                notes: v.notes.trim() === "" ? null : v.notes.trim(),
                minOrderQty:
                  v.minOrderQty.trim() === ""
                    ? null
                    : Number(v.minOrderQty),
                excludeStripeFabrics: v.excludeStripeFabrics,
                displayOrder: i,
                isActive: v.isActive,
                gradePrices: v.gradePrices
                  .filter(
                    (g) =>
                      g.grade.trim() !== "" &&
                      g.msrp.trim() !== "" &&
                      g.salePrice.trim() !== "",
                  )
                  .map((g) => ({
                    grade: g.grade.trim(),
                    msrp: g.msrp.trim(),
                    salePrice: g.salePrice.trim(),
                  })),
              })),
            },
          });
        } catch (vErr) {
          followUpFailures.push(
            `Variants: ${vErr instanceof Error ? vErr.message : "failed"}`,
          );
        }

        if (followUpFailures.length === 0) {
          toast.toast({ title: "Product saved" });
        } else {
          toast.toast({
            variant: "destructive",
            title: "Product saved with errors",
            description: followUpFailures.join("; "),
          });
        }

        await qc.invalidateQueries({ queryKey: getAdminGetProductQueryKey(productId) });
        await qc.invalidateQueries({ queryKey: getAdminListProductsQueryKey() });
        await qc.invalidateQueries({
          queryKey: getAdminGetProductFabricsQueryKey(productId),
        });
        await qc.invalidateQueries({
          queryKey: getAdminGetProductFinishesQueryKey(productId),
        });
        await qc.invalidateQueries({
          queryKey: getAdminGetProductAttributesQueryKey(productId),
        });
        await qc.invalidateQueries({
          queryKey: getAdminGetProductVariantsQueryKey(productId),
        });
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
            <Button variant="outline" onClick={() => navigate("/admin/products")}>
              <ArrowLeft className="size-4" />
              Back to products
            </Button>
          </div>
        </PageBody>
      </>
    );
  }

  const saving =
    createMut.isPending ||
    updateMut.isPending ||
    inventoryMut.isPending ||
    fabricsMut.isPending ||
    finishesMut.isPending ||
    attributesMut.isPending ||
    variantsMut.isPending;

  function togglePool(manufacturerId: number) {
    setPoolManufacturerIds((cur) =>
      cur.includes(manufacturerId)
        ? cur.filter((id) => id !== manufacturerId)
        : [...cur, manufacturerId],
    );
  }

  function togglePickedFabric(fabricId: number) {
    setPickedFabricIds((cur) =>
      cur.includes(fabricId)
        ? cur.filter((id) => id !== fabricId)
        : [...cur, fabricId],
    );
  }

  function toggleMfgExpanded(manufacturerId: number) {
    setExpandedFabricMfgs((cur) => {
      const next = new Set(cur);
      if (next.has(manufacturerId)) next.delete(manufacturerId);
      else next.add(manufacturerId);
      return next;
    });
  }

  function toggleFinishPool(manufacturerId: number) {
    setFinishPoolMfgIds((cur) =>
      cur.includes(manufacturerId)
        ? cur.filter((id) => id !== manufacturerId)
        : [...cur, manufacturerId],
    );
  }

  function togglePickedFinish(finishId: number) {
    setPickedFinishIds((cur) =>
      cur.includes(finishId)
        ? cur.filter((id) => id !== finishId)
        : [...cur, finishId],
    );
  }

  function toggleFinishMfgExpanded(manufacturerId: number) {
    setExpandedFinishMfgs((cur) => {
      const next = new Set(cur);
      if (next.has(manufacturerId)) next.delete(manufacturerId);
      else next.add(manufacturerId);
      return next;
    });
  }

  function addAttr(type: AttrDraft["attributeType"]) {
    setAttrs((cur) => [
      ...cur,
      {
        key: `new-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        attributeType: type,
        partName: "",
        value: "",
      },
    ]);
  }
  function removeAttr(key: string) {
    setAttrs((cur) => cur.filter((a) => a.key !== key));
  }
  function moveAttr(key: string, dir: -1 | 1) {
    setAttrs((cur) => {
      const idx = cur.findIndex((a) => a.key === key);
      if (idx < 0) return cur;
      // Move within the same attributeType group only.
      const same = cur[idx].attributeType;
      let target = idx + dir;
      while (target >= 0 && target < cur.length && cur[target].attributeType !== same) {
        target += dir;
      }
      if (target < 0 || target >= cur.length) return cur;
      const next = [...cur];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  }
  function patchAttr(key: string, patch: Partial<AttrDraft>) {
    setAttrs((cur) => cur.map((a) => (a.key === key ? { ...a, ...patch } : a)));
  }

  return (
    <>
      <PageHeader
        title={isNew ? "New product" : form.name || "Product"}
        subtitle={isNew ? "Add a new item to your catalog." : `SKU ${form.sku}`}
        action={
          <Button variant="outline" onClick={() => navigate("/admin/products")}>
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
                <Label htmlFor="p-mfg">Vendor</Label>
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
              <div>
                <Label htmlFor="p-subcategory">Sub Category</Label>
                <Input
                  id="p-subcategory"
                  value={form.subCategory}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, subCategory: e.target.value }))
                  }
                  placeholder="e.g. Dining Chair, Bar & Counter Stools"
                />
              </div>
              <div>
                <Label htmlFor="p-submaterial">Sub Material</Label>
                <Input
                  id="p-submaterial"
                  value={form.subMaterial}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, subMaterial: e.target.value }))
                  }
                  placeholder="e.g. Teak, Cast Aluminum"
                />
              </div>
              <div className="md:col-span-2">
                <Label>Materials</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {(materialList.data ?? []).map((m) => {
                    const selected = form.materialIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() =>
                          setForm((f) => ({
                            ...f,
                            materialIds: selected
                              ? f.materialIds.filter((id) => id !== m.id)
                              : [...f.materialIds, m.id],
                          }))
                        }
                        className={
                          selected
                            ? "px-3 py-1 rounded-full text-sm border border-emerald-600 bg-emerald-600 text-white"
                            : "px-3 py-1 rounded-full text-sm border border-slate-300 bg-white text-slate-700 hover:border-slate-400"
                        }
                      >
                        {m.name}
                      </button>
                    );
                  })}
                  {(materialList.data ?? []).length === 0 && (
                    <p className="text-xs text-slate-500">No materials defined.</p>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Click to toggle. A product can have multiple materials.
                </p>
              </div>
              <div>
                <Label htmlFor="p-collection">Collection</Label>
                <Input
                  id="p-collection"
                  value={form.collection}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, collection: e.target.value }))
                  }
                  placeholder="e.g. Blair, Laguna, Leeward"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Groups related products. Slug is generated automatically.
                </p>
              </div>
              <div>
                <Label htmlFor="p-seat-type">Seat type</Label>
                <Select
                  value={form.seatType}
                  onValueChange={(v) => setForm((f) => ({ ...f, seatType: v }))}
                >
                  <SelectTrigger id="p-seat-type">
                    <SelectValue placeholder="Select seat type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— None —</SelectItem>
                    {SEAT_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o} value={o}>
                        {o}
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

          {/* Umbrella details — only relevant to the Umbrellas category. */}
          {isUmbrellaCategory && (
            <section className="bg-white border border-slate-200 rounded-md p-6">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-4">
                Umbrella details
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="p-umb-type">Type</Label>
                  <Select
                    value={form.umbrellaType}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, umbrellaType: v }))
                    }
                  >
                    <SelectTrigger id="p-umb-type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {UMBRELLA_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="p-umb-shape">Shape</Label>
                  <Select
                    value={form.umbrellaShape}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, umbrellaShape: v }))
                    }
                  >
                    <SelectTrigger id="p-umb-shape">
                      <SelectValue placeholder="Select shape" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {UMBRELLA_SHAPE_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="p-umb-size">Size</Label>
                  <Input
                    id="p-umb-size"
                    value={form.umbrellaSize}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, umbrellaSize: e.target.value }))
                    }
                    placeholder='e.g. 9 ft, 11 ft'
                  />
                </div>
                <div>
                  <Label htmlFor="p-lift">Lift mechanism</Label>
                  <Select
                    value={form.liftMechanism}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, liftMechanism: v }))
                    }
                  >
                    <SelectTrigger id="p-lift">
                      <SelectValue placeholder="Select lift" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {LIFT_MECHANISM_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="p-tilt">Tilt mechanism</Label>
                  <Select
                    value={form.tiltMechanism}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, tiltMechanism: v }))
                    }
                  >
                    <SelectTrigger id="p-tilt">
                      <SelectValue placeholder="Select tilt" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {TILT_MECHANISM_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="p-pole">Pole material</Label>
                  <Select
                    value={form.poleMaterial}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, poleMaterial: v }))
                    }
                  >
                    <SelectTrigger id="p-pole">
                      <SelectValue placeholder="Select pole material" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">— None —</SelectItem>
                      {POLE_MATERIAL_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>
                          {o}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </section>
          )}

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
                <p className="text-xs text-slate-500 mt-1">Frame + fabric.</p>
              </div>
              <div>
                <Label htmlFor="p-sale-price">Sale price ($)</Label>
                <Input
                  id="p-sale-price"
                  value={form.salePrice}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, salePrice: e.target.value }))
                  }
                  placeholder="0.00"
                  inputMode="decimal"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Shown to customers; sell price struck through. Leave blank for no sale.
                </p>
              </div>
              <div>
                <Label htmlFor="p-frame-only-price">Frame only price ($)</Label>
                <Input
                  id="p-frame-only-price"
                  value={form.frameOnlyPrice}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, frameOnlyPrice: e.target.value }))
                  }
                  placeholder="0.00"
                  inputMode="decimal"
                />
                <p className="text-xs text-slate-500 mt-1">
                  Enables "Frame Only" option. Leave blank to disable.
                </p>
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
                <p className="text-xs text-slate-500 mt-1">Vendor list.</p>
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

          {/* Price history */}
          {productId && <PriceHistoryPanel productId={productId} />}

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
              <FlagRow
                label="Quote / Call for price"
                description='Hides price and checkout — customers must call or request a quote. Auto-set by category.'
                checked={form.quoteOnly}
                onChange={(v) =>
                  setForm((f) => ({
                    ...f,
                    quoteOnly: v,
                    showPriceOnline: v ? false : f.showPriceOnline,
                  }))
                }
              />
              <FlagRow
                label="LED lighting"
                description="Product includes integrated LED lighting."
                checked={form.hasLedLighting}
                onChange={(v) => setForm((f) => ({ ...f, hasLedLighting: v }))}
              />
              <FlagRow
                label="Commercial grade"
                description="Rated for commercial / contract use."
                checked={form.isCommercialGrade}
                onChange={(v) =>
                  setForm((f) => ({ ...f, isCommercialGrade: v }))
                }
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

          {/* Variants & grade pricing */}
          {!isNew && (
            <section className="bg-white border border-slate-200 rounded-md p-6">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
                Variants &amp; grade pricing
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Configurations a customer selects before fabric (e.g. vent type,
                size, frame finish). Add per-grade prices (A/B/C/D) to put this
                product into grade-pricing mode; leave grade prices empty for a
                flat-priced finish/size selector.
              </p>

              {variants.length === 0 ? (
                <p className="text-sm text-slate-500 mb-4">
                  No variants configured.
                </p>
              ) : (
                <div className="space-y-4 mb-4">
                  {variants.map((v, vi) => (
                    <div
                      key={v.key}
                      className="border border-slate-200 rounded-md p-4"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-semibold text-slate-500 uppercase">
                          Variant {vi + 1}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-700"
                          onClick={() =>
                            setVariants((cur) =>
                              cur.filter((_, i) => i !== vi),
                            )
                          }
                        >
                          Remove
                        </Button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <Label>Variant SKU</Label>
                          <Input
                            value={v.variantSku}
                            onChange={(e) =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi
                                    ? { ...x, variantSku: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>Display name</Label>
                          <Input
                            value={v.variantName}
                            onChange={(e) =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi
                                    ? { ...x, variantName: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>Option label</Label>
                          <Input
                            placeholder="e.g. Vent Type, Finish, Size"
                            value={v.optionLabel}
                            onChange={(e) =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi
                                    ? { ...x, optionLabel: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>Price adjustment</Label>
                          <Input
                            value={v.priceAdjustment}
                            onChange={(e) =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi
                                    ? {
                                        ...x,
                                        priceAdjustment: e.target.value,
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>MSRP</Label>
                          <Input
                            placeholder="Absolute price (overrides base)"
                            value={v.msrp}
                            onChange={(e) =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi ? { ...x, msrp: e.target.value } : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>Sale price</Label>
                          <Input
                            placeholder="Optional; blank = no sale"
                            value={v.salePrice}
                            onChange={(e) =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi
                                    ? { ...x, salePrice: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>Shipping surcharge</Label>
                          <Input
                            placeholder="0.00"
                            value={v.shippingSurcharge}
                            onChange={(e) =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi
                                    ? {
                                        ...x,
                                        shippingSurcharge: e.target.value,
                                      }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>Weight (lbs)</Label>
                          <Input
                            placeholder="Defaults to product weight"
                            value={v.weight}
                            onChange={(e) =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi
                                    ? { ...x, weight: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="sm:col-span-2">
                          <Label>Dimensions</Label>
                          <Input
                            placeholder="Defaults to product dimensions"
                            value={v.dimensions}
                            onChange={(e) =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi
                                    ? { ...x, dimensions: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div>
                          <Label>Min order qty</Label>
                          <Input
                            type="number"
                            min={0}
                            value={v.minOrderQty}
                            onChange={(e) =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi
                                    ? { ...x, minOrderQty: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label>Notes</Label>
                          <Textarea
                            rows={2}
                            value={v.notes}
                            onChange={(e) =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi
                                    ? { ...x, notes: e.target.value }
                                    : x,
                                ),
                              )
                            }
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-6 mt-3">
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <Switch
                            checked={v.excludeStripeFabrics}
                            onCheckedChange={(checked) =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi
                                    ? { ...x, excludeStripeFabrics: checked }
                                    : x,
                                ),
                              )
                            }
                          />
                          Exclude stripe fabrics
                        </label>
                        <label className="flex items-center gap-2 text-sm text-slate-700">
                          <Switch
                            checked={v.isActive}
                            onCheckedChange={(checked) =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi
                                    ? { ...x, isActive: checked }
                                    : x,
                                ),
                              )
                            }
                          />
                          Active
                        </label>
                      </div>

                      {/* Grade prices */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <Label className="text-xs uppercase tracking-wide text-slate-500">
                            Grade prices
                          </Label>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              setVariants((cur) =>
                                cur.map((x, i) =>
                                  i === vi
                                    ? {
                                        ...x,
                                        gradePrices: [
                                          ...x.gradePrices,
                                          {
                                            grade: "",
                                            msrp: "",
                                            salePrice: "",
                                          },
                                        ],
                                      }
                                    : x,
                                ),
                              )
                            }
                          >
                            Add grade
                          </Button>
                        </div>
                        {v.gradePrices.length === 0 ? (
                          <p className="text-xs text-slate-400">
                            Flat-priced (uses the product price above). Add
                            grades to enable grade pricing.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {v.gradePrices.map((g, gi) => (
                              <div
                                key={gi}
                                className="grid grid-cols-[80px_1fr_1fr_auto] gap-2 items-center"
                              >
                                <Input
                                  placeholder="Grade"
                                  value={g.grade}
                                  onChange={(e) =>
                                    setVariants((cur) =>
                                      cur.map((x, i) =>
                                        i === vi
                                          ? {
                                              ...x,
                                              gradePrices: x.gradePrices.map(
                                                (y, j) =>
                                                  j === gi
                                                    ? {
                                                        ...y,
                                                        grade: e.target.value,
                                                      }
                                                    : y,
                                              ),
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                                <Input
                                  placeholder="MSRP"
                                  value={g.msrp}
                                  onChange={(e) =>
                                    setVariants((cur) =>
                                      cur.map((x, i) =>
                                        i === vi
                                          ? {
                                              ...x,
                                              gradePrices: x.gradePrices.map(
                                                (y, j) =>
                                                  j === gi
                                                    ? {
                                                        ...y,
                                                        msrp: e.target.value,
                                                      }
                                                    : y,
                                              ),
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                                <Input
                                  placeholder="Sale price"
                                  value={g.salePrice}
                                  onChange={(e) =>
                                    setVariants((cur) =>
                                      cur.map((x, i) =>
                                        i === vi
                                          ? {
                                              ...x,
                                              gradePrices: x.gradePrices.map(
                                                (y, j) =>
                                                  j === gi
                                                    ? {
                                                        ...y,
                                                        salePrice:
                                                          e.target.value,
                                                      }
                                                    : y,
                                              ),
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                />
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700"
                                  onClick={() =>
                                    setVariants((cur) =>
                                      cur.map((x, i) =>
                                        i === vi
                                          ? {
                                              ...x,
                                              gradePrices:
                                                x.gradePrices.filter(
                                                  (_, j) => j !== gi,
                                                ),
                                            }
                                          : x,
                                      ),
                                    )
                                  }
                                >
                                  ✕
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setVariants((cur) => [
                    ...cur,
                    {
                      key: `new-${Date.now()}-${cur.length}`,
                      variantSku: "",
                      variantName: "",
                      optionLabel: "Option",
                      priceAdjustment: "0",
                      msrp: "",
                      salePrice: "",
                      shippingSurcharge: "0",
                      weight: "",
                      dimensions: "",
                      notes: "",
                      minOrderQty: "",
                      excludeStripeFabrics: false,
                      isActive: true,
                      gradePrices: [],
                    },
                  ])
                }
              >
                Add variant
              </Button>
            </section>
          )}

          {/* Fabric options */}
          {!isNew && (
            <section className="bg-white border border-slate-200 rounded-md p-6">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
                Fabric options
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Choose which fabrics customers can order this product in. Turn
                on a vendor pool to automatically include every current
                and future fabric from that brand, and/or hand-pick extra
                individual fabrics.
              </p>
              {fabricsList.isLoading || fabricsConfigQuery.isLoading ? (
                <p className="text-sm text-slate-500">Loading fabrics…</p>
              ) : filteredFabricsByMfg.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {form.manufacturerId !== "none"
                    ? "No fabrics found for this manufacturer."
                    : "No fabrics in the catalog yet."}
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredFabricsByMfg.map((group) => {
                    const poolOn = poolManufacturerIds.includes(
                      group.manufacturerId,
                    );
                    const expanded = expandedFabricMfgs.has(
                      group.manufacturerId,
                    );
                    const pickedInGroup = group.fabrics.filter((f) =>
                      pickedFabricIds.includes(f.id),
                    ).length;
                    return (
                      <div
                        key={group.manufacturerId}
                        className="border border-slate-200 rounded-md"
                      >
                        <div className="flex items-center gap-3 px-4 py-3">
                          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                            <input
                              type="checkbox"
                              checked={poolOn}
                              onChange={() =>
                                togglePool(group.manufacturerId)
                              }
                            />
                            Use all {group.manufacturerName} fabrics
                          </label>
                          <span className="text-xs text-slate-500 ml-auto">
                            {poolOn
                              ? `${group.fabrics.filter((f) => f.isActive).length} active in pool`
                              : pickedInGroup > 0
                                ? `${pickedInGroup} picked`
                                : `${group.fabrics.length} available`}
                          </span>
                          <button
                            type="button"
                            className="text-slate-500 hover:text-slate-800"
                            onClick={() =>
                              toggleMfgExpanded(group.manufacturerId)
                            }
                            aria-label={expanded ? "Collapse" : "Expand"}
                          >
                            {expanded ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </button>
                        </div>
                        {expanded && (
                          <div className="px-4 pb-4 border-t border-slate-200 pt-3">
                            {poolOn && (
                              <p className="text-xs text-slate-500 mb-2">
                                Pool is on — every active fabric below is
                                already included automatically. You don't need
                                to pick them individually.
                              </p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-auto">
                              {group.fabrics.map((f) => {
                                const checked = pickedFabricIds.includes(f.id);
                                return (
                                  <label
                                    key={f.id}
                                    className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded ${
                                      poolOn
                                        ? "text-slate-400"
                                        : "text-slate-700 hover:bg-slate-50"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={poolOn || checked}
                                      disabled={poolOn}
                                      onChange={() =>
                                        togglePickedFabric(f.id)
                                      }
                                    />
                                    {f.swatchImageUrl && (
                                      <img
                                        src={f.swatchImageUrl}
                                        alt=""
                                        className="size-6 rounded object-cover border border-slate-200"
                                      />
                                    )}
                                    <span className="font-mono text-xs text-slate-500">
                                      {f.itemNumber}
                                    </span>
                                    <span className="truncate">{f.name}</span>
                                    {!f.isActive && (
                                      <span className="ml-auto text-xs text-amber-700">
                                        inactive
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Finish options */}
          {!isNew && (
            <section className="bg-white border border-slate-200 rounded-md p-6">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
                Finish options
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Choose which frame finishes customers can order this product in.
                Turn on a vendor pool to automatically include every current
                and future finish from that brand, and/or hand-pick extra
                individual finishes.
              </p>
              {finishesList.isLoading || finishesConfigQuery.isLoading ? (
                <p className="text-sm text-slate-500">Loading finishes…</p>
              ) : filteredFinishesByMfg.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {form.manufacturerId !== "none"
                    ? "No finishes found for this manufacturer."
                    : "No finishes in the catalog yet."}
                </p>
              ) : (
                <div className="space-y-3">
                  {filteredFinishesByMfg.map((group) => {
                    const poolOn = finishPoolMfgIds.includes(
                      group.manufacturerId,
                    );
                    const expanded = expandedFinishMfgs.has(
                      group.manufacturerId,
                    );
                    const pickedInGroup = group.finishes.filter((f) =>
                      pickedFinishIds.includes(f.id),
                    ).length;
                    return (
                      <div
                        key={group.manufacturerId}
                        className="border border-slate-200 rounded-md"
                      >
                        <div className="flex items-center gap-3 px-4 py-3">
                          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
                            <input
                              type="checkbox"
                              checked={poolOn}
                              onChange={() =>
                                toggleFinishPool(group.manufacturerId)
                              }
                            />
                            Use all {group.manufacturerName} finishes
                          </label>
                          <span className="text-xs text-slate-500 ml-auto">
                            {poolOn
                              ? `${group.finishes.filter((f) => f.isActive).length} active in pool`
                              : pickedInGroup > 0
                                ? `${pickedInGroup} picked`
                                : `${group.finishes.length} available`}
                          </span>
                          <button
                            type="button"
                            className="text-slate-500 hover:text-slate-800"
                            onClick={() =>
                              toggleFinishMfgExpanded(group.manufacturerId)
                            }
                            aria-label={expanded ? "Collapse" : "Expand"}
                          >
                            {expanded ? (
                              <ChevronDown className="size-4" />
                            ) : (
                              <ChevronRight className="size-4" />
                            )}
                          </button>
                        </div>
                        {expanded && (
                          <div className="px-4 pb-4 border-t border-slate-200 pt-3">
                            {poolOn && (
                              <p className="text-xs text-slate-500 mb-2">
                                Pool is on — every active finish below is
                                already included automatically. You don't need
                                to pick them individually.
                              </p>
                            )}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-auto">
                              {group.finishes.map((f) => {
                                const checked = pickedFinishIds.includes(f.id);
                                return (
                                  <label
                                    key={f.id}
                                    className={`flex items-center gap-2 text-sm px-2 py-1.5 rounded ${
                                      poolOn
                                        ? "text-slate-400"
                                        : "text-slate-700 hover:bg-slate-50"
                                    }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={poolOn || checked}
                                      disabled={poolOn}
                                      onChange={() =>
                                        togglePickedFinish(f.id)
                                      }
                                    />
                                    {f.imageUrl && (
                                      <img
                                        src={f.imageUrl}
                                        alt=""
                                        className="size-6 rounded object-cover border border-slate-200"
                                      />
                                    )}
                                    {f.itemNumber && (
                                      <span className="font-mono text-xs text-slate-500">
                                        {f.itemNumber}
                                      </span>
                                    )}
                                    <span className="truncate">{f.name}</span>
                                    {!f.isActive && (
                                      <span className="ml-auto text-xs text-amber-700">
                                        inactive
                                      </span>
                                    )}
                                    {!poolOn && checked && (
                                      <span
                                        className="ml-auto flex items-center gap-1"
                                        onClick={(e) => e.preventDefault()}
                                      >
                                        <span className="text-xs text-slate-400">
                                          + $
                                        </span>
                                        <input
                                          type="number"
                                          min="0"
                                          step="0.01"
                                          inputMode="decimal"
                                          placeholder="0.00"
                                          value={finishUpcharges[f.id] ?? ""}
                                          onChange={(e) =>
                                            setFinishUpcharges((cur) => ({
                                              ...cur,
                                              [f.id]: e.target.value,
                                            }))
                                          }
                                          className="w-20 rounded border border-slate-300 px-1.5 py-0.5 text-xs text-right"
                                          aria-label={`Frame upcharge for ${f.name}`}
                                          title="Frame MSRP upcharge for this finish"
                                        />
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {/* Attributes (features / options / replacement parts) */}
          {!isNew && (
            <section className="bg-white border border-slate-200 rounded-md p-6">
              <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide mb-2">
                Attributes
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Bullet points shown on the product page. Features describe what
                the product is, options note add-ons or upgrades, and
                replacement parts list service items by part name.
              </p>
              {attributesQuery.isLoading ? (
                <p className="text-sm text-slate-500">Loading attributes…</p>
              ) : (
                (
                  [
                    { type: "feature", label: "Features" },
                    { type: "option", label: "Options" },
                    {
                      type: "replacement_part",
                      label: "Replacement parts",
                    },
                  ] as const
                ).map(({ type, label }) => {
                  const rows = attrs.filter((a) => a.attributeType === type);
                  return (
                    <div key={type} className="mb-6 last:mb-0">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-medium text-slate-700">
                          {label}
                        </h4>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => addAttr(type)}
                        >
                          <Plus className="size-3.5" /> Add
                        </Button>
                      </div>
                      {rows.length === 0 ? (
                        <p className="text-xs text-slate-400 italic">
                          No {label.toLowerCase()} yet.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {rows.map((row, idxInGroup) => (
                            <div
                              key={row.key}
                              className="flex items-start gap-2"
                            >
                              {type === "replacement_part" && (
                                <Input
                                  value={row.partName}
                                  onChange={(e) =>
                                    patchAttr(row.key, {
                                      partName: e.target.value,
                                    })
                                  }
                                  placeholder="Part name"
                                  className="max-w-[200px]"
                                />
                              )}
                              <Input
                                value={row.value}
                                onChange={(e) =>
                                  patchAttr(row.key, { value: e.target.value })
                                }
                                placeholder={
                                  type === "replacement_part"
                                    ? "Part number / SKU"
                                    : type === "feature"
                                      ? "e.g. Powder-coated aluminum frame"
                                      : "e.g. Add umbrella hole (+$50)"
                                }
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => moveAttr(row.key, -1)}
                                disabled={idxInGroup === 0}
                                aria-label="Move up"
                              >
                                <ArrowUp className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => moveAttr(row.key, 1)}
                                disabled={idxInGroup === rows.length - 1}
                                aria-label="Move down"
                              >
                                <ArrowDown className="size-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removeAttr(row.key)}
                                aria-label="Remove"
                              >
                                <Trash2 className="size-4 text-red-600" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
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
              onClick={() => navigate("/admin/products")}
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

        {!isNew && productId != null ? (
          <div className="mt-6">
            <HistoryPanel entityType="product" entityId={productId} />
          </div>
        ) : null}
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

const PRICE_FIELD_LABELS: Record<string, string> = {
  price: "Sell price",
  salePrice: "Sale price",
  cost: "Cost",
  msrp: "MSRP",
  frameOnlyPrice: "Frame only price",
};

function fmtPrice(v: string | null | undefined): string {
  if (v == null) return "—";
  const n = Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : v;
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function PriceHistoryPanel({ productId }: { productId: number }) {
  const [open, setOpen] = useState(false);

  const historyParams = useMemo(
    () => ({ entityType: "product", entityId: productId, notes: "price adjustment", pageSize: 50 }),
    [productId],
  );
  const history = useAdminListHistory(historyParams, {
    query: {
      enabled: open,
      staleTime: 30_000,
      queryKey: ["/api/admin/history", "price-adjustment", productId] as const,
    },
  });

  const rows = history.data?.rows ?? [];

  return (
    <section className="bg-white border border-slate-200 rounded-md p-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-semibold text-slate-700 uppercase tracking-wide w-full text-left"
      >
        {open ? (
          <ChevronDown className="size-4 text-slate-400" />
        ) : (
          <ChevronRight className="size-4 text-slate-400" />
        )}
        <HistoryIcon className="size-4 text-slate-400" />
        Price history
        {rows.length > 0 && (
          <span className="ml-auto text-xs font-normal text-slate-500 normal-case tracking-normal">
            {rows.length} adjustment{rows.length !== 1 ? "s" : ""}
          </span>
        )}
      </button>

      {open && (
        <div className="mt-4">
          {history.isLoading ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-slate-500">
              No bulk price adjustments recorded yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-xs text-slate-500 border-b border-slate-200">
                    <th className="py-2 pr-4 font-medium">Date</th>
                    <th className="py-2 pr-4 font-medium">Changed by</th>
                    <th className="py-2 pr-4 font-medium">Field</th>
                    <th className="py-2 pr-4 font-medium text-right">Before</th>
                    <th className="py-2 pr-4 font-medium text-right">After</th>
                    <th className="py-2 font-medium">Adjustment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.map((row) => {
                    const snap = row.snapshot as {
                      prices?: Record<string, string | null>;
                    } | null;
                    const prev = row.previousSnapshot as {
                      prices?: Record<string, string | null>;
                    } | null;
                    const after = snap?.prices ?? {};
                    const before = prev?.prices ?? {};
                    const fields = Object.keys(after);
                    if (fields.length === 0) return null;
                    return fields.map((field, fi) => (
                      <tr key={`${row.id}-${field}`} className="hover:bg-slate-50">
                        {fi === 0 && (
                          <td
                            className="py-2 pr-4 text-slate-600 align-top"
                            rowSpan={fields.length}
                          >
                            {fmtDate(row.createdAt)}
                          </td>
                        )}
                        {fi === 0 && (
                          <td
                            className="py-2 pr-4 text-slate-600 align-top"
                            rowSpan={fields.length}
                          >
                            {row.changedByEmail ?? (
                              <span className="text-slate-400">System</span>
                            )}
                          </td>
                        )}
                        <td className="py-2 pr-4 text-slate-700">
                          {PRICE_FIELD_LABELS[field] ?? field}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums text-slate-500 line-through">
                          {fmtPrice(before[field])}
                        </td>
                        <td className="py-2 pr-4 text-right tabular-nums font-medium text-slate-900">
                          {fmtPrice(after[field])}
                        </td>
                        {fi === 0 && (
                          <td
                            className="py-2 text-slate-500 text-xs align-top"
                            rowSpan={fields.length}
                          >
                            {(() => {
                              const allBefore = Object.values(before);
                              const allAfter = Object.values(after);
                              if (allBefore[0] && allAfter[0]) {
                                const b = Number(allBefore[0]);
                                const a = Number(allAfter[0]);
                                if (b > 0) {
                                  const pct = ((a - b) / b) * 100;
                                  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% on first field`;
                                }
                              }
                              return null;
                            })()}
                          </td>
                        )}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
