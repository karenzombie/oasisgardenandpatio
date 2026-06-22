import { useMemo, useState } from "react";
import { Palette } from "lucide-react";
import type {
  CatalogFinishOption,
  CatalogFabricOption,
} from "@workspace/api-client-react";
import { FabricSwatchDialog } from "@/components/FabricSwatchDialog";

/**
 * Configuration pickers shown on the PDP for products that cannot be bought
 * online (quote-only or not available online). The choices are purely
 * informational — they are attached to the wishlist entry so a sales agent
 * knows which finish/fabric/tile the customer was interested in. No pricing is
 * computed here.
 *
 * Pickers render only when the product actually offers that option:
 * - Frame Finish: finishes whose category is "Frame Finish"
 * - Fabric: any fabric options (reuses the swatch dialog in non-grade mode)
 * - Tile Color: finishes whose category is "Table Top Tile"
 */
export function ProductOptionPickers({
  finishes,
  fabrics,
  selectedFinishId,
  selectedFabricId,
  selectedTableTopTileId,
  onFinishChange,
  onFabricChange,
  onTableTopTileChange,
}: {
  finishes: CatalogFinishOption[];
  fabrics: CatalogFabricOption[];
  selectedFinishId: number | null;
  selectedFabricId: number | null;
  selectedTableTopTileId: number | null;
  onFinishChange: (id: number | null) => void;
  onFabricChange: (id: number | null) => void;
  onTableTopTileChange: (id: number | null) => void;
}) {
  const [fabricOpen, setFabricOpen] = useState(false);

  const frameFinishes = useMemo(
    () =>
      finishes
        .filter((f) => f.description === "Frame Finish")
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [finishes],
  );
  const tileFinishes = useMemo(
    () =>
      finishes
        .filter((f) => f.description === "Table Top Tile")
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [finishes],
  );

  const selectedFabric = useMemo(
    () => fabrics.find((f) => f.id === selectedFabricId) ?? null,
    [fabrics, selectedFabricId],
  );

  const hasAny =
    frameFinishes.length > 0 || fabrics.length > 0 || tileFinishes.length > 0;
  if (!hasAny) return null;

  return (
    <div className="space-y-5 mb-6">
      {frameFinishes.length > 0 ? (
        <SwatchPicker
          label="Frame Finish"
          options={frameFinishes}
          selectedId={selectedFinishId}
          onChange={onFinishChange}
        />
      ) : null}

      {fabrics.length > 0 ? (
        <div>
          <p className="text-sm uppercase tracking-widest text-muted-foreground mb-2">
            Fabric
            {selectedFabric ? (
              <span className="ml-2 normal-case tracking-normal text-foreground">
                {selectedFabric.name}
              </span>
            ) : null}
          </p>
          <button
            type="button"
            onClick={() => setFabricOpen(true)}
            className="inline-flex items-center gap-3 border border-input bg-background px-3 py-2.5 text-sm hover:border-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {selectedFabric?.swatchImageUrl ? (
              <img
                src={selectedFabric.swatchImageUrl}
                alt={selectedFabric.name}
                className="h-8 w-8 shrink-0 object-cover border border-border/50"
              />
            ) : (
              <Palette className="h-5 w-5 text-muted-foreground" />
            )}
            <span>
              {selectedFabric ? "Change fabric" : "Choose a fabric"}
            </span>
          </button>
          <FabricSwatchDialog
            open={fabricOpen}
            onOpenChange={setFabricOpen}
            fabrics={fabrics}
            selectedFabricId={selectedFabricId}
            onConfirm={(id) => onFabricChange(id)}
            isGradeMode={false}
            linePriceForGrade={() => null}
            formatPrice={(v) => `$${v.toFixed(2)}`}
          />
        </div>
      ) : null}

      {tileFinishes.length > 0 ? (
        <SwatchPicker
          label="Tile Color"
          options={tileFinishes}
          selectedId={selectedTableTopTileId}
          onChange={onTableTopTileChange}
        />
      ) : null}
    </div>
  );
}

function SwatchPicker({
  label,
  options,
  selectedId,
  onChange,
}: {
  label: string;
  options: CatalogFinishOption[];
  selectedId: number | null;
  onChange: (id: number | null) => void;
}) {
  const selected = options.find((o) => o.id === selectedId) ?? null;
  return (
    <div>
      <p className="text-sm uppercase tracking-widest text-muted-foreground mb-2">
        {label}
        {selected ? (
          <span className="ml-2 normal-case tracking-normal text-foreground">
            {selected.name}
          </span>
        ) : null}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => {
          const isSel = selectedId === o.id;
          return (
            <button
              key={o.id}
              type="button"
              onClick={() => onChange(isSel ? null : o.id)}
              className={`flex items-center gap-2 px-3 py-2 border text-sm transition-colors ${
                isSel
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input hover:border-foreground"
              }`}
            >
              {o.swatchImageUrl ? (
                <img
                  src={o.swatchImageUrl}
                  alt={o.name}
                  className="h-6 w-6 shrink-0 object-cover border border-border/50"
                />
              ) : null}
              {o.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
