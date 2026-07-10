import { Link, useSearch } from "wouter";
import { useEffect, useMemo, useState } from "react";
import ssBallAndVertex from "@assets/Stainless_Steel_Ball_and_Vertex_1782777980447.jpg";
import tpuBallColors from "@assets/TPU_Ball_all_frame_colors_1782777980448.jpg";
import tpuVertexColors from "@assets/TPU_Vertex_all_frame_colors_1782777980448.jpg";
import chromeBall from "@assets/Chrome_Ball_1782777980448.png";
import chromeVertex from "@assets/Chrome_Vertex_1782777980448.png";
import ssVertex from "@assets/Stainless_Steel_Vertex_1782777980448.jpg";
import {
  useListCatalogManufacturerFinishes,
  useListCatalogFinishProducts,
  getListCatalogFinishProductsQueryKey,
} from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type FinishItem = {
  id: number;
  name: string;
  itemNumber: string | null;
  manufacturerName: string;
  manufacturerLogoUrl: string | null;
  imageUrl: string | null;
  description: string | null;
  collection?: string | null;
};

// Maps stored description values to a display label.
// If a description isn't listed here its value is used as-is as the heading.
const FINISH_TYPE_LABELS: Record<string, string> = {
  "Frame Finish": "Frame Finishes",
  "Table Top Tile": "Table Top Tiles",
};

// Explicit sub-group ordering, scoped per manufacturer so it never disturbs
// other brands (whose sub-groups stay alphabetical). Keys are the raw
// sub-group key (collection ?? description).
const SUBGROUP_ORDER: Record<string, Record<string, number>> = {
  "Frankford Umbrellas": {
    "Frame Finish": 0,
    Valances: 1,
    "Base Plate Top Colors": 2,
  },
  Homecrest: {
    "Frame Finish": 0,
    "Woven Finishes": 1,
    "Table Finishes": 2,
  },
};

// Sub-groups where each swatch belongs to a named pattern/weave (stored in
// `description`) that should render above the color name, e.g. "ROWAN" /
// "Fog Greige". Keyed by manufacturer name -> sub-group key (collection).
const PATTERN_LABEL_SUBGROUPS: Record<string, string[]> = {
  Homecrest: ["Woven Finishes"],
};

// Manufacturers whose no-image finish swatches show a custom explanatory
// message instead of the default "Sample coming soon" placeholder — used
// when the manufacturer's colors vary by product rather than being a fixed
// swatch (e.g. Shoreline, where the same color name renders differently
// per item).
const CUSTOM_NO_IMAGE_MESSAGE: Record<string, string> = {
  Shoreline:
    "Available colors differ from item to item. Visit a product's page to see its specific color options.",
};

function FinishSwatch({
  finish,
  onClick,
  showPatternLabel,
}: {
  finish: FinishItem;
  onClick: () => void;
  showPatternLabel?: boolean;
}) {
  const customMessage = CUSTOM_NO_IMAGE_MESSAGE[finish.manufacturerName];
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-sm"
      data-testid={`finish-swatch-${finish.id}`}
    >
      <div className="aspect-square bg-muted border border-border overflow-hidden relative transition-transform group-hover:scale-[1.02]">
        {finish.imageUrl ? (
          <img
            src={finish.imageUrl}
            alt={finish.name}
            className="w-full h-full object-cover object-top"
          />
        ) : customMessage ? (
          <div
            className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground/70 text-center px-2"
            aria-label={customMessage}
          >
            {customMessage}
          </div>
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground/70 text-center px-2"
            aria-label="Finish image coming soon"
          >
            Sample coming soon
          </div>
        )}
      </div>

      {finish.manufacturerLogoUrl && (
        <div className="mt-1.5 h-5 flex items-center">
          <img
            src={finish.manufacturerLogoUrl}
            alt={finish.manufacturerName}
            className="h-full w-auto object-contain opacity-70"
          />
        </div>
      )}

      {showPatternLabel && finish.description && (
        <p className="mt-1.5 text-xs font-medium uppercase tracking-widest text-foreground">
          {finish.description}
        </p>
      )}
      <p
        className={`text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors ${
          showPatternLabel ? "" : "mt-1"
        }`}
        title={finish.name}
      >
        {finish.name}
      </p>
      {finish.itemNumber && (
        <p className="text-xs text-muted-foreground">{finish.itemNumber}</p>
      )}
      {!showPatternLabel && finish.description && !FINISH_TYPE_LABELS[finish.description] && !finish.collection && (
        <p className="text-xs text-muted-foreground/80 line-clamp-2 mt-0.5">
          {finish.description}
        </p>
      )}
    </button>
  );
}

