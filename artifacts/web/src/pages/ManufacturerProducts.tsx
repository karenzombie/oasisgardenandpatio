import { Link, useRoute, useLocation, useSearch } from "wouter";
import { useMemo } from "react";
import { X, SlidersHorizontal } from "lucide-react";
import {
  useListCatalogProducts,
  useListManufacturers,
  getListCatalogProductsQueryKey,
} from "@workspace/api-client-react";
import type { CatalogProduct } from "@workspace/api-client-react";
import { getBrandLogo } from "@/lib/brandLogos";
import { WishlistButton } from "@/components/WishlistButton";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

const PAGE_SIZE_API = 60;
const PAGE_SIZE_DISPLAY = 24;

/**
 * For each product name, find the longest prefix (1–N-1 words) shared by at
 * least 2 products. That shared prefix is the "collection".
 */
function buildCollectionMap(names: string[]): Map<string, string> {
  const prefixCount = new Map<string, number>();
  for (const name of names) {
    const words = name.split(" ");
    for (let len = 1; len < words.length; len++) {
      const prefix = words.slice(0, len).join(" ");
      prefixCount.set(prefix, (prefixCount.get(prefix) ?? 0) + 1);
    }
  }

  const validPrefixes = [...prefixCount.entries()]
    .filter(([, count]) => count >= 2)
    .map(([prefix]) => prefix)
    .sort((a, b) => b.length - a.length);

  const result = new Map<string, string>();
  for (const name of names) {
    const words = name.split(" ");
    let match = "";
    for (let len = words.length - 1; len >= 1; len--) {
      const prefix = words.slice(0, len).join(" ");
      if (validPrefixes.includes(prefix)) {
        match = prefix;
        break;
      }
    }
    result.set(name, match);
  }
  return result;
}

function deriveType(
  product: CatalogProduct,
  collectionMap: Map<string, string>,
): string {
  if (product.categoryName) return product.categoryName;
  const collection = collectionMap.get(product.name) ?? "";
  if (collection && product.name.startsWith(collection)) {
    return product.name.slice(collection.length).trim();
  }
  return "";
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

  const { data: page1Data, isLoading: loading1 } = useListCatalogProducts({
    manufacturerSlug: slug,
    sort: "name_asc",
    page: 1,
    pageSize: PAGE_SIZE_API,
  });

  const total = page1Data?.total ?? 0;

  const p2Params = { manufacturerSlug: slug, sort: "name_asc" as const, page: 2, pageSize: PAGE_SIZE_API };
  const { data: page2Data, isLoading: loading2 } = useListCatalogProducts(
    p2Params,
    { query: { enabled: total > PAGE_SIZE_API, queryKey: getListCatalogProductsQueryKey(p2Params) } },
  );

  const p3Params = { manufacturerSlug: slug, sort: "name_asc" as const, page: 3, pageSize: PAGE_SIZE_API };
  const { data: page3Data, isLoading: loading3 } = useListCatalogProducts(
    p3Params,
    { query: { enabled: total > PAGE_SIZE_API * 2, queryKey: getListCatalogProductsQueryKey(p3Params) } },
  );

  const isLoading =
    loading1 ||
    (total > PAGE_SIZE_API && loading2) ||
    (total > PAGE_SIZE_API * 2 && loading3);

  const allProducts = useMemo<CatalogProduct[]>(() => {
    return [
      ...(page1Data?.products ?? []),
      ...(page2Data?.products ?? []),
      ...(page3Data?.products ?? []),
    ];
  }, [page1Data, page2Data, page3Data]);

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

  const types = useMemo(() => {
    const set = new Set<string>();
    for (const p of allProducts) {
      const t = deriveType(p, collectionMap);
      if (t) set.add(t);
    }
    return [...set].sort();
  }, [allProducts, collectionMap]);

  const filtered = useMemo(() => {
    return allProducts.filter((p) => {
      if (activeCollection) {
        if ((collectionMap.get(p.name) ?? "") !== activeCollection) return false;
      }
      if (activeType) {
        if (deriveType(p, collectionMap) !== activeType) return false;
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

  const activeFilterCount = (activeCollection ? 1 : 0) + (activeType ? 1 : 0);
  const brandLogo = getBrandLogo(manufacturer?.name ?? "");
  const displayName =
    manufacturer?.name ?? slug.replace(/-/g, " ");

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
          {isLoading
            ? "Loading…"
            : `${totalFiltered} ${totalFiltered === 1 ? "product" : "products"}`}
        </p>
      </div>

      {!isLoading && (collections.length > 0 || types.length > 0) && (
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

          <div className="grid gap-5 sm:grid-cols-2">
            {collections.length > 0 && (
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
            )}
            {types.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-xs uppercase tracking-widest text-muted-foreground block">
                  Type
                </label>
                <select
                  value={activeType}
                  onChange={(e) =>
                    updateSearch({ type: e.target.value || null, page: "1" })
                  }
                  className={selectClass}
                >
                  <option value="">All types</option>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

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
                  Type: {activeType}
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
              <Link key={p.id} href={`/shop/${p.slug}`} className="group block">
                <div className="relative aspect-square bg-card overflow-hidden mb-3 border border-border">
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
                <div className="text-center">
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
