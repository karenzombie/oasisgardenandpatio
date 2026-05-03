import { Link, useLocation, useRoute } from "wouter";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCatalogProductBySlug,
  useAddCartItem,
  getGetCartQueryKey,
} from "@workspace/api-client-react";
import { getBrandLogo } from "@/lib/brandLogos";
import { sanitizeHtml } from "@/lib/sanitize";
import { WishlistButton } from "@/components/WishlistButton";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

function formatMoney(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = Number(v);
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

  const { isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();
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
      onError: () => {
        toast({
          title: "Could not add to cart",
          description: "Please try again.",
        });
      },
    },
  });

  function handleAddToCart() {
    if (!isAuthenticated) {
      toast({
        title: "Sign in required",
        description: "Create an account or sign in to add items to your cart.",
      });
      navigate(`/login?next=${encodeURIComponent(location)}`);
      return;
    }
    if (!data) return;
    addToCartM.mutate({ data: { productId: data.id, quantity: qty } });
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

          {data.showPriceOnline && data.price ? (
            <div className="text-2xl mb-6">
              {onSale ? (
                <>
                  <span className="text-muted-foreground line-through mr-3">{formatMoney(data.price)}</span>
                  <span className="text-primary font-semibold">{formatMoney(data.salePrice)}</span>
                </>
              ) : (
                <span>{formatMoney(data.price)}</span>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground mb-6">Contact us for pricing.</p>
          )}

          {data.shortDescription ? (
            <div
              className="prose prose-sm max-w-none mb-6 text-foreground/80"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(data.shortDescription) }}
            />
          ) : null}

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <div className="inline-flex items-center border border-input self-start">
              <button
                type="button"
                className="px-3 py-2.5 hover:bg-muted disabled:opacity-40"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="px-4 text-sm w-12 text-center">{qty}</span>
              <button
                type="button"
                className="px-3 py-2.5 hover:bg-muted"
                onClick={() => setQty((q) => q + 1)}
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            <button
              type="button"
              onClick={handleAddToCart}
              disabled={addToCartM.isPending || !data.availableOnline}
              className="flex-1 sm:flex-none bg-primary text-primary-foreground px-8 py-3 text-sm uppercase tracking-widest font-medium hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {addToCartM.isPending ? "Adding…" : "Add to Cart"}
            </button>
            <WishlistButton productId={data.id} variant="button" />
          </div>
          <p className="text-xs text-muted-foreground mt-2">Visit our showroom or contact us for white-glove delivery options.</p>

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