function FinishProductsDialog({
  finish,
  onClose,
}: {
  finish: FinishItem | null;
  onClose: () => void;
}) {
  const open = finish !== null;
  const finishId = finish?.id ?? 0;
  const { data, isLoading, error } = useListCatalogFinishProducts(finishId, {
    query: {
      enabled: open,
      queryKey: getListCatalogFinishProductsQueryKey(finishId),
    },
  });
  const products = data?.products ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start gap-4">
            {finish?.imageUrl && (
              <img
                src={finish.imageUrl}
                alt={finish.name}
                className="w-20 h-20 object-cover object-top bg-muted border border-border rounded-sm shrink-0"
              />
            )}
            <div className="min-w-0">
              <DialogTitle className="font-serif text-2xl">
                {finish?.name}
              </DialogTitle>
              <DialogDescription>
                {finish?.manufacturerName}
                {finish?.itemNumber ? ` · ${finish.itemNumber}` : ""}
              </DialogDescription>
              {finish?.description && !FINISH_TYPE_LABELS[finish.description] && (
                <p className="text-sm text-foreground/80 mt-2 leading-relaxed">
                  {finish.description}
                </p>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="mt-2">
          {isLoading ? (
            <div className="py-10 text-center">
              <Spinner className="size-6 text-primary mx-auto" />
            </div>
          ) : error ? (
            <p className="text-destructive text-sm">
              Could not load products. Please try again.
            </p>
          ) : products.length === 0 ? (
            <p className="text-muted-foreground text-sm py-6 text-center">
              No products currently list this finish.
            </p>
          ) : (
            <>
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-4">
                {products.length}{" "}
                {products.length === 1 ? "product uses" : "products use"} this
                finish
              </p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {products.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={`/shop/${p.slug}`}
                      onClick={onClose}
                      className="flex items-center gap-3 p-2 border border-border rounded-sm hover:border-primary hover:bg-accent/40 transition-colors"
                      data-testid={`finish-product-${p.id}`}
                    >
                      <div className="w-14 h-14 bg-muted shrink-0 overflow-hidden rounded-sm">
                        {p.primaryImageUrl ? (
                          <img
                            src={p.primaryImageUrl}
                            alt={p.name}
                            className="w-full h-full object-cover"
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-foreground line-clamp-2">
                          {p.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.sku}
                        </p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {finish?.collection && finish.imageUrl && finish?.manufacturerName === "Couture Jardin" && (
          <div className="mt-4 border-t border-border pt-4">
            {finish.itemNumber && (
              <p className="text-xs uppercase tracking-widest text-muted-foreground mb-3">
                <span className="text-primary font-medium">{finish.itemNumber}</span>
              </p>
            )}
            <img
              src={finish.imageUrl}
              alt={finish.name}
              className="w-full h-auto object-contain rounded-sm"
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Finishes() {
  const { data, isLoading, error } = useListCatalogManufacturerFinishes();
  const [selected, setSelected] = useState<FinishItem | null>(null);
  const search = useSearch();
  const brandParam = useMemo(() => {
    const raw = new URLSearchParams(search).get("brand");
    return raw ? raw.trim() : null;
  }, [search]);
  const [openBrands, setOpenBrands] = useState<string[]>([]);

  const finishCollections = data?.finishCollections ?? [];

  const grouped = useMemo(() => {
    const m = new Map<string, FinishItem[]>();
    for (const f of data?.finishes ?? []) {
      const key = f.manufacturerName || "Other";
      const list = m.get(key) ?? [];
      list.push(f);
      m.set(key, list);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data]);

  // Deep-link: when arriving with ?brand=, auto-expand that manufacturer's
  // accordion (case-insensitive match) and scroll it into view.
  useEffect(() => {
    if (!brandParam || grouped.length === 0) return;
    const match = grouped.find(
      ([brand]) => brand.toLowerCase() === brandParam.toLowerCase(),
    );
    if (!match) return;
    const brand = match[0];
    setOpenBrands((prev) => (prev.includes(brand) ? prev : [...prev, brand]));
    const id = window.setTimeout(() => {
      document
        .getElementById(`finish-brand-${brand}`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(id);
  }, [brandParam, grouped]);

  return (
    <div className="container mx-auto px-4 py-12 max-w-6xl">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-foreground">
          Home
        </Link>
        <span>/</span>
        <Link href="/materials" className="hover:text-foreground">
          Materials
        </Link>
        <span>/</span>
        <span className="text-foreground">Finishes</span>
      </nav>

      <h1 className="font-serif text-4xl md:text-5xl mb-4">Finishes</h1>
      <p className="text-muted-foreground mb-12 max-w-2xl">
        Browse the available finish options offered by our manufacturers. Click
        any swatch to see the products it's offered on, or stop by the showroom
        to see and feel each sample in person.
      </p>

      {isLoading ? (
        <div className="py-16 text-center">
          <Spinner className="size-8 text-primary mx-auto" />
        </div>
      ) : error ? (
        <p className="text-destructive">
          Could not load finishes. Please try again.
        </p>
      ) : grouped.length === 0 ? (
        <p className="text-muted-foreground">No finishes available yet.</p>
      ) : (
        <Accordion
          type="multiple"
          value={openBrands}
          onValueChange={setOpenBrands}
          className="divide-y divide-border border-t border-border"
        >
          {grouped.map(([brand, list]) => {
            // Collections for this specific manufacturer (sorted by displayOrder)
            const brandCollections = finishCollections
              .filter((fc) => fc.manufacturerName === brand)
              .slice()
              .sort((a, b) => (a.displayOrder ?? 999) - (b.displayOrder ?? 999));

            // Sub-groups: use collection field when set, otherwise description.
            // This lets "Valances" (collection) appear alongside "Frame Finishes"
            // (description-keyed) without collapsing into separate per-item groups.
            const typeKeys = Array.from(
              new Set(list.map((f) => f.collection ?? f.description).filter(Boolean)),
            ) as string[];
            const hasSubGroups = typeKeys.length > 1;
            const subGroups: { label: string; items: FinishItem[] }[] =
              hasSubGroups
                ? typeKeys
                    .sort((a, b) => {
                      const order = SUBGROUP_ORDER[brand];
                      if (order) {
                        const d =
                          (order[a] ?? 999) - (order[b] ?? 999);
                        if (d !== 0) return d;
                      }
                      return (FINISH_TYPE_LABELS[a] ?? a).localeCompare(
                        FINISH_TYPE_LABELS[b] ?? b,
                      );
                    })
                    .map((key) => ({
                      label: FINISH_TYPE_LABELS[key] ?? key,
                      items: list.filter((f) => (f.collection ?? f.description) === key),
                    }))
                : [{ label: "", items: list }];

            return (
              <AccordionItem
                key={brand}
                value={brand}
                id={`finish-brand-${brand}`}
                className="border-b-0 scroll-mt-24"
              >
                <AccordionTrigger className="hover:no-underline py-5 group">
                  <div className="flex items-center gap-4">
                    {list[0]?.manufacturerLogoUrl && (
                      <img
                        src={list[0].manufacturerLogoUrl}
                        alt={brand}
                        className="h-7 w-auto object-contain shrink-0"
                      />
                    )}
                    <span className="font-serif text-2xl text-foreground">
                      {brand}
                    </span>
                    <span className="text-xs uppercase tracking-widest text-muted-foreground">
                      {list.length}{" "}
                      {list.length === 1 ? "finish" : "finishes"}
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent className="pb-8">
                  {brandCollections.length > 0 ? (
                    <div className="flex flex-col gap-4">
                      {brandCollections.map((fc) => (
                        <div key={fc.id}>
                          {fc.panelImageUrl ? (
                            <img
                              src={fc.panelImageUrl}
                              alt={fc.collectionName}
                              className="max-h-20 max-w-xs w-auto rounded-sm"
                            />
                          ) : (
                            <div className="w-full aspect-video bg-muted rounded-sm flex items-center justify-center">
                              <span className="text-xs text-muted-foreground uppercase tracking-widest">
                                {fc.collectionName}
                              </span>
                            </div>
                          )}
                          {list[0]?.manufacturerLogoUrl && (
                            <div className="mt-1.5 h-5 flex items-center">
                              <img
                                src={list[0].manufacturerLogoUrl}
                                alt={brand}
                                className="h-full w-auto object-contain opacity-70"
                              />
                            </div>
                          )}
                          <p className="mt-1 text-sm font-medium text-foreground">
                            {fc.collectionName}
                          </p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <>
                      {subGroups.map(({ label, items }) => (
                        <div key={label || "all"} className="mb-10 last:mb-0">
                          {label && (
                            <h3 className="text-sm font-medium uppercase tracking-widest text-muted-foreground mb-4">
                              {label}
                            </h3>
                          )}
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                            {items.map((f) => (
                              <FinishSwatch
                                key={f.id}
                                finish={f}
                                onClick={() => setSelected(f)}
                                showPatternLabel={
                                  PATTERN_LABEL_SUBGROUPS[brand]?.includes(label) ?? false
                                }
                              />
                            ))}
                          </div>
                        </div>
                      ))}
                      {brand === "Frankford Umbrellas" && (
                        <div className="mb-10 last:mb-0">
                          <h3 className="text-sm font-medium uppercase tracking-widest text-muted-foreground mb-4">
                            Finials
                          </h3>
                          {/* Hero — Stainless Steel Ball & Vertex combined shot */}
                          <div className="mb-5">
                            <img
                              src={ssBallAndVertex}
                              alt="Stainless Steel Ball and Vertex Finials"
                              className="w-full h-auto object-cover rounded-sm"
                            />
                            <p className="mt-2 text-sm text-foreground font-medium">Stainless Steel Ball &amp; Vertex</p>
                            <p className="text-xs text-muted-foreground">Mirror-polished stainless steel — sold separately</p>
                          </div>
                          {/* TPU in all frame colors — wide landscape panels */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
                            <div>
                              <img
                                src={tpuBallColors}
                                alt="TPU Ball Finial in all frame colors"
                                className="w-full h-auto object-cover rounded-sm"
                              />
                              <p className="mt-2 text-sm text-foreground font-medium">TPU Ball Finial</p>
                              <p className="text-xs text-muted-foreground">Available in all frame colors</p>
                            </div>
                            <div>
                              <img
                                src={tpuVertexColors}
                                alt="TPU Vertex Finial in all frame colors"
                                className="w-full h-auto object-cover rounded-sm"
                              />
                              <p className="mt-2 text-sm text-foreground font-medium">TPU Vertex Finial</p>
                              <p className="text-xs text-muted-foreground">Available in all frame colors</p>
                            </div>
                          </div>
                          {/* Premium individual finials */}
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div>
                              <img
                                src={chromeBall}
                                alt="Chrome Ball Finial"
                                className="w-full h-auto object-contain bg-muted rounded-sm p-4"
                              />
                              <p className="mt-2 text-sm text-foreground font-medium">Chrome Ball</p>
                              <p className="text-xs text-muted-foreground">High-gloss chrome finish</p>
                            </div>
                            <div>
                              <img
                                src={chromeVertex}
                                alt="Chrome Vertex Finial"
                                className="w-full h-auto object-contain bg-muted rounded-sm p-4"
                              />
                              <p className="mt-2 text-sm text-foreground font-medium">Chrome Vertex</p>
                              <p className="text-xs text-muted-foreground">High-gloss chrome finish</p>
                            </div>
                            <div>
                              <img
                                src={ssVertex}
                                alt="Stainless Steel Vertex Finial"
                                className="w-full h-auto object-cover rounded-sm"
                              />
                              <p className="mt-2 text-sm text-foreground font-medium">Stainless Steel Vertex</p>
                              <p className="text-xs text-muted-foreground">Mirror-polished stainless steel</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <FinishProductsDialog
        finish={selected}
        onClose={() => setSelected(null)}
      />

      <div className="mt-20 prose max-w-none text-foreground/80">
        <h2 className="font-serif">Care</h2>
        <p>
          Outdoor finishes are built for sun, wind, and weather. Wipe with mild
          soap and water and rinse thoroughly — avoid abrasive pads or solvent
          cleaners, which can dull the topcoat. See our{" "}
          <Link href="/warranty" className="text-primary">
            warranty page
          </Link>{" "}
          for coverage details.
        </p>
      </div>
    </div>
  );
}
