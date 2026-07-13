import { useMemo, useState, useRef, useEffect, type FormEvent, type ChangeEvent } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { SlidersHorizontal, X, Search as SearchIcon } from "lucide-react";
import { CheckboxGroup } from "@/components/FilterCheckboxGroup";
import { BrowsePagination } from "@/components/BrowsePagination";
import {
  useListCatalogProducts,
  useListCatalogFabrics,
  getListCatalogFabricsQueryKey,
  useListCatalogFacets,
  useListCatalogManufacturerFinishes,
  getListCatalogManufacturerFinishesQueryKey,
} from "@workspace/api-client-react";
import type {
  ListCatalogProductsParams,
  ListCatalogFacetsParams,
} from "@workspace/api-client-react";
import { getBrandLogo } from "@/lib/brandLogos";
import { WishlistButton } from "@/components/WishlistButton";
import { FabricSwatchImage } from "@/components/FabricSwatchImage";
import { Button } from "@/components/ui/button";
import { parseListParam, joinListParam } from "@/lib/filterParams";
import { SORTS } from "@/lib/sortOptions";

const PAGE_SIZE = 12;

function formatMoney(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}

export default function SearchPage() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const q = useMemo(() => new URLSearchParams(search), [search]);

  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);

  const activeQ = q.get("q") ?? "";
  const activeCategories = useMemo(() => parseListParam(q.get("category")), [q]);
  const activeSubCategories = useMemo(() => parseListParam(q.get("subcategory")), [q]);
  const activeManufacturers = useMemo(() => parseListParam(q.get("manufacturer")), [q]);
  const activeCollections = useMemo(() => parseListParam(q.get("collection")), [q]);
  const activeMaterials = useMemo(() => parseListParam(q.get("material")), [q]);
  const activeSort = (q.get("sort") ?? "featured") as ListCatalogProductsParams["sort"];
  const activePage = Math.max(1, Number(q.get("page") ?? "1") || 1);

  const activeFilterCount =
    activeCategories.length +
    activeSubCategories.length +
    activeManufacturers.length +
    activeCollections.length +
    activeMaterials.length;

  function updateSearch(patch: Record<string, string | null>) {
    const next = new URLSearchParams(search);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "") next.delete(k);
      else next.set(k, v);
    }
    const qs = next.toString();
    setLocation(qs ? `/search?${qs}` : "/search");
  }

  function handleSearchSubmit(e: FormEvent) {
    e.preventDefault();
    const val = searchRef.current?.value.trim() ?? "";
    updateSearch({ q: val || null, page: "1" });
  }

  function clearAll() {
    const next = new URLSearchParams();
    if (activeQ) next.set("q", activeQ);
    if (activeSort && activeSort !== "featured") next.set("sort", activeSort);
    const qs = next.toString();
    setLocation(qs ? `/search?${qs}` : "/search");
  }

  const queryParams = useMemo((): ListCatalogProductsParams => {
    const out: ListCatalogProductsParams = {
      page: activePage,
      pageSize: PAGE_SIZE,
      sort: activeSort ?? "featured",
    };
    if (activeQ) out.q = activeQ;
    if (activeCategories.length) out.categorySlug = activeCategories.join(",");
    if (activeCategories.length && activeSubCategories.length)
      out.subCategory = activeSubCategories.join(",");
    if (activeManufacturers.length) out.manufacturerSlug = activeManufacturers.join(",");
    if (activeManufacturers.length && activeCollections.length)
      out.collection = activeCollections.join(",");
    if (activeMaterials.length) out.materialSlug = activeMaterials.join(",");
    return out;
  }, [
    activeQ,
    activeCategories,
    activeSubCategories,
    activeManufacturers,
    activeCollections,
    activeMaterials,
    activeSort,
    activePage,
  ]);

  const { data, isLoading } = useListCatalogProducts(queryParams);
  const fabricParams = activeQ ? { q: activeQ } : undefined;
  const { data: fabricData } = useListCatalogFabrics(fabricParams, {
    query: {
      queryKey: getListCatalogFabricsQueryKey(fabricParams),
      enabled: !!activeQ,
    },
  });
  const matchingFabrics = fabricData?.fabrics ?? [];

  const finishSearchParams = activeQ ? { q: activeQ } : undefined;
  const { data: finishSearchData } = useListCatalogManufacturerFinishes(finishSearchParams, {
    query: {
      queryKey: getListCatalogManufacturerFinishesQueryKey(finishSearchParams),
      enabled: !!activeQ,
    },
  });
  const matchingFinishes = finishSearchData?.finishes ?? [];

  // Filter options come from the live catalog, narrowed to the OTHER active
  // selections so zero-result options are hidden and adapt to data changes.
  const facetParams = useMemo<ListCatalogFacetsParams>(() => {
    const out: ListCatalogFacetsParams = {};
    if (activeQ) out.q = activeQ;
    if (activeCategories.length) out.categorySlug = activeCategories.join(",");
    if (activeCategories.length && activeSubCategories.length)
      out.subCategory = activeSubCategories.join(",");
    if (activeManufacturers.length) out.manufacturerSlug = activeManufacturers.join(",");
    if (activeManufacturers.length && activeCollections.length)
      out.collection = activeCollections.join(",");
    if (activeMaterials.length) out.materialSlug = activeMaterials.join(",");
    return out;
  }, [
    activeQ,
    activeCategories,
    activeSubCategories,
    activeManufacturers,
    activeCollections,
    activeMaterials,
  ]);
  const { data: facets } = useListCatalogFacets(facetParams);

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(activePage, totalPages);
  const startIdx = total === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endIdx = Math.min(total, safePage * PAGE_SIZE);

  // If the URL requests a page beyond the result set, normalize it back to the
  // last valid page so the query refetches the correct slice.
  useEffect(() => {
    if (total > 0 && activePage > totalPages) {
      updateSearch({ page: String(totalPages) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total, totalPages, activePage]);

  const categoryOptions = useMemo(
    () => (facets?.categories ?? []).map((c) => ({ value: c.slug, label: c.name })),
    [facets],
  );
  const manufacturerOptions = useMemo(
    () => (facets?.manufacturers ?? []).map((m) => ({ value: m.slug, label: m.name })),
    [facets],
  );
  const materialOptions = useMemo(
    () => (facets?.materials ?? []).map((m) => ({ value: m.slug, label: m.name })),
    [facets],
  );
  const subCategoryOptions = useMemo(
    () => (facets?.subCategories ?? []).map((c) => ({ value: c, label: c })),
    [facets],
  );
  const collectionOptions = useMemo(
    () => (facets?.collections ?? []).map((c) => ({ value: c, label: c })),
    [facets],
  );

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
        selected={activeCategories}
        onChange={(v) =>
          updateSearch({ category: joinListParam(v), subcategory: null, page: "1" })
        }
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
        label="Manufacturer"
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
    </aside>
  );

  return (
    <div className="container mx-auto px-4 py-10 max-w-7xl">
      {/* Breadcrumb */}
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span>/</span>
        <span className="text-foreground">Search</span>
      </nav>

      {/* Search bar */}
      <form onSubmit={handleSearchSubmit} className="mb-8">
        <div className="relative max-w-2xl">
          <SearchIcon className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <input
            ref={searchRef}
            type="search"
            defaultValue={activeQ}
            key={activeQ}
            placeholder="Search products by name, SKU, or keyword…"
            className="w-full border border-input bg-background rounded-none pl-11 pr-28 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          <button
            type="submit"
            className="absolute right-0 top-0 h-full px-6 bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Search
          </button>
        </div>
      </form>

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
              ? "Searching…"
              : total === 0
                ? matchingFabrics.length > 0
                  ? "No matching products"
                  : "No results"
                : `${startIdx}–${endIdx} of ${total} product${total !== 1 ? "s" : ""}`}
          </span>
        </div>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          Sort by
          <select
            value={activeSort}
            onChange={(e: ChangeEvent<HTMLSelectElement>) =>
              updateSearch({ sort: e.target.value, page: "1" })
            }
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
          {activeCategories.map((c) => (
            <span key={`cat-${c}`} className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
              {categoryOptions.find((o) => o.value === c)?.label ?? c}
              <button
                type="button"
                onClick={() =>
                  updateSearch({
                    category: joinListParam(activeCategories.filter((v) => v !== c)),
                    subcategory: null,
                    page: "1",
                  })
                }
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
          {/* Fabric swatch results */}
          {matchingFabrics.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xs uppercase tracking-widest font-semibold text-foreground mb-4">
                Matching Fabrics
                <span className="ml-2 font-normal text-muted-foreground">({matchingFabrics.length})</span>
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                {matchingFabrics.map((fabric) => (
                  <div key={fabric.id} className="group block">
                    <FabricSwatchImage fabric={fabric} placeholder="No swatch" />
                    <p className="mt-1.5 text-xs text-foreground line-clamp-1" title={fabric.name}>
                      {fabric.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{fabric.itemNumber}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-border mt-8 mb-8" />
            </div>
          )}

          {/* Finish swatch results */}
          {matchingFinishes.length > 0 && (
            <div className="mb-10">
              <h2 className="text-xs uppercase tracking-widest font-semibold text-foreground mb-4">
                Matching Finishes
                <span className="ml-2 font-normal text-muted-foreground">({matchingFinishes.length})</span>
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
                {matchingFinishes.map((finish) => (
                  <div key={finish.id} className="group block">
                    <FabricSwatchImage
                      fabric={{
                        name: finish.name,
                        itemNumber: finish.itemNumber ?? "",
                        manufacturerName: finish.manufacturerName,
                        manufacturerLogoUrl: finish.manufacturerLogoUrl,
                        swatchImageUrl: finish.imageUrl,
                        grade: null,
                      }}
                      placeholder="Sample coming soon"
                    />
                    <p className="mt-1.5 text-xs text-foreground line-clamp-1" title={finish.name}>
                      {finish.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">{finish.itemNumber}</p>
                  </div>
                ))}
              </div>
              <div className="border-t border-border mt-8 mb-8" />
            </div>
          )}

          {isLoading ? (
            <div className="py-24 text-center text-muted-foreground">Searching…</div>
          ) : !data || data.products.length === 0 ? (
            <div className="py-24 text-center">
              <h3 className="font-serif text-2xl mb-3">No products found</h3>
              <p className="text-muted-foreground mb-6">
                {activeQ
                  ? `No results for "${activeQ}"${activeFilterCount > 0 ? " with the selected filters" : ""}.`
                  : activeFilterCount > 0
                    ? "No products match the selected filters."
                    : "Try entering a search term above."}
              </p>
              {(activeQ || activeFilterCount > 0) && (
                <div className="flex items-center justify-center gap-3">
                  {activeFilterCount > 0 && (
                    <Button variant="outline" onClick={clearAll} size="sm">
                      Clear filters
                    </Button>
                  )}
                  {activeQ && (
                    <Button variant="outline" onClick={() => updateSearch({ q: null, page: "1" })} size="sm">
                      Clear search
                    </Button>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {data.products.map((p) => {
                const varies = p.priceVaries && p.showPriceOnline;
                const displayPrice = varies ? p.startingPrice : p.price;
                const displaySale = varies ? p.startingSalePrice : p.salePrice;
                const onSale =
                  displaySale &&
                  displayPrice &&
                  Number(displaySale) < Number(displayPrice);
                const brandLogo = getBrandLogo(p.manufacturerName);
                return (
                  <Link key={p.id} href={`/shop/${p.slug}`} className="group block border-2 border-primary bg-card hover:shadow-md transition-shadow duration-150">
                    <div className="relative aspect-square bg-card overflow-hidden">
                      {p.primaryImageUrl ? (
                        <img
                          src={p.primaryImageUrl}
                          alt={p.name}
                          className="absolute inset-0 w-full h-full object-contain p-6 mix-blend-multiply"
                        />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground font-serif text-sm">
                          No image available
                        </div>
                      )}
                      {brandLogo && (
                        <div
                          className="absolute top-3 left-3 bg-white/95 px-2 py-1 rounded-sm shadow-sm"
                          aria-hidden="true"
                        >
                          <img src={brandLogo} alt="" className="h-5 w-auto object-contain" />
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
                        <h3 className="font-serif text-base text-white drop-shadow line-clamp-2 pr-12">
                          {p.name}
                        </h3>
                      </div>
                    </div>
                    {((!brandLogo && p.manufacturerName) ||
                      (p.showPriceOnline && displayPrice)) ? (
                    <div className="border-t border-primary/30 px-4 py-3 space-y-1 text-center">
                      {!brandLogo && p.manufacturerName && (
                        <p className="text-xs uppercase tracking-widest text-muted-foreground">
                          {p.manufacturerName}
                        </p>
                      )}
                      {p.showPriceOnline && displayPrice && (
                        <p className="text-sm">
                          {varies && (
                            <span className="block text-xs uppercase tracking-widest text-muted-foreground">
                              Starting at
                            </span>
                          )}
                          {onSale ? (
                            <>
                              <span className="text-muted-foreground line-through mr-2">{formatMoney(displayPrice)}</span>
                              <span className="text-primary font-semibold">{formatMoney(displaySale)}</span>
                            </>
                          ) : (
                            <span>{formatMoney(displayPrice)}</span>
                          )}
                        </p>
                      )}
                    </div>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          <BrowsePagination
            page={safePage}
            totalPages={totalPages}
            onPageChange={(n) => updateSearch({ page: String(n) })}
          />
        </div>
      </div>
    </div>
  );
}
