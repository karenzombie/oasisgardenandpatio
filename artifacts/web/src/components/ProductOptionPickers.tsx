import { useMemo, useState } from "react";
import { Palette, Check } from "lucide-react";
import type {
  CatalogFinishOption,
  CatalogFabricOption,
} from "@workspace/api-client-react";
import {
  FabricSwatchDialog,
  type FabricSwatchOption,
} from "@/components/FabricSwatchDialog";

/**
 * Configuration pickers shown on the PDP for products that cannot be bought
 * online (quote-only or not available online). The choices are purely
 * informational — they are attached to the wishlist entry so a sales agent
 * knows which finish/fabric/tile the customer was interested in. No pricing is
 * computed here.
 *
 * Every option type (Frame Finish, Fabric, Tile Color) uses the SAME pattern:
 * a labeled "Browse swatches" button that opens the shared FabricSwatchDialog
 * modal. Confirmed selections appear in a single recap block below the buttons,
 * matching the umbrella PDP recap. Pickers render only when the product offers
 * that option:
 * - Frame Finish: finishes whose description is "Frame Finish"
 * - Fabric: any fabric options
 * - Tile Color: finishes whose description is "Table Top Tile"
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
  const [frameOpen, setFrameOpen] = useState(false);
  const [fabricOpen, setFabricOpen] = useState(false);
  const [tileOpen, setTileOpen] = useState(false);

  const frameFinishes = useMemo(
    () =>
      finishes
        .filter((f) => /frame\s*finish/i.test(f.description ?? ""))
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [finishes],
  );
  const tileFinishes = useMemo(
    () =>
      finishes
        .filter((f) => /table\s*(?:top\s*)?tile|table\s*finish|HDPE\s*finish/i.test(f.description ?? ""))
        .sort((a, b) => a.displayOrder - b.displayOrder),
    [finishes],
  );
  // HDPE finishes live in the same picker bucket as table finishes but get
  // their own label/button text so customers know what they’re selecting.
  const tileLabel = tileFinishes.some((f) => /HDPE\s*finish/i.test(f.description ?? ""))
    ? "HDPE Finish"
    : "Tile Color";

  const frameSwatches = useMemo(
    () => frameFinishes.map(finishToSwatch),
    [frameFinishes],
  );
  const tileSwatches = useMemo(
    () => tileFinishes.map(finishToSwatch),
    [tileFinishes],
  );

  const selectedFrame = useMemo(
    () => frameFinishes.find((f) => f.id === selectedFinishId) ?? null,
    [frameFinishes, selectedFinishId],
  );
  const selectedTile = useMemo(
    () => tileFinishes.find((f) => f.id === selectedTableTopTileId) ?? null,
    [tileFinishes, selectedTableTopTileId],
  );
  const selectedFabric = useMemo(
    () => fabrics.find((f) => f.id === selectedFabricId) ?? null,
    [fabrics, selectedFabricId],
  );

  const hasAny =
    frameFinishes.length > 0 || fabrics.length > 0 || tileFinishes.length > 0;
  if (!hasAny) return null;

  const hasSelection = Boolean(selectedFrame || selectedTile || selectedFabric);

  return (
    <div className="space-y-5 mb-6">
      {frameFinishes.length > 0 ? (
        <BrowseButton
          label="Frame Finish"
          complete={Boolean(selectedFrame)}
          onClick={() => setFrameOpen(true)}
        />
      ) : null}

      {tileFinishes.length > 0 ? (
        <BrowseButton
          label={tileLabel}
          complete={Boolean(selectedTile)}
          onClick={() => setTileOpen(true)}
        />
      ) : null}

      {fabrics.length > 0 ? (
        <BrowseButton
          label="Fabric"
          complete={Boolean(selectedFabric)}
          onClick={() => setFabricOpen(true)}
        />
      ) : null}

      {hasSelection ? (
        <div className="flex flex-col gap-3 border border-border bg-muted/30 px-4 py-3">
          {selectedFrame ? (
            <RecapRow
              label="Frame Finish"
              value={selectedFrame.name}
              swatchImageUrl={selectedFrame.swatchImageUrl ?? null}
            />
          ) : null}
          {selectedTile ? (
            <RecapRow
              label={tileLabel}
              value={selectedTile.name}
              swatchImageUrl={selectedTile.swatchImageUrl ?? null}
            />
          ) : null}
          {selectedFabric ? (
            <RecapRow
              label="Fabric"
              value={`${selectedFabric.manufacturerName} · ${selectedFabric.name} (${selectedFabric.itemNumber})`}
              swatchImageUrl={selectedFabric.swatchImageUrl ?? null}
            />
          ) : null}
        </div>
      ) : null}

      {frameFinishes.length > 0 ? (
        <FabricSwatchDialog
          open={frameOpen}
          onOpenChange={setFrameOpen}
          fabrics={frameSwatches}
          selectedFabricId={selectedFinishId}
          onConfirm={(id) => onFinishChange(id)}
          isGradeMode={false}
          linePriceForGrade={() => null}
          formatPrice={(v) => `$${v.toFixed(2)}`}
          title="Choose a frame finish"
          noun="finish"
          nounPlural="finishes"
          searchPlaceholder="Search finishes by name…"
        />
      ) : null}

      {tileFinishes.length > 0 ? (
        <FabricSwatchDialog
          open={tileOpen}
          onOpenChange={setTileOpen}
          fabrics={tileSwatches}
          selectedFabricId={selectedTableTopTileId}
          onConfirm={(id) => onTableTopTileChange(id)}
          isGradeMode={false}
          linePriceForGrade={() => null}
          formatPrice={(v) => `$${v.toFixed(2)}`}
          title={`Choose a ${tileLabel.toLowerCase()}`}
          noun="tile"
          nounPlural="tiles"
          searchPlaceholder="Search tiles by name…"
        />
      ) : null}

      {fabrics.length > 0 ? (
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
      ) : null}
    </div>
  );
}

function finishToSwatch(f: CatalogFinishOption): FabricSwatchOption {
  return {
    id: f.id,
    name: f.name,
    itemNumber: "",
    swatchImageUrl: f.swatchImageUrl ?? null,
    grade: null,
    colorFamily: null,
  };
}

function BrowseButton({
  label,
  complete = false,
  onClick,
}: {
  label: string;
  complete?: boolean;
  onClick: () => void;
}) {
  return (
    <div>
      <p className="block text-sm uppercase tracking-widest text-muted-foreground mb-2">
        {label}
        {complete ? (
          <Check
            className="inline-block h-4 w-4 text-primary ml-1.5 align-middle"
            strokeWidth={3}
            aria-label="Selection complete"
            data-testid="selection-complete"
          />
        ) : null}
      </p>
      <button
        type="button"
        onClick={onClick}
        className="w-full sm:max-w-[460px] inline-flex items-center gap-2 border border-primary bg-primary text-primary-foreground px-4 py-2.5 text-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <Palette className="h-4 w-4" />
        Browse swatches
      </button>
    </div>
  );
}

function RecapRow({
  label,
  value,
  swatchImageUrl,
}: {
  label: string;
  value: string;
  swatchImageUrl: string | null;
}) {
  return (
    <div className="flex items-center gap-3">
      {swatchImageUrl ? (
        <img
          src={swatchImageUrl}
          alt={value}
          className="h-14 w-14 shrink-0 object-cover border border-border"
        />
      ) : (
        <div className="h-14 w-14 shrink-0" aria-hidden="true" />
      )}
      <div className="text-sm">
        <p className="text-muted-foreground">{label}</p>
        <p className="font-medium">{value}</p>
      </div>
    </div>
  );
}
