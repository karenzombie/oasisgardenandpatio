import { Link, useRoute, useLocation, useSearch } from "wouter";
import { useMemo, useState, useEffect } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import {
  useListCatalogProducts,
  useListCatalogFacets,
  useListManufacturers,
} from "@workspace/api-client-react";
import type {
  ListCatalogProductsParams,
  ListCatalogFacetsParams,
} from "@workspace/api-client-react";
import { getBrandLogo } from "@/lib/brandLogos";
import { getManufacturerAbout } from "@/lib/manufacturerAbout";
import { ManufacturerAbout } from "@/components/ManufacturerAbout";
import { BrowsePagination } from "@/components/BrowsePagination";
import { WishlistButton } from "@/components/WishlistButton";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { CheckboxGroup, type FilterOption } from "@/components/FilterCheckboxGroup";

const PAGE_SIZE_DISPLAY = 24;

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

  // Manufacturer is fixed by the route; category/sub-category/collection/material
  // are query-param filters. Sub-category is gated behind a selected category
  // and collection is always available (the brand is already fixed).
  const activeCategory = q.get("category") ?? "";
  const activeSubCategory = q.get("subcategory") ?? "";
  const activeCollection = q.get("collection") ?? "";
  const activeMaterial = q.get("material") ?? "";
  const displayPage = Math.max(1, Number(q.get("page") ?? "1") || 1);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const { data: manufacturers } = useListManufacturers();
  const manufacturer = manufacturers?.find((m) => m.slug === slug);

  function updateSearch(patch: Record<string, string | null>) {
    const next = new URLSearchParams(search);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    setLocation(qs ? `/manufacturers/${slug}?${qs}` : `/manufacturers/${slug}`);
  }

  // Server-side, paginated product list scoped to this manufacturer.
  const queryParams = useMemo<ListCatalogProductsParams>(() => {
    const out: ListCatalogProductsParams = {
      manufacturerSlug: slug,
      sort: "name_asc",
      page: displayPage,
      pageSize: PAGE_SIZE_DISPLAY,
    };
    if (activeCategory) out.categorySlug = activeCategory;
    if (activeCategory && activeSubCategory) out.subCategory = activeSubCategory;
    if (activeCollection) out.collection = activeCollection;
    if (activeMaterial) out.materialSlug = activeMaterial;
    return out;
  }, [
    slug,
    displayPage,
    activeCategory,
    activeSubCategory,
    activeCollection,
    activeMaterial,
  ]);

  const { data, isLoading, error } = useListCatalogProducts(queryParams);
  const loadError = error != null;

  // Filter options come from the live catalog, narrowed to the OTHER active
  // selections (and to this manufacturer) so zero-result options stay hidden.
  const facetParams = useMemo<ListCatalogFacetsParams>(() => {
    const out: ListCatalogFacetsParams = { manufacturerSlug: slug };
    if (activeCategory) out.categorySlug = activeCategory;
    if (activeCategory && activeSubCategory) out.subCategory = activeSubCategory;
    if (activeCollection) out.collection = activeCollection;
    if (activeMaterial) out.materialSlug = activeMaterial;
    return out;
  }, [slug, activeCategory, activeSubCategory, activeCollection, activeMaterial]);

  const { data: facets } = useListCatalogFacets(facetParams);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE_DISPLAY));
  const safePage = Math.min(displayPage, totalPages);
  const pageProducts = data?.products ?? [];

  // Normalize a stale/out-of-range page in the URL back to the last valid page.
  useEffect(() => {
    if (total > 0 && displayPage > totalPages) {
      updateSearch({ page: String(totalPages) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, totalPages, displayPage]);

  const categoryOptions = useMemo<FilterOption[]>(
    () => (facets?.categories ?? []).map((c) => ({ value: c.slug, label: c.name })),
    [facets],
  );
  const subCategoryOptions = useMemo<FilterOption[]>(
    () => (facets?.subCategories ?? []).map((c) => ({ value: c, label: c })),
    [facets],
  );
  const collectionOptions = useMemo<FilterOption[]>(
    () => (facets?.collections ?? []).map((c) => ({ value: c, label: c })),
    [facets],
  );
  const materialOptions = useMemo<FilterOption[]>(
    () => (facets?.materials ?? []).map((m) => ({ value: m.slug, label: m.name })),
    [facets],
  );

  const activeCategoryName =
    categoryOptions.find((c) => c.value === activeCategory)?.label ?? activeCategory;

  const activeFilterCount =
    (activeCategory ? 1 : 0) +
    (activeCategory && activeSubCategory ? 1 : 0) +
    (activeCollection ? 1 : 0) +
    (activeMaterial ? 1 : 0);
  const brandLogo = getBrandLogo(manufacturer?.name ?? "");
  const displayName = manufacturer?.name ?? slug.replace(/-/g, " ");
  const aboutInfo = getManufacturerAbout(slug);
  const countLabel = loadError
    ? ""
    : isLoading
      ? "Loading…"
      : `${total} ${total === 1 ? "product" : "products"}`;

  function clearAll() {
    updateSearch({
      category: null,
      subcategory: null,
      collection: null,
      material: null,
      page: "1",
    });
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
        label="Category"
        options={categoryOptions}
        selected={activeCategory}
        onChange={(v) => updateSearch({ category: v || null, subcategory: null, page: "1" })}
      />
      {activeCategory && subCategoryOptions.length > 0 && (
        <CheckboxGroup
          label="Sub Category"
          options={subCategoryOptions}
          selected={activeSubCategory}
          onChange={(v) => updateSearch({ subcategory: v || null, page: "1" })}
        />
      )}
      <CheckboxGroup
        label="Collection"
        options={collectionOptions}
        selected={activeCollection}
        onChange={(v) => updateSearch({ collection: v || null, page: "1" })}
      />
      <CheckboxGroup
        label="Material"
        options={materialOptions}
        selected={activeMaterial}
        onChange={(v) => updateSearch({ material: v || null, page: "1" })}
      />
    </aside>
  );

  const hasFacets =
    categoryOptions.length > 0 ||
    collectionOptions.length > 0 ||
    materialOptions.length > 0;

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
              {activeCategory && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
                  {activeCategoryName}
                  <button type="button" onClick={() => updateSearch({ category: null, subcategory: null, page: "1" })}>
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {activeCategory && activeSubCategory && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
                  {activeSubCategory}
                  <button type="button" onClick={() => updateSearch({ subcategory: null, page: "1" })}>
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {activeCollection && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
                  {activeCollection}
                  <button type="button" onClick={() => updateSearch({ collection: null, page: "1" })}>
                    <X className="size-3" />
                  </button>
                </span>
              )}
              {activeMaterial && (
                <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
                  {materialOptions.find((m) => m.value === activeMaterial)?.label ?? activeMaterial}
                  <button type="button" onClick={() => updateSearch({ material: null, page: "1" })}>
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
