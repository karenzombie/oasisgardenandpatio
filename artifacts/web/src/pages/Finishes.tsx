import { Link } from "wouter";
import { useMemo } from "react";
import { useListCatalogManufacturerFinishes } from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";

type FinishItem = {
  id: number;
  name: string;
  itemNumber: string | null;
  manufacturerName: string;
  imageUrl: string | null;
  description: string | null;
};

function FinishSwatch({ finish }: { finish: FinishItem }) {
  return (
    <div className="group">
      <div className="aspect-square bg-muted border border-border overflow-hidden relative">
        {finish.imageUrl ? (
          <img
            src={finish.imageUrl}
            alt={finish.name}
            className="w-full h-full object-cover"
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
      <p className="mt-2 text-sm text-foreground line-clamp-1" title={finish.name}>
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
    </div>
  );
}

export default function Finishes() {
  const { data, isLoading, error } = useListCatalogManufacturerFinishes();

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
        by our manufacturers. Choose the finish that best suits your space, or
        stop by the showroom to see and feel each sample in person.
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
                  <FinishSwatch key={f.id} finish={f} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

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
