import { Link } from "wouter";
import { useMemo, useState } from "react";
import { useListCatalogFabrics } from "@workspace/api-client-react";
import { Spinner } from "@/components/ui/spinner";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ChevronDown, X, Check } from "lucide-react";

type FabricItem = {
  id: number;
  name: string;
  itemNumber: string;
  manufacturerName: string;
  manufacturerLogoUrl: string | null;
  swatchImageUrl: string | null;
  grade: string | null;
  colorFamily: string | null;
};

function FabricSwatch({ fabric }: { fabric: FabricItem }) {
  return (
    <div className="group">
      {fabric.swatchImageUrl ? (
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              className="block w-full aspect-square bg-muted border border-border overflow-hidden relative cursor-zoom-in focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label={`Enlarge ${fabric.name} swatch`}
            >
              <img
                src={fabric.swatchImageUrl}
                alt={fabric.name}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            </button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">
                {fabric.name}
              </DialogTitle>
            </DialogHeader>
            <div className="bg-muted border border-border overflow-hidden">
              <img
                src={fabric.swatchImageUrl}
                alt={fabric.name}
                className="w-full h-auto object-contain"
              />
            </div>
            <div className="text-sm text-muted-foreground space-y-0.5">
              <p>{fabric.manufacturerName}</p>
              <p>{fabric.itemNumber}</p>
              {fabric.grade && (
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                  Grade {fabric.grade}
                </p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      ) : (
        <div className="aspect-square bg-muted border border-border overflow-hidden relative">
          <div
            className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground/70 text-center px-2"
            aria-label="Swatch image coming soon"
          >
            Swatch coming soon
          </div>
        </div>
      )}
      <p className="mt-2 text-sm text-foreground line-clamp-1" title={fabric.name}>
        {fabric.name}
      </p>
      <p className="text-xs text-muted-foreground">{fabric.itemNumber}</p>
      {fabric.grade && (
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80 mt-0.5">
          Grade {fabric.grade}
        </p>
      )}
    </div>
  );
}

export default function Fabrics() {
  const [selectedColors, setSelectedColors] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useListCatalogFabrics();

  const toggleColor = (c: string) => {
    setSelectedColors((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  };

  const removeColor = (c: string) => {
    setSelectedColors((prev) => {
      const next = new Set(prev);
      next.delete(c);
      return next;
    });
  };

  const colorFamilies = useMemo(() => {
    const set = new Set<string>();
    for (const f of data?.fabrics ?? []) {
      if (f.colorFamily) set.add(f.colorFamily);
    }
    return Array.from(set).sort();
  }, [data]);

  const grouped = useMemo(() => {
    const m = new Map<string, FabricItem[]>();
    const activeColors = new Set(
      Array.from(selectedColors).map((c) => c.toLowerCase()),
    );
    for (const f of data?.fabrics ?? []) {
      if (
        activeColors.size > 0 &&
        !activeColors.has((f.colorFamily ?? "").toLowerCase())
      ) {
        continue;
      }
      const key = f.manufacturerName || "Other";
      const list = m.get(key) ?? [];
      list.push(f);
      m.set(key, list);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [data, selectedColors]);

  const selected = Array.from(selectedColors);

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
      <p className="text-muted-foreground mb-8 max-w-2xl">
        We work exclusively with solution-dyed performance fabrics from the
        leading outdoor mills. Browse the library below or stop by our showroom
        to see and feel the full range of patterns and weights.
      </p>

      {/* Color family filter — multi-select popover */}
      {colorFamilies.length > 0 && (
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs uppercase tracking-widest text-muted-foreground shrink-0 mr-1">
              Filter by color
            </p>

            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="flex items-center gap-1.5 h-8 px-3 text-xs border border-border hover:border-foreground/40 transition-colors bg-background text-foreground"
                >
                  {selected.length === 0
                    ? "Select colors"
                    : `${selected.length} selected`}
                  <ChevronDown className="size-3 text-muted-foreground" />
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-56 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Search colors..." className="h-8 text-xs" />
                  <CommandList>
                    <CommandEmpty>No colors found.</CommandEmpty>
                    <CommandGroup>
                      {colorFamilies.map((c) => {
                        const active = selectedColors.has(c);
                        return (
                          <CommandItem
                            key={c}
                            value={c}
                            onSelect={() => toggleColor(c)}
                            className="text-xs cursor-pointer"
                          >
                            <Check
                              className={`size-3 mr-2 shrink-0 ${active ? "opacity-100" : "opacity-0"}`}
                            />
                            {c}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            {/* Active color tags */}
            {selected.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 h-8 px-2.5 text-xs bg-foreground text-background"
              >
                {c}
                <button
                  type="button"
                  onClick={() => removeColor(c)}
                  className="ml-0.5 hover:opacity-70 transition-opacity"
                  aria-label={`Remove ${c} filter`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}

            {selected.length > 1 && (
              <button
                type="button"
                onClick={() => setSelectedColors(new Set())}
                className="text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground underline-offset-4 hover:underline ml-1"
              >
                Clear all
              </button>
            )}
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-16 text-center">
          <Spinner className="size-8 text-primary mx-auto" />
        </div>
      ) : error ? (
        <p className="text-destructive">
          Could not load fabrics. Please try again.
        </p>
      ) : grouped.length === 0 ? (
        <p className="text-muted-foreground">
          {selectedColors.size === 0
            ? "No fabrics available yet."
            : `No fabrics match the selected color${selectedColors.size > 1 ? "s" : ""}.`}
        </p>
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
