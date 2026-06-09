import { Link, useRoute, useLocation, useSearch } from "wouter";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { X, SlidersHorizontal } from "lucide-react";
import {
  useListCatalogProducts,
  useListManufacturers,
  useListCategories,
  listCatalogProducts,
  getListCatalogProductsQueryKey,
} from "@workspace/api-client-react";
import type { CatalogProduct, Category } from "@workspace/api-client-react";
import { getBrandLogo } from "@/lib/brandLogos";
import { getCategoryImage } from "@/lib/categoryImages";
import { WishlistButton } from "@/components/WishlistButton";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const PAGE_SIZE_API = 60;
const PAGE_SIZE_DISPLAY = 24;

/**
 * Collection = the product name's FIRST WORD, but only when at least 2 products
 * in this manufacturer share that first word. Products whose first word is
 * unique get no collection.
 */
function buildCollectionMap(names: string[]): Map<string, string> {
  const firstWordCount = new Map<string, number>();
  for (const name of names) {
    const first = name.trim().split(/\s+/)[0];
    if (first) firstWordCount.set(first, (firstWordCount.get(first) ?? 0) + 1);
  }

  const result = new Map<string, string>();
  for (const name of names) {
    const first = name.trim().split(/\s+/)[0] ?? "";
    result.set(name, (firstWordCount.get(first) ?? 0) >= 2 ? first : "");
  }
  return result;
}

function formatMoney(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}

