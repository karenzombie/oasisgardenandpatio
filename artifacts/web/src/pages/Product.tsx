import { Link, useRoute } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCatalogProductBySlug,
  useAddCartItem,
  getGetCartQueryKey,
} from "@workspace/api-client-react";
import swvDwvImage from "@assets/SWV_DWV_image_1781037074957.png";
import { getBrandLogo } from "@/lib/brandLogos";
import { sanitizeHtml } from "@/lib/sanitize";
import { WishlistButton } from "@/components/WishlistButton";
import { useToast } from "@/hooks/use-toast";
import { Palette } from "lucide-react";
import { FabricSwatchDialog } from "@/components/FabricSwatchDialog";

function formatMoney(v: string | number | null | undefined): string {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}

const ALL_TABS = [
  { id: "features", label: "Features" },
  { id: "specs", label: "Specifications" },
  { id: "care", label: "Care" },
  { id: "warranty", label: "Warranty" },
] as const;
type TabId = (typeof ALL_TABS)[number]["id"];

// ---- Combined Finish x Wind Vent variant helpers ----
// Treasure Garden market umbrellas encode the wind-vent choice as a SKU suffix
// (`...-SWV` / `...-DWV`) on top of the finish SKU. These helpers split that
// combined variant back into its finish key and vent so the PDP can render two
// independent selectors. The convention is owned by seedTgWindVents.ts.
const VENT_SUFFIX_RE = /-(SWV|DWV)$/i;
// Strips the wind-vent suffix from a variant name in either form: the legacy
// "– Single/Double Wind Vent" dash form, or the current "(SWV)"/"(DWV)" form.
const VENT_NAME_RE =
  /\s*(?:[–—-]\s*(?:Single|Double)\s+Wind\s+Vent|\((?:SWV|DWV)\))\s*$/i;
function ventOf(sku: string): "SWV" | "DWV" | null {
  const m = VENT_SUFFIX_RE.exec(sku);
  return m ? (m[1].toUpperCase() as "SWV" | "DWV") : null;
}
function finishKeyOf(sku: string): string {
  return sku.replace(VENT_SUFFIX_RE, "");
}
function finishLabelOf(name: string): string {
  return name.replace(VENT_NAME_RE, "").trim();
}

