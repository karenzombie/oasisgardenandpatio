import { Link } from "wouter";
import { useMemo } from "react";
import { useListCatalogFabrics } from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

type FabricItem = {
  id: number;
  name: string;
  itemNumber: string;
  manufacturerName: string;
  manufacturerLogoUrl: string | null;
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
        <Accordion type="multiple" className="divide-y divide-border border-t border-border">
          {grouped.map(([brand, list]) => (
            <AccordionItem key={brand} value={brand} className="border-b-0">
              <AccordionTrigger className="hover:no-underline py-5">
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
                    {list.length === 1 ? "fabric" : "fabrics"}
                  </span>
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-8">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-5">
                  {list.map((f) => (
                    <FabricSwatch key={f.id} fabric={f} />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      )}

      <div className="mt-20 bg-muted/40 border border-border rounded-lg p-6 max-w-2xl">
        <h2 className="font-serif text-xl mb-3">Care &amp; Cleaning — Sunbrella</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Keep your fabrics looking their best by addressing messes and spills
          soon after they occur. Brush off dirt and debris before it becomes
          embedded in the fabric. The quicker you clean spills, the easier they
          can be to remove.
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex gap-2">
            <span className="text-foreground/40 select-none">—</span>
            Blot (don't rub) liquid spills with a clean, dry cloth.
          </li>
          <li className="flex gap-2">
            <span className="text-foreground/40 select-none">—</span>
            For oil-based spills, apply an absorbent such as cornstarch, then
            remove with a straight edge.
          </li>
          <li className="flex gap-2">
            <span className="text-foreground/40 select-none">—</span>
            Spray on a mild cleaning solution of soap and water or use
            Sunbrella Clean™ Multi-Purpose Fabric Cleaner.
          </li>
          <li className="flex gap-2">
            <span className="text-foreground/40 select-none">—</span>
            Rinse the fabric thoroughly to remove all soap residue.
          </li>
          <li className="flex gap-2">
            <span className="text-foreground/40 select-none">—</span>
            Always allow Sunbrella fabrics to air dry.
          </li>
          <li className="flex gap-2">
            <span className="text-foreground/40 select-none">—</span>
            If a stubborn oil-based stain persists after cleaning, use
            Sunbrella Extract™ Oil Based Stain Remover or treat with a strong
            degreaser and rinse thoroughly.
          </li>
        </ul>
      </div>

      <div className="mt-10 prose max-w-none text-foreground/80">
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
