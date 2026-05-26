import { Link } from "wouter";
import { useMemo, useState } from "react";
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

type FinishItem = {
  id: number;
  name: string;
  itemNumber: string | null;
  manufacturerName: string;
  manufacturerLogoUrl: string | null;
  imageUrl: string | null;
  description: string | null;
};

function FinishSwatch({
  finish,
  onClick,
}: {
  finish: FinishItem;
  onClick: () => void;
}) {
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
            className="w-full h-full object-cover object-left"
          />
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

      <p
        className="mt-1 text-sm text-foreground line-clamp-1 group-hover:text-primary transition-colors"
        title={finish.name}
      >
        {finish.name}
      </p>
      {finish.itemNumber && (
        <p className="text-xs text-muted-foreground">{finish.itemNumber}</p>
      )}
      {finish.description && (
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
                className="w-20 h-20 object-cover object-left bg-muted border border-border rounded-sm shrink-0"
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
      </DialogContent>
    </Dialog>
  );
}

export default function Finishes() {
  const { data, isLoading, error } = useListCatalogManufacturerFinishes();
  const [selected, setSelected] = useState<FinishItem | null>(null);

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
        Frame finishes — powder coats, wood stains, and metal patinas — applied
        by our manufacturers. Click any swatch to see the products it's offered
        on, or stop by the showroom to see and feel each sample in person.
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
        <div className="space-y-16">
          {grouped.map(([brand, list]) => (
            <section key={brand}>
              <div className="flex items-baseline justify-between mb-6 border-b border-border pb-2">
                <h2 className="font-serif text-2xl">{brand}</h2>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {list.length} {list.length === 1 ? "finish" : "finishes"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                {list.map((f) => (
                  <FinishSwatch
                    key={f.id}
                    finish={f}
                    onClick={() => setSelected(f)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
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
