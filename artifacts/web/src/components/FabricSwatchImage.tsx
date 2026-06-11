import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { getBrandLogo } from "@/lib/brandLogos";

export type FabricSwatchData = {
  name: string;
  itemNumber: string;
  manufacturerName?: string | null;
  manufacturerLogoUrl?: string | null;
  swatchImageUrl: string | null;
  grade?: string | null;
};

export function FabricSwatchImage({
  fabric,
  placeholder = "Swatch coming soon",
}: {
  fabric: FabricSwatchData;
  placeholder?: string;
}) {
  const logoSrc =
    getBrandLogo(fabric.manufacturerName) ?? fabric.manufacturerLogoUrl ?? null;

  if (!fabric.swatchImageUrl) {
    return (
      <div className="aspect-square bg-muted border border-border overflow-hidden relative flex flex-col items-center justify-center gap-2 px-3">
        {logoSrc ? (
          <img
            src={logoSrc}
            alt={fabric.manufacturerName ?? ""}
            className="h-6 w-auto max-w-[70%] object-contain opacity-60"
          />
        ) : fabric.manufacturerName ? (
          <p className="text-[10px] uppercase tracking-widest text-muted-foreground/60 text-center font-medium">
            {fabric.manufacturerName}
          </p>
        ) : null}
        <p className="text-[9px] uppercase tracking-widest text-muted-foreground/50 text-center">
          {placeholder}
        </p>
      </div>
    );
  }

  return (
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
      <DialogContent className="max-w-md w-[90vw]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl pr-6">{fabric.name}</DialogTitle>
        </DialogHeader>
        <div className="bg-muted border border-border overflow-hidden">
          <img
            src={fabric.swatchImageUrl}
            alt={fabric.name}
            className="w-full object-contain max-h-[55vh]"
          />
        </div>
        <div className="flex items-center gap-3">
          {logoSrc && (
            <img
              src={logoSrc}
              alt={fabric.manufacturerName ?? ""}
              className="h-6 w-auto object-contain shrink-0"
            />
          )}
          <div className="text-sm text-muted-foreground space-y-0.5 min-w-0">
            {!logoSrc && fabric.manufacturerName && <p>{fabric.manufacturerName}</p>}
            <p>{fabric.itemNumber}</p>
            {fabric.grade && (
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
                Grade {fabric.grade}
              </p>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
