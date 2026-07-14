import { Link, useLocation, useSearch, useRoute } from "wouter";
import { useMemo, useState, useEffect, memo } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import {
  useListCatalogProducts,
  useListCatalogFacets,
  getListCatalogProductsQueryKey,
  getListCatalogFacetsQueryKey,
} from "@workspace/api-client-react";
import type {
  ListCatalogProductsParams,
  ListCatalogFacetsParams,
  CatalogProduct,
} from "@workspace/api-client-react";
import { getBrandLogo } from "@/lib/brandLogos";
import { WishlistButton } from "@/components/WishlistButton";
import { Button } from "@/components/ui/button";
import { CheckboxGroup, type FilterOption } from "@/components/FilterCheckboxGroup";
import { BrowsePagination } from "@/components/BrowsePagination";
import { parseListParam, joinListParam } from "@/lib/filterParams";
import { SORTS } from "@/lib/sortOptions";

function formatMoney(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}

const ProductCard = memo(function ProductCard({ product: p }: { product: CatalogProduct }) {
  const varies = p.priceVaries && p.showPriceOnline;
  const displayPrice = varies ? p.startingPrice : p.price;
  const displaySale = varies ? p.startingSalePrice : p.salePrice;
  const onSale =
    displaySale &&
    displayPrice &&
    Number(displaySale) < Number(displayPrice);
  const brandLogo = getBrandLogo(p.manufacturerName);

  return (
    <Link href={`/shop/${p.slug}`} className="group block border-2 border-primary bg-card hover:shadow-md transition-shadow duration-150">
      <div className="relative aspect-square bg-card overflow-hidden">
        {p.primaryImageUrl ? (
          <img
            src={p.primaryImageUrl}
            alt={p.name}
            loading="lazy"
            className="absolute inset-0 w-full h-full object-contain p-6 mix-blend-multiply"
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground font-serif">
            No image available
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
      <div className="border-t border-primary/30 px-4 py-4 space-y-2 text-center">
        {brandLogo ? (
          <div className="flex justify-center">
            <img
              src={brandLogo}
              alt={p.manufacturerName ?? ""}
              loading="lazy"
              className="h-6 w-auto object-contain"
            />
          </div>
        ) : p.manufacturerName ? (
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            {p.manufacturerName}
          </p>
        ) : null}
        {p.showPriceOnline && displayPrice ? (
          onSale ? (
            <p className="text-sm font-bold">
              {varies && (
                <span className="block text-xs font-normal uppercase tracking-widest text-muted-foreground">
                  Starting at
                </span>
              )}
              <span className="text-muted-foreground line-through mr-2">
                {varies ? formatMoney(displayPrice) : `MSRP ${formatMoney(displayPrice)}`}
              </span>
              <span className="text-primary">
                {varies ? formatMoney(displaySale) : `Sale ${formatMoney(displaySale)}`}
              </span>
            </p>
          ) : (
            <p className="text-sm font-bold">
              {varies && (
                <span className="block text-xs font-normal uppercase tracking-widest text-muted-foreground">
                  Starting at
                </span>
              )}
              {varies ? formatMoney(displayPrice) : `MSRP ${formatMoney(displayPrice)}`}
            </p>
          )
        ) : null}
        <div className="pt-1">
          <span className="inline-block w-full border border-primary text-primary text-xs uppercase tracking-widest px-4 py-2.5 font-semibold group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-150">
            Select Options
          </span>
        </div>
      </div>
    </Link>
  );
});

export default function Shop() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const [, params] = useRoute<{ slug: string }>("/shop/category/:slug");
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const q = useMemo(() => new URLSearchParams(search), [search]);

  const isOnlineOnly = q.get("online") === "true";

  // Category can arrive either as a single fixed route slug
  // (/shop/category/:slug, used by pretty deep links) or as a comma-separated
  // multi-select query param. While the route is active, treat it as the sole
  // selection; any multi-select interaction routes away from it (see
  // setCategories below), since a path segment can't represent 2+ slugs.
  const activeCategories = useMemo(
    () => (params?.slug ? [params.slug] : parseListParam(q.get("category"))),
    [params?.slug, q],
  );
  const activeManufacturers = useMemo(() => parseListParam(q.get("manufacturer")), [q]);
  const activeMaterials = useMemo(() => parseListParam(q.get("material")), [q]);
  const activeCollections = useMemo(() => parseListParam(q.get("collection")), [q]);
  const activeSubCategories = useMemo(() => parseListParam(q.get("subcategory")), [q]);
  const activeSizes = useMemo(() => parseListParam(q.get("size")), [q]);
  const activeName = debouncedSearch;

  // Sync local search input from URL on mount / external changes
  useEffect(() => {
    const urlQ = q.get("q") ?? "";
    setSearchInput(urlQ);
    setDebouncedSearch(urlQ);
  }, [search]);

  // Debounce search input → API param
  useEffect(() => {
    const id = setTimeout(() => {
      setDebouncedSearch(searchInput);
      if (searchInput !== (q.get("q") ?? "")) {
        updateSearch({ q: searchInput || null, page: "1" });
      }
    }, 300);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const queryParams = useMemo(() => {
    const out: ListCatalogProductsParams = {
      page: Math.max(1, Number(q.get("page") ?? "1") || 1),
      pageSize: 12,
      sort: (q.get("sort") as ListCatalogProductsParams["sort"]) ?? "featured",
    };
    if (activeName) out.q = activeName;
    if (activeManufacturers.length) out.manufacturerSlug = activeManufacturers.join(",");
    if (activeMaterials.length) out.materialSlug = activeMaterials.join(",");
    if (activeSizes.length) out.sizeLabel = activeSizes.join(",");
    if (activeManufacturers.length && activeCollections.length)
      out.collection = activeCollections.join(",");
    if (activeCategories.length) out.categorySlug = activeCategories.join(",");
    if (activeCategories.length && activeSubCategories.length)
      out.subCategory = activeSubCategories.join(",");
    if (isOnlineOnly) out.onlineOnly = true;
    return out;
  }, [
    search,
    activeCategories,
    activeManufacturers,
    activeMaterials,
    activeSizes,
    activeCollections,
    activeSubCategories,
    activeName,
    isOnlineOnly,
  ]);

  const { data, isLoading } = useListCatalogProducts(queryParams, {
    query: { queryKey: getListCatalogProductsQueryKey(queryParams), staleTime: 60_000 },
  });

  // All filter options are derived from the live catalog and narrowed to the
  // OTHER active selections, so options that would return zero products are
  // hidden automatically (and the lists adapt as catalog data changes).
  const facetParams = useMemo<ListCatalogFacetsParams>(() => {
    const out: ListCatalogFacetsParams = {};
    if (activeName) out.q = activeName;
    if (activeCategories.length) out.categorySlug = activeCategories.join(",");
    if (activeManufacturers.length) out.manufacturerSlug = activeManufacturers.join(",");
    if (activeMaterials.length) out.materialSlug = activeMaterials.join(",");
    if (activeSizes.length) out.sizeLabel = activeSizes.join(",");
    if (activeManufacturers.length && activeCollections.length)
      out.collection = activeCollections.join(",");
    if (activeCategories.length && activeSubCategories.length)
      out.subCategory = activeSubCategories.join(",");
    if (isOnlineOnly) out.onlineOnly = true;
    return out;
  }, [
    activeName,
    activeCategories,
    activeManufacturers,
    activeMaterials,
    activeSizes,
    activeCollections,
    activeSubCategories,
    isOnlineOnly,
  ]);
  const { data: facets } = useListCatalogFacets(facetParams, {
    query: { queryKey: getListCatalogFacetsQueryKey(facetParams), staleTime: 60_000 },
  });

  const total = data?.total ?? 0;
  const pageSize = queryParams.pageSize ?? 12;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const requestedPage = queryParams.page ?? 1;
  const page = Math.min(requestedPage, totalPages);
  const startIdx = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const endIdx = Math.min(total, page * pageSize);

  // If the URL requests a page beyond the result set (e.g. stale link, manual
  // edit), normalize it back to the last valid page so the query refetches the
  // correct slice instead of showing an empty page.
  useEffect(() => {
    if (total > 0 && requestedPage > totalPages) {
      updateSearch({ page: String(totalPages) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, totalPages, requestedPage]);

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

  // A single selected category keeps the pretty /shop/category/:slug URL
  // (used by homepage/nav deep links); 0 or 2+ selections fall back to the
  // generic /shop route with a comma-separated `category` query param, since
  // a path segment can't represent multiple values.
  function setCategories(values: string[]) {
    const next = new URLSearchParams(search);
    next.delete("category");
    next.delete("page");
    // Sub-category values are specific to the selected category set, so
    // clear the selection whenever categories change.
    next.delete("subcategory");
    if (values.length > 1) next.set("category", values.join(","));
    const qs = next.toString();
    const base = values.length === 1 ? `/shop/category/${values[0]}` : "/shop";
    setLocation(qs ? `${base}?${qs}` : base);
  }

  function clearAll() {
    setLocation("/shop");
  }

  const activeFilterCount =
    (isOnlineOnly ? 1 : 0) +
    activeCategories.length +
    activeSubCategories.length +
    activeManufacturers.length +
    activeCollections.length +
    activeMaterials.length +
    activeSizes.length +
    (activeName ? 1 : 0);

  const categoryOptions = useMemo<FilterOption[]>(
    () => (facets?.categories ?? []).map((c) => ({ value: c.slug, label: c.name })),
    [facets],
  );
  const manufacturerOptions = useMemo<FilterOption[]>(
    () => (facets?.manufacturers ?? []).map((m) => ({ value: m.slug, label: m.name })),
    [facets],
  );
  const materialOptions = useMemo<FilterOption[]>(
    () => (facets?.materials ?? []).map((m) => ({ value: m.slug, label: m.name })),
    [facets],
  );
  const sizeOptions = useMemo<FilterOption[]>(
    () => (facets?.sizes ?? []).map((s) => ({ value: s, label: s })),
    [facets],
  );
  const collectionOptions = useMemo<FilterOption[]>(
    () => (facets?.collections ?? []).map((c) => ({ value: c, label: c })),
    [facets],
  );
  const subCategoryOptions = useMemo<FilterOption[]>(
    () => (facets?.subCategories ?? []).map((c) => ({ value: c, label: c })),
    [facets],
  );

  const heading = isOnlineOnly && !params?.slug
    ? "Shop Online"
    : params?.slug
      ? (data?.products[0]?.categoryName ?? params.slug.replace(/-/g, " "))
      : "Shop";

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

      {/* Name / SKU search */}
      <div className="border-b border-border py-4">
        <label className="text-xs uppercase tracking-widest font-semibold text-foreground block mb-3">
          Name / SKU
        </label>
        <div className="relative">
          <input
            type="text"
            placeholder="Search by name or SKU…"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
            }}
            className="w-full border border-input bg-background rounded-sm pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setDebouncedSearch("");
                updateSearch({ q: null, page: "1" });
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <CheckboxGroup
        label="Availability"
        options={[{ value: "online", label: "Available online" }]}
        selected={isOnlineOnly ? ["online"] : []}
        onChange={(v) => updateSearch({ online: v.length ? "true" : null, page: "1" })}
      />
      <CheckboxGroup
        label="Category"
        options={categoryOptions}
        selected={activeCategories}
        onChange={setCategories}
      />
      {activeCategories.length > 0 && subCategoryOptions.length > 0 && (
        <CheckboxGroup
          label="Sub Category"
          options={subCategoryOptions}
          selected={activeSubCategories}
          onChange={(v) => updateSearch({ subcategory: joinListParam(v), page: "1" })}
        />
      )}
      <CheckboxGroup
        label="Brand"
        options={manufacturerOptions}
        selected={activeManufacturers}
        onChange={(v) =>
          updateSearch({ manufacturer: joinListParam(v), collection: null, page: "1" })
        }
      />
      {activeManufacturers.length > 0 && collectionOptions.length > 0 && (
        <CheckboxGroup
          label="Collection"
          options={collectionOptions}
          selected={activeCollections}
          onChange={(v) => updateSearch({ collection: joinListParam(v), page: "1" })}
        />
      )}
      <CheckboxGroup
        label="Material"
        options={materialOptions}
        selected={activeMaterials}
        onChange={(v) => updateSearch({ material: joinListParam(v), page: "1" })}
      />
      {sizeOptions.length > 0 && (
        <CheckboxGroup
          label="Canopy Size"
          options={sizeOptions}
          selected={activeSizes}
          onChange={(v) => updateSearch({ size: joinListParam(v), page: "1" })}
        />
      )}
    </aside>
  );

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

      <div className="mb-8">
        <h1 className="font-serif text-4xl md:text-5xl capitalize">{heading}</h1>
        {isOnlineOnly && (
          <p className="text-sm text-muted-foreground mt-2">
            Browse products available for online purchase — no showroom visit required.
          </p>
        )}
      </div>

      {/* Toolbar: mobile filter toggle + sort + count */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
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
          <span className="text-sm text-muted-foreground">
            {isLoading
              ? "Loading…"
              : total === 0
                ? "No results"
                : `${startIdx}–${endIdx} of ${total} product${total !== 1 ? "s" : ""}`}
          </span>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sort by
          <select
            value={queryParams.sort}
            onChange={(e) => updateSearch({ sort: e.target.value, page: "1" })}
            className="border border-input bg-background rounded-none px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Active filter chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {isOnlineOnly && (
            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
              Available online
              <button type="button" onClick={() => updateSearch({ online: null, page: "1" })}>
                <X className="size-3" />
              </button>
            </span>
          )}
          {activeCategories.map((c) => (
            <span key={`cat-${c}`} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
              {categoryOptions.find((o) => o.value === c)?.label ?? c}
              <button
                type="button"
                onClick={() => setCategories(activeCategories.filter((v) => v !== c))}
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {activeSubCategories.map((sc) => (
            <span key={`subcat-${sc}`} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
              {sc}
              <button
                type="button"
                onClick={() =>
                  updateSearch({
                    subcategory: joinListParam(activeSubCategories.filter((v) => v !== sc)),
                    page: "1",
                  })
                }
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {activeManufacturers.map((m) => (
            <span key={`mfr-${m}`} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
              {manufacturerOptions.find((o) => o.value === m)?.label ?? m}
              <button
                type="button"
                onClick={() =>
                  updateSearch({
                    manufacturer: joinListParam(activeManufacturers.filter((v) => v !== m)),
                    collection: null,
                    page: "1",
                  })
                }
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {activeCollections.map((c) => (
            <span key={`coll-${c}`} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
              {c}
              <button
                type="button"
                onClick={() =>
                  updateSearch({
                    collection: joinListParam(activeCollections.filter((v) => v !== c)),
                    page: "1",
                  })
                }
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {activeMaterials.map((m) => (
            <span key={`mat-${m}`} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
              {materialOptions.find((o) => o.value === m)?.label ?? m}
              <button
                type="button"
                onClick={() =>
                  updateSearch({
                    material: joinListParam(activeMaterials.filter((v) => v !== m)),
                    page: "1",
                  })
                }
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {activeSizes.map((s) => (
            <span key={`size-${s}`} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
              {sizeOptions.find((o) => o.value === s)?.label ?? s}
              <button
                type="button"
                onClick={() =>
                  updateSearch({
                    size: joinListParam(activeSizes.filter((v) => v !== s)),
                    page: "1",
                  })
                }
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
          {activeName && (
            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
              Name: "{activeName}"
              <button type="button" onClick={() => updateSearch({ q: null, page: "1" })}>
                <X className="size-3" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Mobile filter panel */}
      {mobileFiltersOpen && (
        <div className="md:hidden mb-6 border border-border bg-card p-5">
          {sidebar}
        </div>
      )}

      <div className="flex gap-8">
        {/* Desktop sidebar */}
        <div className="hidden md:block w-52 shrink-0">
          <div className="sticky top-6">
            {sidebar}
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 min-w-0">
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
              {data.products.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}

          <BrowsePagination
            page={page}
            totalPages={totalPages}
            onPageChange={(n) => updateSearch({ page: String(n) })}
          />
        </div>
      </div>
    </div>
  );
}