export default function Product() {
  const [, params] = useRoute<{ slug: string }>("/shop/:slug");
  const slug = params?.slug ?? "";
  const { data, isLoading, error } = useGetCatalogProductBySlug(slug);
  const [tab, setTab] = useState<TabId>("features");
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [finishId, setFinishId] = useState<number | null>(null);
  const [fabricId, setFabricId] = useState<number | null>(null);
  const [fabricOpen, setFabricOpen] = useState(false);
  // Wind-vent products (Treasure Garden market umbrellas) use combined
  // Finish x Wind Vent variants. The PDP drives the single combined variantId
  // from two independent selections so neither is preselected (the customer
  // must consciously pick the wind vent — Single vs Double).
  const [windFinishKey, setWindFinishKey] = useState<string | null>(null);
  const [windVent, setWindVent] = useState<"SWV" | "DWV" | null>(null);

  const { toast } = useToast();
  const qc = useQueryClient();
  const addToCartM = useAddCartItem({
    mutation: {
      onSuccess: (resp) => {
        qc.setQueryData(getGetCartQueryKey(), resp);
        toast({
          title: "Added to cart",
          description: `${qty} × ${data?.name ?? "item"}`,
        });
      },
      onError: (err: unknown) => {
        const message =
          (err as { response?: { data?: { error?: string } } })?.response?.data
            ?.error ?? "Please try again.";
        toast({ title: "Could not add to cart", description: message });
      },
    },
  });

  const variants = data?.variants ?? [];
  const fabricOptions = data?.fabricOptions ?? [];
  const requiresVariant = variants.length > 0;
  const hasFabrics = fabricOptions.length > 0;
  // frameOnly toggle — only visible when the product has both fabrics and a
  // frame-only price configured. Default: frame + fabric (frameOnly = false).
  const [frameOnly, setFrameOnly] = useState(false);
  const requiresFabric = hasFabrics && !frameOnly;

  // Reset selections when the user navigates between products so a stale
  // variantId/fabricId from a previous PDP can't unlock the gate here.
  useEffect(() => {
    setVariantId(null);
    setFinishId(null);
    setFabricId(null);
    setFrameOnly(false);
    setActiveImageIdx(0);
    setQty(1);
    setWindFinishKey(null);
    setWindVent(null);
  }, [data?.id]);

  // Discrete frame finishes for grade-priced (Frankford) products. Empty for
  // legacy products where variants double as finishes.
  const finishes = useMemo(() => data?.finishes ?? [], [data?.finishes]);

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === variantId) ?? null,
    [variants, variantId],
  );
  const selectedFinish = useMemo(
    () => finishes.find((f) => f.id === finishId) ?? null,
    [finishes, finishId],
  );
  const selectedFabric = useMemo(
    () => fabricOptions.find((f) => f.id === fabricId) ?? null,
    [fabricOptions, fabricId],
  );

  // Grade mode: a product is grade-priced when any of its configurations carry
  // per-fabric-grade prices. In this mode the page runs a 3-step selection
  // (Configuration -> Frame Finish -> Fabric) and the line price is driven by
  // the selected fabric's grade rather than base price + adjustment.
  const isGradeMode = useMemo(
    () => variants.some((v) => (v.gradePrices?.length ?? 0) > 0),
    [variants],
  );

  // Wind-vent mode: the product's variants are combined Finish x Wind Vent rows
  // (SKU suffix -SWV/-DWV). Renders two independent selectors instead of the
  // single variant picker. Galtech umbrellas (single "Vent Type" dimension, no
  // -SWV/-DWV suffix) are NOT in this mode and keep their existing picker.
  const isWindVentMode = useMemo(
    () => !isGradeMode && variants.some((v) => ventOf(v.sku) != null),
    [isGradeMode, variants],
  );

  // Finish-in-variant mode: a grade-priced product whose frame finish lives in
  // the variant SKU/name (no discrete `finishes`), with the finish (and, when
  // present, the wind vent) chosen via the wind-vent-style selectors. This is
  // how Treasure Garden market umbrellas are modeled: each variant is a
  // Finish (× Wind Vent) row whose option label reads "Finish ...". Frankford
  // grade products without discrete finishes use a "Configuration" option label
  // (size/tilt rows, not finishes) and are deliberately excluded.
  const finishVariantMode = useMemo(
    () =>
      isGradeMode &&
      finishes.length === 0 &&
      variants.length > 0 &&
      variants.every((v) => /finish/i.test(v.optionLabel)),
    [isGradeMode, finishes.length, variants],
  );

  // Unique finishes (key + display label) for the wind-vent finish selector,
  // in variant displayOrder. Swatch image is borrowed from the SWV row.
  const windFinishOptions = useMemo(() => {
    if (!isWindVentMode && !finishVariantMode) return [];
    const out: { key: string; label: string; swatchImageUrl: string | null }[] = [];
    const seen = new Set<string>();
    for (const v of variants) {
      const key = finishKeyOf(v.sku);
      if (seen.has(key)) continue;
      seen.add(key);
      // Finish display label = finish name + finish code (the last SKU segment
      // after the base), e.g. "Bronze 00". The code mirrors what prints on POs.
      const code = key.split("-").pop() ?? "";
      const name = finishLabelOf(v.name);
      out.push({
        key,
        label: code && code !== name ? `${name} ${code}` : name,
        swatchImageUrl: v.swatchImageUrl ?? null,
      });
    }
    return out;
  }, [isWindVentMode, finishVariantMode, variants]);

  // Wind-vent options actually present (typically both SWV and DWV).
  const windVentOptions = useMemo<("SWV" | "DWV")[]>(() => {
    if (!isWindVentMode && !finishVariantMode) return [];
    const present = new Set(variants.map((v) => ventOf(v.sku)).filter(Boolean));
    return (["SWV", "DWV"] as const).filter((vent) => present.has(vent));
  }, [isWindVentMode, finishVariantMode, variants]);

  // Whether this product offers a wind-vent choice at all — true only when both
  // SWV and DWV are available (i.e. the customer actually picks between them).
  // Double-vent-only products (windVentOptions = ["DWV"]) correctly return false.
  // Drives the SWV/DWV comparison diagram in the Specifications tab.
  const offersWindVentChoice = useMemo(
    () => windVentOptions.length > 1,
    [windVentOptions],
  );

  // Drive the single combined variantId from the two wind-vent selections.
  useEffect(() => {
    if (!isWindVentMode && !finishVariantMode) return;
    const needsVent = windVentOptions.length > 0;
    if (windFinishKey && (!needsVent || windVent)) {
      const match = variants.find(
        (v) =>
          finishKeyOf(v.sku) === windFinishKey &&
          (!needsVent || ventOf(v.sku) === windVent),
      );
      setVariantId(match?.id ?? null);
    } else {
      setVariantId(null);
    }
  }, [
    isWindVentMode,
    finishVariantMode,
    windFinishKey,
    windVent,
    windVentOptions,
    variants,
  ]);

  // Auto-select the wind vent when only one is offered (the customer still
  // explicitly picks the finish). When no vent applies (e.g. USA45 Shanghai)
  // the vent selector is hidden entirely.
  useEffect(() => {
    if (!isWindVentMode && !finishVariantMode) return;
    if (windVentOptions.length === 1) {
      setWindVent((cur) => cur ?? windVentOptions[0]);
    }
  }, [isWindVentMode, finishVariantMode, windVentOptions]);

  // Map of grade -> {msrp, salePrice} for the currently selected configuration.
  const gradePriceMap = useMemo(() => {
    const m = new Map<string, { msrp: string; salePrice: string }>();
    for (const gp of selectedVariant?.gradePrices ?? []) {
      m.set(gp.grade, { msrp: gp.msrp, salePrice: gp.salePrice });
    }
    return m;
  }, [selectedVariant]);

  const sortedFabricOptions = useMemo(
    () => [...fabricOptions].sort((a, b) => a.name.localeCompare(b.name)),
    [fabricOptions],
  );

  // In grade mode, a fabric is only selectable when the chosen configuration has
  // a price for that fabric's grade, and (when the config excludes stripes) it
  // is not a stripe pattern. Mirrors the server-side cart validation.
  const gradeModeFabrics = useMemo(() => {
    if (!isGradeMode || !selectedVariant) return [];
    return sortedFabricOptions.filter((f) => {
      if (!f.grade || !gradePriceMap.has(f.grade)) return false;
      if (selectedVariant.excludeStripeFabrics && f.isStripe) return false;
      return true;
    });
  }, [isGradeMode, selectedVariant, sortedFabricOptions, gradePriceMap]);

  // For grade-priced products (Treasure Garden / Galtech / Frankford / any
  // future grade product), the available fabrics depend on the chosen
  // configuration, so the fabric list is empty until the customer makes the
  // upstream selection(s). When that's the only reason the list is empty — i.e.
  // the product DOES have fabrics — prompt the customer to choose first instead
  // of implying there are none. A single consistent message is used across all
  // products for clarity.
  const fabricPendingPrompt = useMemo(
    () =>
      isGradeMode && hasFabrics && !selectedVariant
        ? "Choose a configuration first."
        : null,
    [isGradeMode, hasFabrics, selectedVariant],
  );

  // The top blurb (shortDescription) shows the first paragraph of the full
  // description. The "Features" tab shows everything after that first
  // paragraph so the two areas never duplicate the same copy.
  const featuresHtml = useMemo(() => {
    const desc = data?.description;
    if (!desc) return "";
    const normalized = desc.replace(/\r\n/g, "\n").replace(/^\s+/, "");
    const idx = normalized.search(/\n\s*\n/);
    if (idx === -1) {
      // No blank-line separator means the whole description is features content
      // (product has no separate top blurb). Show it all in the Features tab.
      return normalized.trim();
    }
    return normalized.slice(idx).trim();
  }, [data?.description]);

  const visibleTabs = useMemo(
    () =>
      ALL_TABS.filter((t) => (t.id === "features" ? featuresHtml.length > 0 : true)),
    [featuresHtml],
  );
  const activeTab = visibleTabs.some((t) => t.id === tab)
    ? tab
    : (visibleTabs[0]?.id ?? "specs");

  // Auto-select the only finish for single-finish grade-priced products.
  useEffect(() => {
    if (isGradeMode && finishes.length === 1) {
      setFinishId(finishes[0].id);
    }
  }, [isGradeMode, finishes]);

  // Auto-select the only configuration when a product has a single variant
  // (replacement covers, single-vent umbrellas, single-finish bases/frames).
  useEffect(() => {
    // Finish-in-variant / wind-vent products drive variantId from the finish
    // (+ vent) selectors, so never pre-select even with a single variant.
    if (isWindVentMode || finishVariantMode) return;
    if (variants.length === 1) {
      setVariantId((cur) => cur ?? variants[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id, variants.length, isWindVentMode, finishVariantMode]);

  // Clear a now-invalid fabric when the configuration changes (its grade may no
  // longer be priced, or stripes may now be excluded).
  useEffect(() => {
    if (isGradeMode && selectedFabric && selectedVariant) {
      const ok =
        !!selectedFabric.grade &&
        gradePriceMap.has(selectedFabric.grade) &&
        !(selectedVariant.excludeStripeFabrics && selectedFabric.isStripe);
      if (!ok) setFabricId(null);
    }
  }, [isGradeMode, selectedVariant, selectedFabric, gradePriceMap]);

  // Stripe fabrics must be ordered in even pairs (2, 4, 6...). When such a
  // fabric is selected we lock the quantity stepper to even values >= 2.
  const isStripeSelected = selectedFabric?.isStripe === true;

  // Minimum order quantity — applies whenever the selected variant carries one,
  // regardless of whether the product is in grade mode.
  const minOrderQty =
    selectedVariant?.minOrderQty != null && selectedVariant.minOrderQty > 1
      ? selectedVariant.minOrderQty
      : 1;
  // Combined quantity floor: config minimum, raised to an even number when a
  // stripe fabric (sold in pairs) is selected.
  let qtyFloor = Math.max(minOrderQty, isStripeSelected ? 2 : 1);
  if (isStripeSelected && qtyFloor % 2 !== 0) qtyFloor += 1;

  useEffect(() => {
    setQty((q) => {
      let next = q < qtyFloor ? qtyFloor : q;
      if (isStripeSelected && next % 2 !== 0) next += 1;
      return next;
    });
  }, [qtyFloor, isStripeSelected]);

  const frameOnlyPrice = data?.frameOnlyPrice ?? null;
  // Grade-priced products always run the full 3-step flow (fabric is required
  // to derive the line price), so the frame-only shortcut never applies there.
  const offersFrameOnly = !isGradeMode && hasFabrics && frameOnlyPrice != null;

  const missingSelections: string[] = [];
  if (isWindVentMode || finishVariantMode) {
    if (!windFinishKey) missingSelections.push("Frame Finish");
    const ventRequired = windVentOptions.length > 0;
    if (ventRequired && !windVent) missingSelections.push("Wind Vent");
    // Guard against an incomplete Finish x Vent matrix: controls picked but no
    // matching variant. Current seed data is complete, but this keeps a stray
    // add-to-cart from firing without a variantId.
    if (windFinishKey && (!ventRequired || windVent) && !selectedVariant) {
      missingSelections.push("a valid Finish + Wind Vent combination");
    }
  } else if (requiresVariant && !selectedVariant) {
    missingSelections.push(
      variants[0]?.optionLabel ?? (isGradeMode ? "Configuration" : "Variant"),
    );
  }
  if (isGradeMode && finishes.length > 0 && !selectedFinish) {
    missingSelections.push("Frame Finish");
  }
  if (requiresFabric && !selectedFabric) missingSelections.push("Fabric");
  const optionsMissingMsg =
    missingSelections.length > 0
      ? `Please choose ${missingSelections.join(" and ")} first.`
      : "";
  const stripeQtyInvalid = isStripeSelected && (qty < 2 || qty % 2 !== 0);
  const minQtyInvalid = minOrderQty > 1 && qty < minOrderQty;

  function handleAddToCart() {
    if (!data) return;
    if (optionsMissingMsg) {
      toast({ title: "Selection required", description: optionsMissingMsg });
      return;
    }
    if (stripeQtyInvalid) {
      toast({
        title: "Pairs required",
        description:
          "Striped fabrics must be ordered in pairs. Please choose an even quantity of 2 or more.",
      });
      return;
    }
    if (minQtyInvalid) {
      toast({
        title: "Minimum quantity required",
        description: `This configuration has a minimum order quantity of ${minOrderQty}.`,
      });
      return;
    }
    addToCartM.mutate({
      data: {
        productId: data.id,
        quantity: qty,
        ...(selectedVariant ? { variantId: selectedVariant.id } : {}),
        ...(selectedFinish ? { finishId: selectedFinish.id } : {}),
        ...(selectedFabric ? { fabricId: selectedFabric.id } : {}),
      },
    });
  }

  if (isLoading) {
    return <div className="container mx-auto px-4 py-24 text-center text-muted-foreground">Loading…</div>;
  }
  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <h1 className="font-serif text-3xl mb-3">Product not found</h1>
        <p className="text-muted-foreground mb-6">The product you're looking for is no longer available.</p>
        <Link href="/shop" className="text-primary underline">Browse all products</Link>
      </div>
    );
  }

  const galleryImages = data.images.filter((i) => i.imageKind === "gallery");
  const specImages = data.images.filter((i) => i.imageKind === "spec");
  const activeImage = galleryImages[activeImageIdx] ?? galleryImages[0] ?? null;
  const onSale = data.salePrice && data.price && Number(data.salePrice) < Number(data.price);
  const brandLogo = getBrandLogo(data.manufacturerName);

  // When frame-only is selected, effectivePrice uses frameOnlyPrice (no sale
  // price override — frame-only is already a different SKU concept).
  const basePrice = frameOnly && frameOnlyPrice
    ? Number(frameOnlyPrice)
    : Number(
        (data.salePrice && Number(data.salePrice) > 0
          ? data.salePrice
          : data.price) ?? 0,
      );
  const variantAdj = Number(selectedVariant?.priceAdjustment ?? 0);
  // Absolute per-variant pricing (e.g. per-size rugs). When the selected
  // variant carries its own MSRP, it fully overrides the product base price and
  // the variant price adjustment. Legacy variants leave msrp null.
  const variantHasAbsolute =
    selectedVariant?.msrp != null && String(selectedVariant.msrp) !== "";
  const variantMsrp = variantHasAbsolute
    ? Number(selectedVariant!.msrp)
    : null;
  const variantSale =
    variantHasAbsolute &&
    selectedVariant!.salePrice != null &&
    Number(selectedVariant!.salePrice) > 0
      ? Number(selectedVariant!.salePrice)
      : null;
  const variantSurcharge = Number(selectedVariant?.shippingSurcharge ?? 0);
  const effectivePrice = variantHasAbsolute
    ? (variantSale ?? variantMsrp ?? 0)
    : basePrice + variantAdj;
  // Strikethrough display: absolute variants show their own MSRP vs sale;
  // otherwise fall back to the product-level sale logic.
  const showStrikethrough = variantHasAbsolute
    ? variantSale != null && variantMsrp != null && variantMsrp > variantSale
    : Boolean(onSale) && !frameOnly;
  const strikePrice = variantHasAbsolute
    ? (variantMsrp ?? 0)
    : Number(data.price);

  // ---- Grade-mode pricing ----
  // gradeLinePrice/gradeMsrp are set once a fabric is chosen (its grade picks
  // the price row). gradeFromPrice is the lowest line price across all grades
  // for the chosen configuration, used for the "From $X" teaser before a fabric
  // is selected.
  let gradeLinePrice: number | null = null;
  let gradeMsrp: number | null = null;
  let gradeFromPrice: number | null = null;
  if (isGradeMode) {
    if (selectedFabric?.grade) {
      const gp = gradePriceMap.get(selectedFabric.grade);
      if (gp) {
        gradeMsrp = Number(gp.msrp);
        gradeLinePrice =
          Number(gp.salePrice) > 0 ? Number(gp.salePrice) : Number(gp.msrp);
      }
    }
    if (selectedVariant) {
      let minLine = Infinity;
      for (const gp of selectedVariant.gradePrices) {
        const line =
          Number(gp.salePrice) > 0 ? Number(gp.salePrice) : Number(gp.msrp);
        if (line < minLine) minLine = line;
      }
      if (minLine !== Infinity) gradeFromPrice = minLine;
    }
  }
  const gradeOnSale =
    gradeLinePrice != null && gradeMsrp != null && gradeMsrp > gradeLinePrice;

  // Dynamic SKU: combine the configuration SKU with the chosen finish code and
  // fabric item number so each unique selection has a traceable code. For
  // simple (non-grade) variant products like rugs, the variant IS the SKU
  // (e.g. each size has its own -35/-80 SKU), so show that variant's SKU.
  const dynamicSku = finishVariantMode
    ? // Order/PO + display SKU = base + finish only (wind-vent suffix stripped).
      selectedVariant
      ? finishKeyOf(selectedVariant.sku)
      : data.sku
    : isGradeMode
      ? (selectedVariant || selectedFinish || selectedFabric
          ? [
              selectedVariant?.sku,
              selectedFinish?.code,
              selectedFabric?.itemNumber,
            ]
              .filter(Boolean)
              .join("-") || data.sku
          : data.sku)
      : (selectedVariant?.sku ?? data.sku);

  // Effective weight: size-priced products (e.g. rugs) carry a per-variant
  // weight that differs by size, so prefer the selected variant's weight and
  // fall back to the product-level weight.
  const effectiveWeight = selectedVariant?.weight ?? data.weight;

  const variantOptionLabel =
    variants[0]?.optionLabel ?? (isGradeMode ? "Configuration" : "Variant");

  // A product can only be purchased online when ALL of these are true:
  //   1. it isn't flagged as quote-only,
  //   2. it has a real, non-zero price set,
  //   3. it's enabled for online sale (`availableOnline`).
  // The cart endpoint enforces (2) and (3) server-side and will reject the
  // request otherwise, so we mirror those rules here and fall back to the
  // "Contact us" panel + Wishlist button when any rule fails.
  const hasPrice =
    (data.price != null && Number(data.price) > 0) ||
    (data.salePrice != null && Number(data.salePrice) > 0);
  const canBuyOnline =
    !data.quoteOnly && hasPrice && data.availableOnline;
  const showQuoteFallback = !canBuyOnline;
  // Price is only shown to shoppers when (a) the merchant has opted into
  // showing the online price and (b) a price is actually set.
  const showPriceBlock = data.showPriceOnline && hasPrice;

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl">
      {/* Breadcrumb */}
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2 flex-wrap">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span>/</span>
        <Link href="/shop" className="hover:text-foreground">Shop</Link>
        {data.categorySlug && data.categoryName ? (
          <>
            <span>/</span>
            <Link href={`/shop/category/${data.categorySlug}`} className="hover:text-foreground">{data.categoryName}</Link>
          </>
        ) : null}
        <span>/</span>
        <span className="text-foreground line-clamp-1">{data.name}</span>
      </nav>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Gallery */}
        <div>
          <div className="relative aspect-square bg-card overflow-hidden border border-border">
            {activeImage ? (
              <img
                src={activeImage.url}
                alt={activeImage.altText ?? data.name}
                className="absolute inset-0 w-full h-full object-contain p-6 mix-blend-multiply"
              />
            ) : (
              <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground font-serif">No image available</div>
            )}
            {onSale ? (
              <div className="absolute top-4 right-4 bg-primary text-primary-foreground px-3 py-1 text-xs uppercase tracking-widest font-semibold">Sale</div>
            ) : null}
          </div>
          {galleryImages.length > 1 ? (
            <div className="grid grid-cols-5 gap-2 mt-3">
              {galleryImages.map((img, idx) => (
                <button
                  key={img.id}
                  onClick={() => setActiveImageIdx(idx)}
                  className={`aspect-square overflow-hidden border-2 transition-colors ${idx === activeImageIdx ? "border-primary" : "border-transparent hover:border-muted-foreground/40"}`}
                >
                  <img src={img.url} alt="" className="w-full h-full object-cover mix-blend-multiply" />
                </button>
              ))}
            </div>
          ) : null}
          <p className="mt-3 text-xs font-bold italic text-destructive">
            NOTE: Image does not update with your fabric/finish selections.
          </p>
        </div>

        {/* Info */}
        <div>
          {brandLogo ? (
            <img src={brandLogo} alt={data.manufacturerName ?? ""} className="h-10 w-auto object-contain mb-4" />
          ) : data.manufacturerName ? (
            <p className="text-xs uppercase tracking-widest text-muted-foreground mb-2">{data.manufacturerName}</p>
          ) : null}

          <h1 className="font-serif text-3xl md:text-4xl mb-4">{data.name}</h1>

          {!showPriceBlock && !data.quoteOnly && (
            <p className="text-sm text-muted-foreground mb-6">Pricing coming soon — add to your wishlist and we'll be in touch.</p>
          )}

          {showPriceBlock ? (
            isGradeMode ? (
              <div className="mb-6">
                {gradeLinePrice != null ? (
                  gradeOnSale ? (
                    <div className="flex items-baseline gap-3 flex-wrap">
                      <span className="text-muted-foreground">
                        <span className="text-xs uppercase tracking-widest mr-1.5">MSRP</span>
                        <span className="line-through text-lg">{formatMoney(gradeMsrp)}</span>
                      </span>
                      <span className="text-primary font-bold text-3xl md:text-4xl">{formatMoney(gradeLinePrice)}</span>
                    </div>
                  ) : (
                    <span className="text-2xl font-semibold">{formatMoney(gradeLinePrice)}</span>
                  )
                ) : gradeFromPrice != null ? (
                  <span className="text-2xl font-semibold">
                    From {formatMoney(gradeFromPrice)}
                    <span className="text-sm text-muted-foreground ml-2">
                      Select a fabric to see your price.
                    </span>
                  </span>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    Select a configuration to see pricing.
                  </span>
                )}
                {selectedFabric?.grade ? (
                  <span className="text-sm text-muted-foreground mt-1 block">
                    Grade {selectedFabric.grade} fabric
                  </span>
                ) : null}
              </div>
            ) : (
              <div className="mb-6">
                {showStrikethrough ? (
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-muted-foreground">
                      <span className="text-xs uppercase tracking-widest mr-1.5">MSRP</span>
                      <span className="line-through text-lg">{formatMoney(strikePrice)}</span>
                    </span>
                    <span className="text-primary font-bold text-3xl md:text-4xl">{formatMoney(effectivePrice)}</span>
                  </div>
                ) : (
                  <span className="text-2xl font-semibold">{formatMoney(effectivePrice)}</span>
                )}
                {variantAdj !== 0 ? (
                  <span className="text-sm text-muted-foreground mt-1 block">
                    ({variantAdj > 0 ? "+" : ""}
                    {formatMoney(variantAdj)} for {selectedVariant?.name})
                  </span>
                ) : null}
                {variantSurcharge > 0 ? (
                  <span className="text-sm text-muted-foreground mt-1 block">
                    + {formatMoney(variantSurcharge)} oversized delivery surcharge
                    {selectedVariant?.name ? ` (${selectedVariant.name})` : ""}, applied at checkout
                  </span>
                ) : null}
              </div>
            )
          ) : null}

          {data.shortDescription ? (
            <div
              className="prose prose-sm max-w-none mb-6 text-foreground/80"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.shortDescription) }}
            />
          ) : null}

          {data.quoteOnly ? (
            <div className="border border-border bg-muted/40 p-5 mb-2">
              <p className="text-sm font-semibold uppercase tracking-widest text-foreground mb-1">
                Available through a sales agent
              </p>
              <p className="text-sm text-muted-foreground">
                {`${data.manufacturerName ?? "This brand"} is sold exclusively in our showroom. `}
                Save it to your wishlist and a member of our team will follow
                up with pricing, finishes, and lead times — or{" "}
                <Link href="/contact" className="text-primary underline">
                  contact us directly
                </Link>
                .
              </p>
              <div className="mt-4">
                <WishlistButton productId={data.id} variant="button" />
              </div>
            </div>
          ) : !canBuyOnline ? (
            <div className="mb-4">
              <WishlistButton productId={data.id} variant="button" />
            </div>
          ) : (
            <>
              {/* Wind-vent products: two independent selectors (Frame Finish +
                  Wind Vent) mapping to a single combined variant. Neither is
                  preselected — the customer must consciously pick the vent. */}
              {isWindVentMode || finishVariantMode ? (
                <>
                  <div className="mb-5">
                    <p className="text-sm uppercase tracking-widest text-muted-foreground mb-2">
                      Frame Finish
                      <span className="text-destructive ml-1">*</span>
                      {windFinishKey ? (
                        <span className="ml-2 normal-case tracking-normal text-foreground">
                          {windFinishOptions.find((f) => f.key === windFinishKey)?.label}
                        </span>
                      ) : null}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {windFinishOptions.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setWindFinishKey(f.key)}
                          className={`flex items-center gap-2 px-3 py-2 border text-sm transition-colors ${
                            windFinishKey === f.key
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input hover:border-foreground"
                          }`}
                        >
                          {f.swatchImageUrl ? (
                            <img
                              src={f.swatchImageUrl}
                              alt={f.label}
                              className="h-6 w-6 shrink-0 object-cover border border-border/50"
                            />
                          ) : null}
                          {f.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {windVentOptions.length > 0 ? (
                    <div className="mb-5">
                      <p className="text-sm uppercase tracking-widest text-muted-foreground mb-2">
                        Wind Vent
                        <span className="text-destructive ml-1">*</span>
                        {windVent ? (
                          <span className="ml-2 normal-case tracking-normal text-foreground">
                            {windVent === "SWV" ? "Single Wind Vent" : "Double Wind Vent"}
                          </span>
                        ) : null}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {windVentOptions.map((vent) => (
                          <button
                            key={vent}
                            type="button"
                            onClick={() => setWindVent(vent)}
                            className={`px-3 py-2 border text-sm transition-colors ${
                              windVent === vent
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-input hover:border-foreground"
                            }`}
                          >
                            {vent === "SWV" ? "Single Wind Vent" : "Double Wind Vent"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </>
              ) : null}

              {/* Variant selector (Configuration in grade mode, else Frame Finish) */}
              {!isWindVentMode && !finishVariantMode && requiresVariant ? (
                <div className="mb-5">
                  <p className="text-sm uppercase tracking-widest text-muted-foreground mb-2">
                    {variantOptionLabel}
                    <span className="text-destructive ml-1">*</span>
                    {selectedVariant ? (
                      <span className="ml-2 normal-case tracking-normal text-foreground">
                        {selectedVariant.name}
                      </span>
                    ) : null}
                  </p>
                  {(() => {
                    const finishCollections = data?.finishCollections ?? [];
                    const hasCollections = variants.some((v) => v.collection != null);
                    if (!hasCollections) {
                      return (
                        <div className="flex flex-wrap gap-2">
                          {variants.map((v) => (
                            <button
                              key={v.id}
                              type="button"
                              onClick={() => setVariantId(v.id)}
                              className={`px-3 py-2 border text-sm transition-colors ${
                                variantId === v.id
                                  ? "border-primary bg-primary text-primary-foreground"
                                  : "border-input hover:border-foreground"
                              }`}
                            >
                              {v.name}
                            </button>
                          ))}
                        </div>
                      );
                    }
                    // Collect unique collection names in displayOrder order
                    const seen = new Set<string>();
                    const collectionNames: string[] = [];
                    for (const v of variants) {
                      if (v.collection != null && !seen.has(v.collection)) {
                        seen.add(v.collection);
                        collectionNames.push(v.collection);
                      }
                    }
                    collectionNames.sort((a, b) => {
                      const aOrder = finishCollections.find((fc) => fc.collectionName === a)?.displayOrder ?? 999;
                      const bOrder = finishCollections.find((fc) => fc.collectionName === b)?.displayOrder ?? 999;
                      return aOrder - bOrder || a.localeCompare(b);
                    });
                    const uncollected = variants.filter((v) => v.collection == null);
                    return (
                      <div className="space-y-4">
                        {collectionNames.map((colName) => {
                          const meta = finishCollections.find((fc) => fc.collectionName === colName);
                          const items = variants.filter((v) => v.collection === colName);
                          return (
                            <div key={colName}>
                              {meta?.panelImageUrl && (
                                <div className="mb-2">
                                  <img
                                    src={meta.panelImageUrl}
                                    alt={colName}
                                    className="w-full max-h-32 object-cover rounded-sm"
                                  />
                                </div>
                              )}
                              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1.5">
                                {colName}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {items.map((v) => (
                                  <button
                                    key={v.id}
                                    type="button"
                                    onClick={() => setVariantId(v.id)}
                                    className={`px-3 py-2 border text-sm transition-colors ${
                                      variantId === v.id
                                        ? "border-primary bg-primary text-primary-foreground"
                                        : "border-input hover:border-foreground"
                                    }`}
                                  >
                                    {v.name}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        {uncollected.length > 0 && (
                          <div className="flex flex-wrap gap-2">
                            {uncollected.map((v) => (
                              <button
                                key={v.id}
                                type="button"
                                onClick={() => setVariantId(v.id)}
                                className={`px-3 py-2 border text-sm transition-colors ${
                                  variantId === v.id
                                    ? "border-primary bg-primary text-primary-foreground"
                                    : "border-input hover:border-foreground"
                                }`}
                              >
                                {v.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : null}

              {/* Frame Finish selector (grade-priced products only). A single
                  finish renders read-only; multiple finishes render as a
                  swatch picker. */}
              {isGradeMode && finishes.length > 0 ? (
                <div className="mb-5">
                  <p className="text-sm uppercase tracking-widest text-muted-foreground mb-2">
                    Frame Finish
                    <span className="text-destructive ml-1">*</span>
                    {selectedFinish ? (
                      <span className="ml-2 normal-case tracking-normal text-foreground">
                        {selectedFinish.name}
                      </span>
                    ) : null}
                  </p>
                  {finishes.length === 1 ? (
                    <div className="flex items-center gap-3">
                      {finishes[0].swatchImageUrl ? (
                        <img
                          src={finishes[0].swatchImageUrl}
                          alt={finishes[0].name}
                          className="h-12 w-12 shrink-0 object-cover border border-border"
                        />
                      ) : null}
                      <span className="text-sm font-medium">{finishes[0].name}</span>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {finishes.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setFinishId(f.id)}
                          className={`flex items-center gap-2 px-3 py-2 border text-sm transition-colors ${
                            finishId === f.id
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-input hover:border-foreground"
                          }`}
                        >
                          {f.swatchImageUrl ? (
                            <img
                              src={f.swatchImageUrl}
                              alt={f.name}
                              className="h-6 w-6 shrink-0 object-cover border border-border/50"
                            />
                          ) : null}
                          {f.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}

              {/* Configuration note callout (grade-priced products only). */}
              {isGradeMode && selectedVariant?.notes ? (
                <div className="mb-5 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {selectedVariant.notes}
                </div>
              ) : null}

              {/* Frame only / Frame + Fabric toggle */}
              {offersFrameOnly ? (
                <div className="mb-5">
                  <p className="text-sm uppercase tracking-widest text-muted-foreground mb-2">
                    Cushion option
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => { setFrameOnly(false); }}
                      className={`flex-1 px-3 py-2 border text-sm transition-colors ${
                        !frameOnly
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:border-foreground"
                      }`}
                    >
                      Frame + Fabric
                      {data.price ? (
                        <span className="ml-1 opacity-75">({formatMoney(data.price)})</span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setFrameOnly(true); setFabricId(null); }}
                      className={`flex-1 px-3 py-2 border text-sm transition-colors ${
                        frameOnly
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-input hover:border-foreground"
                      }`}
                    >
                      Frame Only
                      {frameOnlyPrice ? (
                        <span className="ml-1 opacity-75">({formatMoney(frameOnlyPrice)})</span>
                      ) : null}
                    </button>
                  </div>
                </div>
              ) : null}

              {/* Fabric selector */}
              {requiresFabric ? (
                <div className="mb-5">
                  <p className="block text-sm uppercase tracking-widest text-muted-foreground mb-2">
                    Fabric
                    <span className="text-destructive ml-1">*</span>
                  </p>
                  <button
                    type="button"
                    onClick={() => setFabricOpen(true)}
                    className="w-full inline-flex items-center justify-between gap-2 border border-input bg-background px-4 py-2.5 text-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary text-left"
                  >
                    <span className={selectedFabric ? "text-foreground truncate" : "text-muted-foreground"}>
                      {selectedFabric
                        ? `${selectedFabric.name} (${selectedFabric.itemNumber})${isGradeMode && selectedFabric.grade ? ` — Grade ${selectedFabric.grade}` : ""}`
                        : "No fabric selected"}
                    </span>
                    <span className="inline-flex items-center gap-2 shrink-0">
                      <Palette className="h-4 w-4" />
                      Browse swatches
                    </span>
                  </button>
                  {fabricPendingPrompt ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      {fabricPendingPrompt}
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground mt-1">
                      Browse the full fabric library on our{" "}
                      <Link href="/fabrics" className="text-primary underline">
                        Fabrics page
                      </Link>
                      .
                    </p>
                  )}
                  <FabricSwatchDialog
                    open={fabricOpen}
                    onOpenChange={setFabricOpen}
                    fabrics={isGradeMode ? gradeModeFabrics : sortedFabricOptions}
                    selectedFabricId={fabricId}
                    onConfirm={(id) => setFabricId(id)}
                    isGradeMode={isGradeMode}
                    linePriceForGrade={(grade) => {
                      if (!grade) return null;
                      const gp = gradePriceMap.get(grade);
                      if (!gp) return null;
                      return Number(gp.salePrice) > 0
                        ? Number(gp.salePrice)
                        : Number(gp.msrp);
                    }}
                    formatPrice={(n) => formatMoney(n)}
                    emptyPrompt={fabricPendingPrompt}
                  />
                </div>
              ) : null}

              {/* Vendor note for the selected fabric (e.g. non-stock lead times) */}
              {selectedFabric?.notes ? (
                <div className="mb-5 border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  {selectedFabric.notes}
                </div>
              ) : null}

              {/* Stripe fabrics must be ordered in even pairs */}
              {isStripeSelected ? (
                <div className="mb-5 border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-foreground">
                  <span className="font-semibold">Striped fabrics are sold in pairs.</span>{" "}
                  This canopy must be ordered in even quantities (2, 4, 6…), so
                  the quantity is set in multiples of two.
                </div>
              ) : null}

              {/* Selection summary: each row is swatch mini-box (left) + label/value
                  (right), stacked vertically so all swatches and descriptions
                  align in consistent columns. */}
              {(selectedFabric && !frameOnly) || selectedVariant || (isGradeMode && selectedFinish) ? (
                <div className="mb-5 flex flex-col gap-3 border border-border bg-muted/30 px-4 py-3">
                  {selectedVariant ? (
                    <div className="flex items-center gap-3">
                      {selectedVariant.swatchImageUrl ? (
                        <img
                          src={selectedVariant.swatchImageUrl}
                          alt={selectedVariant.name}
                          className="h-14 w-14 shrink-0 object-cover border border-border"
                        />
                      ) : (
                        <div className="h-14 w-14 shrink-0" aria-hidden="true" />
                      )}
                      <div className="text-sm">
                        <p className="text-muted-foreground">{variantOptionLabel}</p>
                        <p className="font-medium">{selectedVariant.name}</p>
                      </div>
                    </div>
                  ) : null}
                  {isGradeMode && selectedFinish ? (
                    <div className="flex items-center gap-3">
                      {selectedFinish.swatchImageUrl ? (
                        <img
                          src={selectedFinish.swatchImageUrl}
                          alt={selectedFinish.name}
                          className="h-14 w-14 shrink-0 object-cover border border-border"
                        />
                      ) : (
                        <div className="h-14 w-14 shrink-0" aria-hidden="true" />
                      )}
                      <div className="text-sm">
                        <p className="text-muted-foreground">Frame Finish</p>
                        <p className="font-medium">{selectedFinish.name}</p>
                      </div>
                    </div>
                  ) : null}
                  {selectedFabric && !frameOnly ? (
                    <div className="flex items-center gap-3">
                      {selectedFabric.swatchImageUrl ? (
                        <img
                          src={selectedFabric.swatchImageUrl}
                          alt={selectedFabric.name}
                          className="h-14 w-14 shrink-0 object-cover border border-border"
                        />
                      ) : (
                        <div className="h-14 w-14 shrink-0" aria-hidden="true" />
                      )}
                      <div className="text-sm">
                        <p className="text-muted-foreground">Fabric</p>
                        <p className="font-medium">
                          {selectedFabric.manufacturerName} · {selectedFabric.name} ({selectedFabric.itemNumber})
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="flex flex-col gap-1 self-start">
                  <div className="inline-flex items-center border border-input">
                    <button
                      type="button"
                      className="px-3 py-2.5 hover:bg-muted disabled:opacity-40"
                      onClick={() =>
                        setQty((q) =>
                          Math.max(qtyFloor, q - (isStripeSelected ? 2 : 1)),
                        )
                      }
                      disabled={qty <= qtyFloor}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="px-4 text-sm w-12 text-center">{qty}</span>
                    <button
                      type="button"
                      className="px-3 py-2.5 hover:bg-muted"
                      onClick={() => setQty((q) => q + (isStripeSelected ? 2 : 1))}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                  {minOrderQty > 1 ? (
                    <p className="text-xs text-destructive">
                      Minimum order quantity: {minOrderQty}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={
                    addToCartM.isPending ||
                    !data.availableOnline ||
                    Boolean(optionsMissingMsg) ||
                    stripeQtyInvalid ||
                    minQtyInvalid
                  }
                  title={optionsMissingMsg || undefined}
                  className="flex-1 sm:flex-none bg-primary text-primary-foreground px-8 py-3 text-sm uppercase tracking-widest font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {addToCartM.isPending ? "Adding…" : "Add to Cart"}
                </button>
                <WishlistButton
                  productId={data.id}
                  variant="button"
                  disabled={Boolean(optionsMissingMsg)}
                  disabledReason={optionsMissingMsg}
                />
              </div>
              {optionsMissingMsg ? (
                <p className="text-xs text-destructive mt-2">{optionsMissingMsg}</p>
              ) : (
                <p className="text-xs text-muted-foreground mt-2">
                  Visit our showroom or contact us for white-glove delivery options.
                </p>
              )}
            </>
          )}

          {/* Meta */}
          <dl className="mt-8 pt-6 border-t border-border space-y-2 text-sm">
            <div className="flex gap-2">
              <dt className="text-muted-foreground min-w-[100px]">SKU</dt>
              <dd className="text-foreground">{dynamicSku}</dd>
            </div>
            {data.categoryName ? (
              <div className="flex gap-2">
                <dt className="text-muted-foreground min-w-[100px]">Category</dt>
                <dd>
                  {data.categorySlug ? (
                    <Link href={`/shop/category/${data.categorySlug}`} className="text-primary hover:underline">{data.categoryName}</Link>
                  ) : (
                    data.categoryName
                  )}
                </dd>
              </div>
            ) : null}
            {data.manufacturerName ? (
              <div className="flex gap-2">
                <dt className="text-muted-foreground min-w-[100px]">Manufacturer</dt>
                <dd className="text-foreground">{data.manufacturerName}</dd>
              </div>
            ) : null}
            {data.tags.length > 0 ? (
              <div className="flex gap-2">
                <dt className="text-muted-foreground min-w-[100px]">Tags</dt>
                <dd className="flex flex-wrap gap-1">
                  {data.tags.map((t) => (
                    <span key={t} className="text-xs uppercase tracking-wide bg-muted px-2 py-0.5 rounded-sm">{t}</span>
                  ))}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>
      </div>

      {/* Tabbed content */}
      <div className="mt-16 border-t border-border">
        <div className="flex border-b border-border overflow-x-auto">
          {visibleTabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-6 py-4 text-sm uppercase tracking-widest font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="py-8 max-w-3xl">
          {activeTab === "features" ? (
            <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(featuresHtml) }} />
          ) : null}
          {activeTab === "specs" ? (
            <div>
              {data.specs && Object.keys(data.specs).length > 0 ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-sm">
                  {Object.entries(data.specs).map(([k, v]) => (
                    <div key={k} className="flex gap-2 border-b border-border py-2">
                      <dt className="text-muted-foreground min-w-[140px] capitalize">{k.replace(/_/g, " ")}</dt>
                      <dd className="text-foreground">{String(v)}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {data.dimensions ? (
                <p className="text-sm mt-4"><span className="text-muted-foreground mr-2">Dimensions:</span>{data.dimensions}</p>
              ) : null}
              {effectiveWeight ? (
                <p className="text-sm mt-1"><span className="text-muted-foreground mr-2">Weight:</span>{effectiveWeight} lbs</p>
              ) : null}
              {specImages.length > 0 ? (
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {specImages.map((img) => (
                    <img key={img.id} src={img.url} alt={img.altText ?? "Specification drawing"} className="w-full border border-border" />
                  ))}
                </div>
              ) : null}
              {offersWindVentChoice ? (
                <div className="mt-6">
                  <p className="text-sm uppercase tracking-widest text-muted-foreground mb-2">
                    Single vs Double Wind Vent
                  </p>
                  <img
                    src={swvDwvImage}
                    alt="Single wind vent versus double wind vent comparison"
                    className="w-full max-w-md border border-border"
                  />
                </div>
              ) : null}
              {!data.specs && !data.dimensions && !data.weight && specImages.length === 0 && !offersWindVentChoice ? (
                <p className="text-muted-foreground">No specifications available.</p>
              ) : null}
            </div>
          ) : null}
          {activeTab === "care" ? (
            <div className="prose max-w-none text-foreground/80">
              <p>For everyday care of your outdoor furniture:</p>
              <ul>
                <li>Brush off loose dirt regularly.</li>
                <li>Wash with mild soap and water; rinse thoroughly.</li>
                <li>Allow to air dry before covering or storing.</li>
                <li>Store cushions indoors during prolonged wet or freezing weather.</li>
              </ul>
              <p>For specific manufacturer guidance, see the warranty tab or contact our showroom.</p>
            </div>
          ) : null}
          {activeTab === "warranty" ? (
            <div className="prose max-w-none text-foreground/80">
              <p>This product is covered by the manufacturer's warranty. Coverage terms vary by brand and component.</p>
              <p>
                For full warranty details please <a href="/warranty.pdf" target="_blank" rel="noopener noreferrer" className="text-primary underline">visit our warranty page</a> or contact our showroom.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
