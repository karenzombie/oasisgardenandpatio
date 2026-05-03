import { Link } from "wouter";
import { useMemo } from "react";
import { useListCatalogFabrics } from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";

type FabricItem = {
  id: number;
  name: string;
  itemNumber: string;
  manufacturerName: string;
  swatchImageUrl: string | null;
};

function FabricSwatch({ fabric }: { fabric: FabricItem }) {
  return (
    <div className="group">
      <div className="aspect-square bg-muted border border-border overflow-hidden relative">
        {fabric.swatchImageUrl ? (
          <img
            src={fabric.swatchImageUrl}
            alt={fabric.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground/70 text-center px-2"
            aria-label="Swatch image coming soon"
          >
            Swatch coming soon
          </div>
        )}
      </div>
      <p className="mt-2 text-sm text-foreground line-clamp-1" title={fabric.name}>
        {fabric.name}
      </p>
      <p className="text-xs text-muted-foreground">{fabric.itemNumber}</p>
    </div>
  );
}

export default function Fabrics() {
  const { data, isLoading, error } = useListCatalogFabrics();

  const grouped = useMemo(() => {
    const m = new Map<string, FabricItem[]>();
    for (const f of data?.fabrics ?? []) {
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
        <span className="text-foreground">Fabrics</span>
      </nav>

      <h1 className="font-serif text-4xl md:text-5xl mb-4">Fabrics</h1>
      <p className="text-muted-foreground mb-12 max-w-2xl">
        We work exclusively with solution-dyed performance fabrics from the
        leading outdoor mills. Browse the library below or stop by our showroom
        to see and feel the full range of patterns and weights.
      </p>

      {isLoading ? (
        <div className="py-16 text-center">
          <Spinner className="size-8 text-primary mx-auto" />
        </div>
      ) : error ? (
        <p className="text-destructive">
          Could not load fabrics. Please try again.
        </p>
      ) : grouped.length === 0 ? (
        <p className="text-muted-foreground">No fabrics available yet.</p>
      ) : (
        <div className="space-y-16">
          {grouped.map(([brand, list]) => (
            <section key={brand}>
              <div className="flex items-baseline justify-between mb-6 border-b border-border pb-2">
                <h2 className="font-serif text-2xl">{brand}</h2>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">
                  {list.length} {list.length === 1 ? "fabric" : "fabrics"}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                {list.map((f) => (
                  <FabricSwatch key={f.id} fabric={f} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <div className="mt-20 prose max-w-none text-foreground/80">
        <h2 className="font-serif">Care</h2>
        <ul>
          <li>Brush off loose dirt regularly.</li>
          <li>Spot clean with mild soap and water.</li>
          <li>
            For deeper cleaning, remove covers and machine wash on cold, then
            air dry.
          </li>
          <li>
            Store cushions indoors during prolonged wet, smoky, or freezing
            weather to extend their life.
          </li>
        </ul>

        <h2 className="font-serif">Warranty</h2>
        <p>
          Performance fabrics typically carry a 5-year limited warranty against
          fading. See our{" "}
          <Link href="/warranty" className="text-primary">
            warranty page
          </Link>{" "}
          for full details.
        </p>
      </div>
    </div>
  );
}
