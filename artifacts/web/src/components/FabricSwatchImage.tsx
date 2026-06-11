import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type FabricSwatchData = {
  name: string;
  itemNumber: string;
  manufacturerName?: string | null;
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
  if (!fabric.swatchImageUrl) {
    return (
      <div className="aspect-square bg-muted border border-border overflow-hidden relative">
        <div
          className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-widest text-muted-foreground/70 text-center px-2"
          aria-label="Swatch image coming soon"
        >
          {placeholder}
        </div>
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
        <div className="text-sm text-muted-foreground space-y-0.5">
          {fabric.manufacturerName && <p>{fabric.manufacturerName}</p>}
          <p>{fabric.itemNumber}</p>
          {fabric.grade && (
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground/80">
              Grade {fabric.grade}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
