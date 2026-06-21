import { Link, useRoute, useLocation, useSearch } from "wouter";
import { useMemo, useState, useEffect } from "react";
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
import { getManufacturerAbout } from "@/lib/manufacturerAbout";
import { ManufacturerAbout } from "@/components/ManufacturerAbout";
import { BrowsePagination } from "@/components/BrowsePagination";
import { WishlistButton } from "@/components/WishlistButton";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CheckboxGroup, type FilterOption } from "@/components/FilterCheckboxGroup";

const PAGE_SIZE_API = 60;
const PAGE_SIZE_DISPLAY = 24;

/**
 * Per-manufacturer allowlist of first words that ARE real collection names even
 * though they look like product codes (e.g. they're numeric). Keyed by
 * manufacturer slug. Only affects the listed manufacturer — all others keep the
 * default product-code skipping rules below.
 */
const COLLECTION_NAME_ALLOWLIST: Record<string, ReadonlySet<string>> = {
  // NorthCape's "6510" series is an actual collection name, not a part number.
  northcape: new Set(["6510"]),
};

/**
 * Collection = the product name's FIRST WORD, but only when at least 2 products
 * in this manufacturer share that first word. Products whose first word is
 * unique get no collection.
 */
function buildCollectionMap(
  names: string[],
  manufacturerSlug: string,
): Map<string, string> {
  const allowlist =
    COLLECTION_NAME_ALLOWLIST[manufacturerSlug] ?? new Set<string>();
  const firstWordCount = new Map<string, number>();
  for (const name of names) {
    const first = name.trim().split(/\s+/)[0];
    // Skip first words that look like product codes, not collection names:
    //   - starts with a digit  (42", 36", 2PC)
    //   - contains any digit   (NGU550, CB87)
    //   - contains a hyphen    (DP-ST, IG-ST, SS-DB)
    //   - has no lowercase     (IG, LED, DP — all-caps abbreviations)
    // Manufacturer-specific allowlist entries bypass these checks.
    if (
      first &&
      (allowlist.has(first) ||
        (!/^\d/.test(first) &&
          !/\d/.test(first) &&
          !first.includes("-") &&
          /[a-z]/.test(first)))
    )
      firstWordCount.set(first, (firstWordCount.get(first) ?? 0) + 1);
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
  const displayPage = Math.max(1, Number(q.get("page") ?? "1") || 1);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

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
    () => buildCollectionMap(allProducts.map((p) => p.name), slug),
    [allProducts, slug],
  );

  const collections = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProducts) {
      const col = collectionMap.get(p.name) ?? "";
      if (col) set.add(col);
    }
    return [...set].sort();
  }, [allProducts, collectionMap]);

  // Types are the real product categories present in this manufacturer's catalog.
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
      a.category.displayOrder !== b.category.displayOrder
        ? a.category.displayOrder - b.category.displayOrder
        : a.category.name.localeCompare(b.category.name),
    );
  }, [allProducts, categoryBySlug]);

  const filtered = useMemo(() => {
    return allProducts
      .filter((p) => {
        if (activeCollection) {
          if ((collectionMap.get(p.name) ?? "") !== activeCollection) return false;
        }
        if (activeType) {
          if (p.categorySlug !== activeType) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const catA = a.categoryName ?? a.categorySlug ?? "";
        const catB = b.categoryName ?? b.categorySlug ?? "";
        const catCmp = catA.localeCompare(catB);
        if (catCmp !== 0) return catCmp;
        return a.name.localeCompare(b.name);
      });
  }, [allProducts, activeCollection, activeType, collectionMap]);

  const totalFiltered = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / PAGE_SIZE_DISPLAY));
  const safePage = Math.min(displayPage, totalPages);
  const pageStart = (safePage - 1) * PAGE_SIZE_DISPLAY;
  const pageProducts = filtered.slice(pageStart, pageStart + PAGE_SIZE_DISPLAY);

  // Normalize a stale/out-of-range page in the URL back to the last valid page.
  useEffect(() => {
    if (totalFiltered > 0 && displayPage > totalPages) {
      updateSearch({ page: String(totalPages) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalFiltered, totalPages, displayPage]);

  function updateSearch(patch: Record<string, string | null>) {
    const next = new URLSearchParams(search);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    setLocation(qs ? `/manufacturers/${slug}?${qs}` : `/manufacturers/${slug}`);
  }

  const typeOptions = useMemo<FilterOption[]>(
    () =>
      types.map(({ category, count }) => ({
        value: category.slug,
        label: `${category.name} (${count})`,
      })),
    [types],
  );
  const collectionOptions = useMemo<FilterOption[]>(
    () => collections.map((c) => ({ value: c, label: c })),
    [collections],
  );

  const activeTypeName =
    types.find((t) => t.category.slug === activeType)?.category.name ?? activeType;

  const activeFilterCount = (activeCollection ? 1 : 0) + (activeType ? 1 : 0);
  const brandLogo = getBrandLogo(manufacturer?.name ?? "");
  const displayName = manufacturer?.name ?? slug.replace(/-/g, " ");
  const aboutInfo = getManufacturerAbout(slug);
  const countLabel = loadError
    ? ""
    : isLoading
      ? "Loading…"
      : `${totalFiltered} ${totalFiltered === 1 ? "product" : "products"}`;

  function clearAll() {
    updateSearch({ collection: null, type: null, page: "1" });
  }

  const sidebar = (
    <aside className="space-y-0">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-xs uppercase tracking-widest font-semibold text-foreground">
          Filter
        </h2>
        {activeFilterCount > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <X className="size-3" /> Clear all
          </button>
        )}
      </div>

      <CheckboxGroup
        label="Type"
        options={typeOptions}
        selected={activeType}
        onChange={(v) => updateSearch({ type: v || null, page: "1" })}
      />
      <CheckboxGroup
        label="Collection"
        options={collectionOptions}
        selected={activeCollection}
        onChange={(v) => updateSearch({ collection: v || null, page: "1" })}
      />
    </aside>
  );

  const hasFacets = typeOptions.length > 0 || collectionOptions.length > 0;

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

      {aboutInfo ? (
        <ManufacturerAbout
          name={displayName}
          logo={brandLogo}
          about={aboutInfo}
          countLabel={countLabel}
        />
      ) : (
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
          <p className="text-muted-foreground text-sm shrink-0">{countLabel}</p>
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
      ) : (
        <>
          {/* Toolbar: mobile filter toggle + count */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              {hasFacets && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 md:hidden"
                  onClick={() => setMobileFiltersOpen((v) => !v)}
                  type="button"
                >
                  <SlidersHorizontal className="size-4" />
                  Filters
                  {activeFilterCount > 0 && (
                    <span className="ml-0.5 bg-primary text-primary-foreground rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </Button>
              )}
              <span className="text-sm text-muted-foreground">{countLabel}</span>
            </div>
          </div>

          {/* Active filter chips */}
          {activeFilterCount > 0 && (
            <div className="flex flex-wrap gap-2 mb-6">
              {activeType && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
                  Type: {activeTypeName}
                  <button type="button" onClick={() => updateSearch({ type: null, page: "1" })}>
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {activeCollection && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
                  Collection: {activeCollection}
                  <button type="button" onClick={() => updateSearch({ collection: null, page: "1" })}>
                    <X className="size-3" />
                  </button>
                </span>
              )}
            </div>
          )}

          {/* Mobile filter panel */}
          {mobileFiltersOpen && hasFacets && (
            <div className="md:hidden mb-6 border border-border bg-card p-5">
              {sidebar}
            </div>
          )}

          <div className="flex gap-8">
            {/* Desktop sidebar */}
            {hasFacets && (
              <div className="hidden md:block w-52 shrink-0">
                <div className="sticky top-6">{sidebar}</div>
              </div>
            )}

            {/* Results */}
            <div className="flex-1 min-w-0">
              {isLoading ? (
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
                    <Button variant="outline" onClick={clearAll}>
                      Clear filters
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
                  {pageProducts.map((p) => {
                    const varies = p.priceVaries && p.showPriceOnline;
                    const displayPrice = varies ? p.startingPrice : p.price;
                    const displaySale = varies ? p.startingSalePrice : p.salePrice;
                    const onSale =
                      displaySale &&
                      displayPrice &&
                      Number(displaySale) < Number(displayPrice);
                    const cardBrandLogo = getBrandLogo(p.manufacturerName);
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
                              No image available
                            </div>
                          )}
                          {cardBrandLogo && (
                            <div
                              className="absolute top-3 left-3 bg-white/95 px-2 py-1 rounded-sm shadow-sm"
                              aria-hidden="true"
                            >
                              <img src={cardBrandLogo} alt="" className="h-5 w-auto object-contain" />
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
                        {p.showPriceOnline && displayPrice ? (
                          <div className="border-t border-primary/30 px-4 py-3 text-center">
                            <p className="text-sm">
                              {varies && (
                                <span className="block text-xs uppercase tracking-widest text-muted-foreground">
                                  Starting at
                                </span>
                              )}
                              {onSale ? (
                                <>
                                  <span className="text-muted-foreground line-through mr-2">
                                    {formatMoney(displayPrice)}
                                  </span>
                                  <span className="text-primary font-semibold">
                                    {formatMoney(displaySale)}
                                  </span>
                                </>
                              ) : (
                                <span>{formatMoney(displayPrice)}</span>
                              )}
                            </p>
                          </div>
                        ) : null}
                      </Link>
                    );
                  })}
                </div>
              )}

              <BrowsePagination
                page={safePage}
                totalPages={totalPages}
                onPageChange={(n) => updateSearch({ page: String(n) })}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