export default function ManufacturerProducts() {
  const [, params] = useRoute<{ slug: string }>("/manufacturers/:slug");
  const slug = params?.slug ?? "";

  const [, setLocation] = useLocation();
  const search = useSearch();
  const q = useMemo(() => new URLSearchParams(search), [search]);

  const activeCollection = q.get("collection") ?? "";
  const activeType = q.get("type") ?? "";
  const displayPage = Number(q.get("page") ?? "1") || 1;

  const { data: manufacturers } = useListManufacturers();
  const manufacturer = manufacturers?.find((m) => m.slug === slug);

  const { data: categories } = useListCategories();
  const categoryBySlug = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories ?? []) m.set(c.slug, c);
    return m;
  }, [categories]);

  // Page 1 determines how many total pages exist for this manufacturer.
  const {
    data: page1Data,
    isLoading: loading1,
    error: page1Error,
  } = useListCatalogProducts({
    manufacturerSlug: slug,
    sort: "name_asc",
    page: 1,
    pageSize: PAGE_SIZE_API,
  });

  const total = page1Data?.total ?? 0;
  const pageCount = Math.ceil(total / PAGE_SIZE_API);

  // Fetch every remaining page (2..N) so collection/type filters are built from
  // the manufacturer's full catalog, not just the first page.
  const restPages = useMemo(
    () => (pageCount > 1 ? Array.from({ length: pageCount - 1 }, (_, i) => i + 2) : []),
    [pageCount],
  );

  const restQueries = useQueries({
    queries: restPages.map((page) => {
      const p = {
        manufacturerSlug: slug,
        sort: "name_asc" as const,
        page,
        pageSize: PAGE_SIZE_API,
      };
      return {
        queryKey: getListCatalogProductsQueryKey(p),
        queryFn: () => listCatalogProducts(p),
        enabled: slug.length > 0 && total > 0,
      };
    }),
  });

  const restLoading = restQueries.some((r) => r.isLoading && r.fetchStatus !== "idle");
  const isLoading = loading1 || restLoading;
  // If any catalog page fails, the manufacturer's collections/types would be
  // built from a partial catalog. Surface that as a hard error instead of
  // silently rendering incomplete filters.
  const loadError = page1Error != null || restQueries.some((r) => r.isError);

  const allProducts = useMemo<CatalogProduct[]>(() => {
    return [
      ...(page1Data?.products ?? []),
      ...restQueries.flatMap((r) => r.data?.products ?? []),
    ];
  }, [page1Data, restQueries]);

  const collectionMap = useMemo(
    () => buildCollectionMap(allProducts.map((p) => p.name)),
    [allProducts],
  );

  const collections = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProducts) {
      const col = collectionMap.get(p.name) ?? "";
      if (col) set.add(col);
    }
    return [...set].sort();
  }, [allProducts, collectionMap]);

  // Types are the real product categories present in this manufacturer's
  // catalog, rendered as image tiles like the homepage category grid.
  const types = useMemo(() => {
    const seen = new Map<string, { category: Category; count: number }>();
    for (const p of allProducts) {
      if (!p.categorySlug) continue;
      const cat =
        categoryBySlug.get(p.categorySlug) ??
        ({
          id: -1,
          name: p.categoryName ?? p.categorySlug,
          slug: p.categorySlug,
          parentId: null,
          imageUrl: null,
          displayOrder: 0,
        } as Category);
      const entry = seen.get(cat.slug);
      if (entry) entry.count += 1;
      else seen.set(cat.slug, { category: cat, count: 1 });
    }
    return [...seen.values()].sort((a, b) =>
      a.category.name.localeCompare(b.category.name),
    );
  }, [allProducts, categoryBySlug]);

  const filtered = useMemo(() => {
    return allProducts.filter((p) => {
      if (activeCollection) {
        if ((collectionMap.get(p.name) ?? "") !== activeCollection) return false;
      }
      if (activeType) {
        if (p.categorySlug !== activeType) return false;
      }
      return true;
    });
  }, [allProducts, activeCollection, activeType, collectionMap]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE_DISPLAY));
  const safePage = Math.min(displayPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE_DISPLAY;
  const pageProducts = filtered.slice(pageStart, pageStart + PAGE_SIZE_DISPLAY);

  const selectClass =
    "w-full border border-input bg-background rounded-sm px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary";

  function updateSearch(patch: Record<string, string | null>) {
    const next = new URLSearchParams(search);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    setLocation(qs ? `/manufacturers/${slug}?${qs}` : `/manufacturers/${slug}`);
  }

  const activeTypeName =
    types.find((t) => t.category.slug === activeType)?.category.name ?? activeType;

  const activeFilterCount = (activeCollection ? 1 : 0) + (activeType ? 1 : 0);
  const brandLogo = getBrandLogo(manufacturer?.name ?? "");
  const displayName = manufacturer?.name ?? slug.replace(/-/g, " ");

  return (
    <div className="container mx-auto px-4 py-12 max-w-7xl">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <span>/</span>
        <Link href="/manufacturers" className="hover:text-foreground">
          Manufacturers
        </Link>
        <span>/</span>
        <span className="text-foreground">{displayName}</span>
      </nav>

      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div className="flex items-center gap-4">
          {brandLogo && (
            <div className="bg-white border border-border rounded-sm px-3 py-2 h-14 flex items-center shrink-0">
              <img
                src={brandLogo}
                alt=""
                className="h-9 w-auto object-contain"
              />
            </div>
          )}
          <h1 className="font-serif text-4xl md:text-5xl capitalize">
            {displayName}
          </h1>
        </div>
        <p className="text-muted-foreground text-sm shrink-0">
          {loadError
            ? ""
            : isLoading
              ? "Loading…"
              : `${totalFiltered} ${totalFiltered === 1 ? "product" : "products"}`}
        </p>
      </div>

      {/* Type tiles — real product categories, styled like the homepage grid */}
      {!isLoading && !loadError && types.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-2xl">Shop by Type</h2>
            {activeType && (
              <button
                onClick={() => updateSearch({ type: null, page: "1" })}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear type
              </button>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {types.map(({ category, count }) => {
              const img = getCategoryImage(category);
              const isActive = activeType === category.slug;
              return (
                <button
                  key={category.slug}
                  onClick={() =>
                    updateSearch({
                      type: isActive ? null : category.slug,
                      page: "1",
                    })
                  }
                  className="group block text-left cursor-pointer"
                  aria-pressed={isActive}
                >
                  <div
                    className={`relative aspect-square overflow-hidden mb-3 bg-muted rounded-sm border-2 transition-colors ${
                      isActive ? "border-primary" : "border-transparent"
                    }`}
                  >
                    {img ? (
                      <>
                        <img
                          src={img}
                          alt={category.name}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                          loading="lazy"
                        />
                        <div
                          className={`absolute inset-0 transition-colors duration-500 ${
                            isActive
                              ? "bg-primary/25"
                              : "bg-black/10 group-hover:bg-transparent"
                          }`}
                        />
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-secondary/40 text-secondary-foreground/60 font-serif text-sm tracking-widest uppercase">
                        {category.name}
                      </div>
                    )}
                  </div>
                  <h3
                    className={`font-serif text-base md:text-lg transition-colors flex items-center justify-between ${
                      isActive ? "text-primary" : "group-hover:text-primary"
                    }`}
                  >
                    {category.name}
                    <span className="text-xs text-muted-foreground font-sans">
                      {count}
                    </span>
                  </h3>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!isLoading && !loadError && (collections.length > 0 || activeFilterCount > 0) && (
        <div className="mb-8 border border-border rounded-sm bg-card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-medium text-sm uppercase tracking-widest flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4" />
              Filter
              {activeFilterCount > 0 && (
                <span className="ml-0.5 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                  {activeFilterCount}
                </span>
              )}
            </h2>
            {activeFilterCount > 0 && (
              <button
                onClick={() =>
                  updateSearch({ collection: null, type: null, page: "1" })
                }
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
              >
                <X className="h-3 w-3" /> Clear all
              </button>
            )}
          </div>

          {collections.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-widest text-muted-foreground block">
                  Collection
                </label>
                <select
                  value={activeCollection}
                  onChange={(e) =>
                    updateSearch({ collection: e.target.value || null, page: "1" })
                  }
                  className={selectClass}
                >
                  <option value="">All collections</option>
                  {collections.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-border">
              {activeCollection && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
                  Collection: {activeCollection}
                  <button
                    onClick={() =>
                      updateSearch({ collection: null, page: "1" })
                    }
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
              {activeType && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
                  Type: {activeTypeName}
                  <button
                    onClick={() => updateSearch({ type: null, page: "1" })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {loadError ? (
        <div className="py-24 text-center">
          <h3 className="font-serif text-2xl mb-3">
            We couldn’t load this collection
          </h3>
          <p className="text-muted-foreground mb-4">
            Something went wrong fetching these products. Please try again.
          </p>
          <Button variant="outline" onClick={() => window.location.reload()}>
            Retry
          </Button>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-24">
          <Spinner />
        </div>
      ) : pageProducts.length === 0 ? (
        <div className="py-24 text-center">
          <h3 className="font-serif text-2xl mb-3">No products found</h3>
          <p className="text-muted-foreground mb-4">
            {activeFilterCount > 0
              ? "Try adjusting or clearing your filters."
              : "Check back soon as we add new collections."}
          </p>
          {activeFilterCount > 0 && (
            <Button
              variant="outline"
              onClick={() =>
                updateSearch({ collection: null, type: null, page: "1" })
              }
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {pageProducts.map((p) => {
            const onSale =
              p.salePrice && p.price && Number(p.salePrice) < Number(p.price);
            return (
              <Link key={p.id} href={`/shop/${p.slug}`} className="group block border-2 border-primary bg-card hover:shadow-md transition-shadow duration-150">
                <div className="relative aspect-square bg-card overflow-hidden">
                  {p.primaryImageUrl ? (
                    <img
                      src={p.primaryImageUrl}
                      alt={p.name}
                      className="absolute inset-0 w-full h-full object-contain p-6 mix-blend-multiply"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground font-serif text-sm">
                      No image
                    </div>
                  )}
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
                {p.showPriceOnline && p.price ? (
                  <div className="border-t border-primary/30 px-4 py-3 text-center">
                    {onSale ? (
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
                    )}
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="mt-12 flex items-center justify-center gap-2">
          <button
            disabled={safePage <= 1}
            onClick={() => updateSearch({ page: String(safePage - 1) })}
            className="px-3 py-1.5 text-sm border border-input rounded-sm disabled:opacity-40"
          >
            Prev
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => updateSearch({ page: String(n) })}
              className={`px-3 py-1.5 text-sm border rounded-sm ${
                n === safePage
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-input hover:bg-muted"
              }`}
            >
              {n}
            </button>
          ))}
          <button
            disabled={safePage >= totalPages}
            onClick={() => updateSearch({ page: String(safePage + 1) })}
            className="px-3 py-1.5 text-sm border border-input rounded-sm disabled:opacity-40"
          >
            Next
          </button>
        </nav>
      )}
    </div>
  );
}
