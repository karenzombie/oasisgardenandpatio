import { Link, useLocation, useSearch, useRoute } from "wouter";
import { useMemo } from "react";
import { useListCatalogProducts } from "@workspace/api-client-react";
import type { ListCatalogProductsParams } from "@workspace/api-client-react";
import { getBrandLogo } from "@/lib/brandLogos";
import { WishlistButton } from "@/components/WishlistButton";

const SORTS = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "name_asc", label: "Name: A–Z" },
] as const;

function formatMoney(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}

export default function Shop() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [, params] = useRoute<{ slug: string }>("/shop/category/:slug");

  const queryParams = useMemo(() => {
    const q = new URLSearchParams(search);
    const out: ListCatalogProductsParams = {
      page: Number(q.get("page") ?? "1") || 1,
      pageSize: 12,
      sort:
        (q.get("sort") as ListCatalogProductsParams["sort"]) ?? "featured",
    };
    const qq = q.get("q");
    if (qq) out.q = qq;
    const manufacturer = q.get("manufacturer");
    if (manufacturer) out.manufacturerSlug = manufacturer;
    const material = q.get("material");
    if (material) out.materialSlug = material;
    if (params?.slug) out.categorySlug = params.slug;
    return out;
  }, [search, params?.slug]);

  const { data, isLoading } = useListCatalogProducts(queryParams);

  const total = data?.total ?? 0;
  const pageSize = queryParams.pageSize ?? 12;
  const page = queryParams.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(total, page * pageSize);

  function updateSearch(patch: Record<string, string | null>) {
    const q = new URLSearchParams(search);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") q.delete(k);
      else q.set(k, v);
    }
    const qs = q.toString();
    const base = params?.slug ? `/shop/category/${params.slug}` : "/shop";
    setLocation(qs ? `${base}?${qs}` : base);
  }

  const heading = params?.slug
    ? (data?.products[0]?.categoryName ?? params.slug.replace(/-/g, " "))
    : "Shop";

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl">
      {/* Breadcrumb */}
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span>/</span>
        {params?.slug ? (
          <>
            <Link href="/shop" className="hover:text-foreground">Shop</Link>
            <span>/</span>
            <span className="text-foreground capitalize">{heading}</span>
          </>
        ) : (
          <span className="text-foreground">Shop</span>
        )}
      </nav>

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <h1 className="font-serif text-4xl md:text-5xl capitalize">{heading}</h1>
        <div className="flex items-center gap-4 text-sm">
          <label className="flex items-center gap-2 text-muted-foreground">
            Sort
            <select
              value={queryParams.sort}
              onChange={(e) => updateSearch({ sort: e.target.value, page: "1" })}
              className="border border-input bg-background rounded-sm px-3 py-1.5 text-sm"
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </label>
          <span className="text-muted-foreground">
            {total === 0
              ? "No results"
              : `Showing ${startIdx}–${endIdx} of ${total}`}
          </span>
        </div>
      </div>

      {isLoading ? (
        <div className="py-24 text-center text-muted-foreground">Loading…</div>
      ) : !data || data.products.length === 0 ? (
        <div className="py-24 text-center">
          <h3 className="font-serif text-2xl mb-3">No products found</h3>
          <p className="text-muted-foreground">Check back soon as we add new collections.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {data.products.map((p) => {
            const onSale = p.salePrice && p.price && Number(p.salePrice) < Number(p.price);
            const brandLogo = getBrandLogo(p.manufacturerName);
            return (
              <Link key={p.id} href={`/shop/${p.slug}`} className="group block">
                <div className="relative aspect-square bg-card overflow-hidden mb-4 border border-border">
                  {p.primaryImageUrl ? (
                    <img
                      src={p.primaryImageUrl}
                      alt={p.name}
                      className="absolute inset-0 w-full h-full object-contain p-6 mix-blend-multiply"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground font-serif">Oasis</div>
                  )}
                  {brandLogo ? (
                    <div className="absolute top-3 left-3 bg-white/95 px-2 py-1 rounded-sm shadow-sm" aria-hidden="true">
                      <img src={brandLogo} alt="" className="h-5 w-auto object-contain" />
                    </div>
                  ) : null}
                  {onSale ? (
                    <div className="absolute top-3 right-3 bg-primary text-primary-foreground px-3 py-1 text-xs uppercase tracking-widest font-semibold">
                      Sale
                    </div>
                  ) : null}
                  <div className="absolute bottom-3 right-3 z-10">
                    <WishlistButton productId={p.id} />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent pt-10 pb-3 px-4">
                    <h3 className="font-serif text-base md:text-lg text-white drop-shadow line-clamp-2 pr-12">
                      {p.name}
                    </h3>
                  </div>
                </div>
                <div className="space-y-1 text-center">
                  {!brandLogo && p.manufacturerName ? (
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">{p.manufacturerName}</p>
                  ) : null}
                  {p.showPriceOnline && p.price ? (
                    onSale ? (
                      <p className="text-sm">
                        <span className="text-muted-foreground line-through mr-2">{formatMoney(p.price)}</span>
                        <span className="text-primary font-semibold">{formatMoney(p.salePrice)}</span>
                      </p>
                    ) : (
                      <p className="text-sm">{formatMoney(p.price)}</p>
                    )
                  ) : null}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <nav className="mt-12 flex items-center justify-center gap-2">
          <button
            disabled={page <= 1}
            onClick={() => updateSearch({ page: String(page - 1) })}
            className="px-3 py-1.5 text-sm border border-input rounded-sm disabled:opacity-40"
          >
            Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => updateSearch({ page: String(n) })}
              className={`px-3 py-1.5 text-sm border rounded-sm ${n === page ? "bg-primary text-primary-foreground border-primary" : "border-input hover:bg-muted"}`}
            >
              {n}
            </button>
          ))}
          <button
            disabled={page >= totalPages}
            onClick={() => updateSearch({ page: String(page + 1) })}
            className="px-3 py-1.5 text-sm border border-input rounded-sm disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      ) : null}
    </div>
  );
}
