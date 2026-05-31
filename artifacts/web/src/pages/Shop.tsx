import { Link, useLocation, useSearch, useRoute } from "wouter";
import { useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import {
  useListCatalogProducts,
  useListCategories,
  useListCatalogFinishes,
  useListManufacturers,
} from "@workspace/api-client-react";
import type { ListCatalogProductsParams } from "@workspace/api-client-react";
import { getBrandLogo } from "@/lib/brandLogos";
import { WishlistButton } from "@/components/WishlistButton";
import { Button } from "@/components/ui/button";

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
  const [filtersOpen, setFiltersOpen] = useState(false);

  const q = useMemo(() => new URLSearchParams(search), [search]);

  const isOnlineOnly = q.get("online") === "true";

  const queryParams = useMemo(() => {
    const out: ListCatalogProductsParams = {
      page: Number(q.get("page") ?? "1") || 1,
      pageSize: 12,
      sort: (q.get("sort") as ListCatalogProductsParams["sort"]) ?? "featured",
    };
    const name = q.get("q");
    if (name) out.q = name;
    const manufacturer = q.get("manufacturer");
    if (manufacturer) out.manufacturerSlug = manufacturer;
    const material = q.get("material");
    if (material) out.materialSlug = material;
    const finish = q.get("finish");
    if (finish) out.finish = finish;
    const categoryParam = q.get("category");
    if (params?.slug) out.categorySlug = params.slug;
    else if (categoryParam) out.categorySlug = categoryParam;
    if (isOnlineOnly) out.onlineOnly = true;
    return out;
  }, [search, params?.slug, isOnlineOnly]);

  const { data, isLoading } = useListCatalogProducts(queryParams);
  const { data: categories } = useListCategories();
  const { data: finishes } = useListCatalogFinishes();
  const { data: manufacturers } = useListManufacturers();

  const total = data?.total ?? 0;
  const pageSize = queryParams.pageSize ?? 12;
  const page = queryParams.page ?? 1;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(total, page * pageSize);

  function updateSearch(patch: Record<string, string | null>) {
    const next = new URLSearchParams(search);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    const base = params?.slug ? `/shop/category/${params.slug}` : "/shop";
    setLocation(qs ? `${base}?${qs}` : base);
  }

  const activeCategory = params?.slug ?? q.get("category") ?? "";
  const activeManufacturer = q.get("manufacturer") ?? "";
  const activeFinish = q.get("finish") ?? "";
  const activeName = q.get("q") ?? "";
  const activeFilterCount =
    (activeCategory ? 1 : 0) +
    (activeManufacturer ? 1 : 0) +
    (activeFinish ? 1 : 0) +
    (activeName ? 1 : 0);

  function clearAll() {
    const base = params?.slug ? `/shop/category/${params.slug}` : "/shop";
    setLocation(isOnlineOnly ? `${base}?online=true` : base);
  }

  const heading = isOnlineOnly && !params?.slug
    ? "Shop Online"
    : params?.slug
      ? (data?.products[0]?.categoryName ?? params.slug.replace(/-/g, " "))
      : "Shop";

  const selectClass =
    "w-full border border-input bg-background rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary";

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
          <span className="text-foreground">{heading}</span>
        )}
      </nav>

      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
        <div>
          <h1 className="font-serif text-4xl md:text-5xl capitalize">{heading}</h1>
          {isOnlineOnly && (
            <p className="text-sm text-muted-foreground mt-2">
              Browse products available for online purchase — no showroom visit required.
            </p>
          )}
        </div>
        <div className="flex items-center gap-4 text-sm flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="flex items-center gap-2"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            <SlidersHorizontal className="h-4 w-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className="ml-0.5 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                {activeFilterCount}
              </span>
            )}
          </Button>
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

      {/* Filter panel */}
      {filtersOpen && (
        <div className="mb-8 border border-border rounded-sm bg-card p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-medium text-sm uppercase tracking-widest">Filter products</h2>
            {activeFilterCount > 0 && (
              <button
                onClick={clearAll}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {/* Name search */}
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-muted-foreground block">
                Name / SKU
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search by name or SKU…"
                  value={activeName}
                  onChange={(e) =>
                    updateSearch({ q: e.target.value || null, page: "1" })
                  }
                  className={selectClass}
                />
                {activeName && (
                  <button
                    onClick={() => updateSearch({ q: null, page: "1" })}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Manufacturer */}
            <div className="space-y-1.5">
              <label className="text-xs uppercase tracking-widest text-muted-foreground block">
                Brand
              </label>
              <select
                value={activeManufacturer}
                onChange={(e) =>
                  updateSearch({ manufacturer: e.target.value || null, page: "1" })
                }
                className={selectClass}
              >
                <option value="">All brands</option>
                {manufacturers?.map((m) => (
                  <option key={m.id} value={m.slug}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Category */}
            {!params?.slug && (
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-widest text-muted-foreground block">
                  Category
                </label>
                <select
                  value={activeCategory}
                  onChange={(e) =>
                    updateSearch({ category: e.target.value || null, page: "1" })
                  }
                  className={selectClass}
                >
                  <option value="">All categories</option>
                  {categories?.map((c) => (
                    <option key={c.id} value={c.slug}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Finish */}
            {finishes && finishes.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-widest text-muted-foreground block">
                  Frame finish
                </label>
                <select
                  value={activeFinish}
                  onChange={(e) =>
                    updateSearch({ finish: e.target.value || null, page: "1" })
                  }
                  className={selectClass}
                >
                  <option value="">All finishes</option>
                  {finishes.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-2 mt-5 pt-4 border-t border-border">
              {activeName && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
                  Name: "{activeName}"
                  <button onClick={() => updateSearch({ q: null, page: "1" })}>
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeManufacturer && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
                  Brand:{" "}
                  {manufacturers?.find((m) => m.slug === activeManufacturer)?.name ??
                    activeManufacturer}
                  <button
                    onClick={() => updateSearch({ manufacturer: null, page: "1" })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeCategory && !params?.slug && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full capitalize">
                  Category:{" "}
                  {categories?.find((c) => c.slug === activeCategory)?.name ??
                    activeCategory}
                  <button
                    onClick={() => updateSearch({ category: null, page: "1" })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeFinish && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
                  Finish: {activeFinish}
                  <button
                    onClick={() => updateSearch({ finish: null, page: "1" })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {isLoading ? (
        <div className="py-24 text-center text-muted-foreground">Loading…</div>
      ) : !data || data.products.length === 0 ? (
        <div className="py-24 text-center">
          <h3 className="font-serif text-2xl mb-3">No products found</h3>
          <p className="text-muted-foreground mb-4">
            {activeFilterCount > 0
              ? "Try adjusting or clearing your filters."
              : "Check back soon as we add new collections."}
          </p>
          {activeFilterCount > 0 && (
            <Button variant="outline" onClick={clearAll}>
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {data.products.map((p) => {
            const onSale =
              p.salePrice && p.price && Number(p.salePrice) < Number(p.price);
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
                    <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground font-serif">
                      Oasis
                    </div>
                  )}
                  {brandLogo ? (
                    <div
                      className="absolute top-3 left-3 bg-white/95 px-2 py-1 rounded-sm shadow-sm"
                      aria-hidden="true"
                    >
                      <img
                        src={brandLogo}
                        alt=""
                        className="h-5 w-auto object-contain"
                      />
                    </div>
                  ) : null}
                  {onSale ? (
                    <div className="absolute top-3 right-3 bg-primary text-primary-foreground px-3 py-1 text-xs uppercase tracking-widest font-semibold">
                      Sale
                    </div>
                  ) : p.quoteOnly ? (
                    <div className="absolute top-3 right-3 bg-foreground text-background px-3 py-1 text-xs uppercase tracking-widest font-semibold">
                      Call for Pricing
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
                    <p className="text-xs uppercase tracking-widest text-muted-foreground">
                      {p.manufacturerName}
                    </p>
                  ) : null}
                  {p.showPriceOnline && p.price ? (
                    onSale ? (
                      <p className="text-sm">
                        <span className="text-muted-foreground line-through mr-2">
                          {formatMoney(p.price)}
                        </span>
                        <span className="text-primary font-semibold">
                          {formatMoney(p.salePrice)}
                        </span>
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
