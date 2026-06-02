import { Link, useRoute } from "wouter";
import { useEffect, useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCatalogProductBySlug,
  useAddCartItem,
  getGetCartQueryKey,
} from "@workspace/api-client-react";
import { getBrandLogo } from "@/lib/brandLogos";
import { sanitizeHtml } from "@/lib/sanitize";
import { WishlistButton } from "@/components/WishlistButton";
import { useToast } from "@/hooks/use-toast";

function formatMoney(v: string | number | null | undefined): string {
  if (v == null || v === "") return "";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}

const TABS = [
  { id: "description", label: "Description" },
  { id: "specs", label: "Specifications" },
  { id: "care", label: "Care" },
  { id: "warranty", label: "Warranty" },
] as const;
type TabId = (typeof TABS)[number]["id"];

export default function Product() {
  const [, params] = useRoute<{ slug: string }>("/shop/:slug");
  const slug = params?.slug ?? "";
  const { data, isLoading, error } = useGetCatalogProductBySlug(slug);
  const [tab, setTab] = useState<TabId>("description");
  const [activeImageIdx, setActiveImageIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState<number | null>(null);
  const [fabricId, setFabricId] = useState<number | null>(null);

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
    setFabricId(null);
    setFrameOnly(false);
    setActiveImageIdx(0);
    setQty(1);
  }, [data?.id]);

  const selectedVariant = useMemo(
    () => variants.find((v) => v.id === variantId) ?? null,
    [variants, variantId],
  );
  const selectedFabric = useMemo(
    () => fabricOptions.find((f) => f.id === fabricId) ?? null,
    [fabricOptions, fabricId],
  );
  // Stripe fabrics must be ordered in even pairs (2, 4, 6...). When such a
  // fabric is selected we lock the quantity stepper to even values >= 2.
  const isStripeSelected = selectedFabric?.isStripe === true;

  useEffect(() => {
    if (isStripeSelected) {
      setQty((q) => (q < 2 ? 2 : q % 2 !== 0 ? q + 1 : q));
    }
  }, [isStripeSelected]);

  const frameOnlyPrice = data?.frameOnlyPrice ?? null;
  const offersFrameOnly = hasFabrics && frameOnlyPrice != null;

  const missingSelections: string[] = [];
  if (requiresVariant && !selectedVariant) {
    missingSelections.push(variants[0]?.optionLabel ?? "Variant");
  }
  if (requiresFabric && !selectedFabric) missingSelections.push("Fabric");
  const optionsMissingMsg =
    missingSelections.length > 0
      ? `Please choose ${missingSelections.join(" and ")} first.`
      : "";
  const stripeQtyInvalid = isStripeSelected && (qty < 2 || qty % 2 !== 0);

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
    addToCartM.mutate({
      data: {
        productId: data.id,
        quantity: qty,
        ...(selectedVariant ? { variantId: selectedVariant.id } : {}),
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
  const effectivePrice = basePrice + variantAdj;

  const variantOptionLabel = variants[0]?.optionLabel ?? "Variant";

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
              <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground font-serif">No image</div>
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
            <div className="mb-6">
              {onSale && !frameOnly ? (
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-muted-foreground">
                    <span className="text-xs uppercase tracking-widest mr-1.5">MSRP</span>
                    <span className="line-through text-lg">{formatMoney(data.price)}</span>
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
            </div>
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
              {/* Variant selector (e.g. Frame Finish) */}
              {requiresVariant ? (
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
                  <label
                    htmlFor="fabric-select"
                    className="block text-sm uppercase tracking-widest text-muted-foreground mb-2"
                  >
                    Fabric
                    <span className="text-destructive ml-1">*</span>
                    {selectedFabric ? (
                      <span className="ml-2 normal-case tracking-normal text-foreground">
                        {selectedFabric.name} ({selectedFabric.itemNumber})
                      </span>
                    ) : null}
                  </label>
                  <select
                    id="fabric-select"
                    value={fabricId ?? ""}
                    onChange={(e) =>
                      setFabricId(e.target.value ? Number(e.target.value) : null)
                    }
                    className="w-full border border-input bg-background px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="">— Select a fabric —</option>
                    {fabricOptions.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.manufacturerName} · {f.name} ({f.itemNumber})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground mt-1">
                    Browse the full fabric library on our{" "}
                    <Link href="/fabrics" className="text-primary underline">
                      Fabrics page
                    </Link>
                    .
                  </p>
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

              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="inline-flex items-center border border-input self-start">
                  <button
                    type="button"
                    className="px-3 py-2.5 hover:bg-muted disabled:opacity-40"
                    onClick={() =>
                      setQty((q) =>
                        Math.max(
                          isStripeSelected ? 2 : 1,
                          q - (isStripeSelected ? 2 : 1),
                        ),
                      )
                    }
                    disabled={qty <= (isStripeSelected ? 2 : 1)}
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
                <button
                  type="button"
                  onClick={handleAddToCart}
                  disabled={
                    addToCartM.isPending ||
                    !data.availableOnline ||
                    Boolean(optionsMissingMsg) ||
                    stripeQtyInvalid
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
              <dd className="text-foreground">{data.sku}</dd>
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
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-6 py-4 text-sm uppercase tracking-widest font-medium border-b-2 transition-colors whitespace-nowrap ${tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="py-8 max-w-3xl">
          {tab === "description" ? (
            data.description ? (
              <div className="prose max-w-none" dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.description) }} />
            ) : (
              <p className="text-muted-foreground">No description available.</p>
            )
          ) : null}
          {tab === "specs" ? (
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
              {data.weight ? (
                <p className="text-sm mt-1"><span className="text-muted-foreground mr-2">Weight:</span>{data.weight} lbs</p>
              ) : null}
              {specImages.length > 0 ? (
                <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {specImages.map((img) => (
                    <img key={img.id} src={img.url} alt={img.altText ?? "Specification drawing"} className="w-full border border-border" />
                  ))}
                </div>
              ) : null}
              {!data.specs && !data.dimensions && !data.weight && specImages.length === 0 ? (
                <p className="text-muted-foreground">No specifications available.</p>
              ) : null}
            </div>
          ) : null}
          {tab === "care" ? (
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
          {tab === "warranty" ? (
            <div className="prose max-w-none text-foreground/80">
              <p>This product is covered by the manufacturer's warranty. Coverage terms vary by brand and component.</p>
              <p>
                For full warranty details please <Link href="/warranty" className="text-primary underline">visit our warranty page</Link> or contact our showroom.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
