import { Link, useLocation, useSearch, useRoute } from "wouter";
import { useMemo, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import {
  useListCatalogProducts,
  useListCategories,
  useListCatalogFinishes,
  useListManufacturers,
  useListMaterials,
} from "@workspace/api-client-react";
import type { ListCatalogProductsParams } from "@workspace/api-client-react";
import { getBrandLogo } from "@/lib/brandLogos";
import { WishlistButton } from "@/components/WishlistButton";
import { Button } from "@/components/ui/button";
import { CheckboxGroup, type FilterOption } from "@/components/FilterCheckboxGroup";

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
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const q = useMemo(() => new URLSearchParams(search), [search]);

  const isOnlineOnly = q.get("online") === "true";
  const isCategoryFixed = !!params?.slug;

  const activeCategory = params?.slug ?? q.get("category") ?? "";
  const activeManufacturer = q.get("manufacturer") ?? "";
  const activeMaterial = q.get("material") ?? "";
  const activeFinish = q.get("finish") ?? "";
  const activeName = q.get("q") ?? "";

  const queryParams = useMemo(() => {
    const out: ListCatalogProductsParams = {
      page: Number(q.get("page") ?? "1") || 1,
      pageSize: 12,
      sort: (q.get("sort") as ListCatalogProductsParams["sort"]) ?? "featured",
    };
    if (activeName) out.q = activeName;
    if (activeManufacturer) out.manufacturerSlug = activeManufacturer;
    if (activeMaterial) out.materialSlug = activeMaterial;
    if (activeFinish) out.finish = activeFinish;
    if (activeCategory) out.categorySlug = activeCategory;
    if (isOnlineOnly) out.onlineOnly = true;
    return out;
  }, [
    search,
    activeCategory,
    activeManufacturer,
    activeMaterial,
    activeFinish,
    activeName,
    isOnlineOnly,
  ]);

  const { data, isLoading } = useListCatalogProducts(queryParams);
  const { data: categories } = useListCategories(isOnlineOnly ? { onlineOnly: true } : undefined);
  const { data: finishes } = useListCatalogFinishes();
  const { data: manufacturers } = useListManufacturers(isOnlineOnly ? { onlineOnly: true } : undefined);
  const { data: materials } = useListMaterials();

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

  // Category lives in the route path; selecting a category navigates there while
  // preserving the other active filters. Unchecking returns to the full Shop.
  function setCategory(v: string) {
    const next = new URLSearchParams(search);
    next.delete("category");
    next.delete("page");
    const qs = next.toString();
    const base = v ? `/shop/category/${v}` : "/shop";
    setLocation(qs ? `${base}?${qs}` : base);
  }

  const base = params?.slug ? `/shop/category/${params.slug}` : "/shop";
  function clearAll() {
    setLocation(base);
  }

  const activeFilterCount =
    (isOnlineOnly ? 1 : 0) +
    (!isCategoryFixed && activeCategory ? 1 : 0) +
    (activeManufacturer ? 1 : 0) +
    (activeMaterial ? 1 : 0) +
    (activeFinish ? 1 : 0) +
    (activeName ? 1 : 0);

  const categoryOptions = useMemo<FilterOption[]>(
    () => (categories ?? []).map((c) => ({ value: c.slug, label: c.name })),
    [categories],
  );
  const manufacturerOptions = useMemo<FilterOption[]>(
    () => (manufacturers ?? []).map((m) => ({ value: m.slug, label: m.name })),
    [manufacturers],
  );
  const materialOptions = useMemo<FilterOption[]>(
    () => (materials ?? []).map((m) => ({ value: m.slug, label: m.name })),
    [materials],
  );
  const finishOptions = useMemo<FilterOption[]>(
    () => (finishes ?? []).map((f) => ({ value: f, label: f })),
    [finishes],
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
            value={activeName}
            onChange={(e) => updateSearch({ q: e.target.value || null, page: "1" })}
            className="w-full border border-input bg-background rounded-sm pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
          {activeName && (
            <button
              type="button"
              onClick={() => updateSearch({ q: null, page: "1" })}
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
        selected={isOnlineOnly ? "online" : ""}
        onChange={(v) => updateSearch({ online: v ? "true" : null, page: "1" })}
      />
      <CheckboxGroup
        label="Category"
        options={categoryOptions}
        selected={activeCategory}
        onChange={setCategory}
      />
      <CheckboxGroup
        label="Brand"
        options={manufacturerOptions}
        selected={activeManufacturer}
        onChange={(v) => updateSearch({ manufacturer: v || null, page: "1" })}
      />
      <CheckboxGroup
        label="Material"
        options={materialOptions}
        selected={activeMaterial}
        onChange={(v) => updateSearch({ material: v || null, page: "1" })}
      />
      <CheckboxGroup
        label="Frame Finish"
        options={finishOptions}
        selected={activeFinish}
        onChange={(v) => updateSearch({ finish: v || null, page: "1" })}
      />
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
          {!isCategoryFixed && activeCategory && (
            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
              {categoryOptions.find((c) => c.value === activeCategory)?.label ?? activeCategory}
              <button type="button" onClick={() => setCategory("")}>
                <X className="size-3" />
              </button>
            </span>
          )}
          {activeManufacturer && (
            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
              {manufacturerOptions.find((m) => m.value === activeManufacturer)?.label ?? activeManufacturer}
              <button type="button" onClick={() => updateSearch({ manufacturer: null, page: "1" })}>
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
          {activeFinish && (
            <span className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs px-3 py-1 rounded-full">
              Finish: {activeFinish}
              <button type="button" onClick={() => updateSearch({ finish: null, page: "1" })}>
                <X className="size-3" />
              </button>
            </span>
          )}
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
      </div>
    </div>
  );
}
