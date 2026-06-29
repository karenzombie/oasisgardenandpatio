import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Minimal structural shape of a fabric option. The richer CatalogFabricOption
// passed in from the product page is assignable to this.
export interface FabricSwatchOption {
  id: number;
  name: string;
  itemNumber: string;
  swatchImageUrl: string | null;
  grade: string | null;
  colorFamily: string | null;
}

interface FabricSwatchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Already-filtered list of selectable fabrics (same list the dropdown used). */
  fabrics: FabricSwatchOption[];
  selectedFabricId: number | null;
  /** Called when the customer confirms a selection. */
  onConfirm: (id: number) => void;
  /** When true, grade pills (with prices) are shown. */
  isGradeMode: boolean;
  /** Resolves the line price for a grade in the current configuration. */
  linePriceForGrade: (grade: string | null) => number | null;
  /** Money formatter shared with the rest of the product page. */
  formatPrice: (value: number) => string;
  /** Optional message to show when no fabrics are available yet. */
  emptyPrompt?: string | null;
  /** Dialog heading. Defaults to "Choose a fabric". */
  title?: string;
  /** Singular noun used in the footer count. Defaults to "fabric". */
  noun?: string;
  /** Plural noun used in the count and empty states. Defaults to "fabrics". */
  nounPlural?: string;
  /** Confirm button label. Defaults to "Select this {noun}". */
  confirmLabel?: string;
  /** Search input placeholder. */
  searchPlaceholder?: string;
  /**
   * Optional static, non-interactive thumbnail shown above the search bar
   * (e.g. an "assorted" reference image of the Aluminum Top Covers so the
   * customer can see what they look like). Purely decorative — it is not
   * selectable and does not affect the chosen option.
   */
  headerImageUrl?: string | null;
  /**
   * Optional per-option badge (e.g. a frame upcharge). Return a short string to
   * render as a price line below the option name (matching the fabric price
   * placement), or null for none.
   */
  optionBadge?: (id: number) => string | null;
}

const ALL = "__ALL__";

// Color family -> swatch dot color. Keys are lowercased color family names.
const COLOR_DOT: Record<string, string> = {
  beige: "#d8c9a8",
  black: "#1f1f1f",
  blue: "#2f5e9e",
  brown: "#6b4a2b",
  gold: "#c39a2b",
  gray: "#9aa0a6",
  grey: "#9aa0a6",
  green: "#3f7d4e",
  ivory: "#f2ecdc",
  navy: "#22304f",
  orange: "#d2792f",
  pink: "#d98aa6",
  purple: "#6b4a8a",
  red: "#9e2b2b",
  teal: "#2e8b8b",
  turquoise: "#3fb6b6",
  white: "#f7f7f4",
  yellow: "#d9b93f",
};

function colorDotStyle(family: string | null): React.CSSProperties {
  const key = (family ?? "").trim().toLowerCase();
  if (key === "multicolor") {
    return {
      backgroundImage:
        "conic-gradient(#9e2b2b, #d9b93f, #3f7d4e, #2f5e9e, #6b4a8a, #9e2b2b)",
    };
  }
  return { backgroundColor: COLOR_DOT[key] ?? "transparent" };
}

export function FabricSwatchDialog({
  open,
  onOpenChange,
  fabrics,
  selectedFabricId,
  onConfirm,
  isGradeMode,
  linePriceForGrade,
  formatPrice,
  emptyPrompt,
  title = "Choose a fabric",
  noun = "fabric",
  nounPlural = "fabrics",
  confirmLabel,
  searchPlaceholder = "Search by name or item number…",
  headerImageUrl,
  optionBadge,
}: FabricSwatchDialogProps) {
  const [gradeFilter, setGradeFilter] = useState<string>(ALL);
  const [colorFilter, setColorFilter] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [tempId, setTempId] = useState<number | null>(selectedFabricId);

  // Reset transient state whenever the dialog is (re)opened so it always
  // reflects the current confirmed selection.
  useEffect(() => {
    if (open) {
      setTempId(selectedFabricId);
      setGradeFilter(ALL);
      setColorFilter(ALL);
      setSearch("");
    }
  }, [open, selectedFabricId]);

  // Distinct grades present in the available fabrics, with their resolved price.
  const gradeOptions = useMemo(() => {
    const grades = new Set<string>();
    for (const f of fabrics) if (f.grade) grades.add(f.grade);
    return [...grades]
      .sort((a, b) => a.localeCompare(b))
      .map((grade) => ({ grade, price: linePriceForGrade(grade) }));
  }, [fabrics, linePriceForGrade]);

  // Distinct color families present in the available fabrics.
  const colorOptions = useMemo(() => {
    const colors = new Set<string>();
    for (const f of fabrics) if (f.colorFamily) colors.add(f.colorFamily);
    return [...colors].sort((a, b) => a.localeCompare(b));
  }, [fabrics]);

  const showGradeRow = isGradeMode && gradeOptions.length > 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return fabrics.filter((f) => {
      if (gradeFilter !== ALL && f.grade !== gradeFilter) return false;
      if (colorFilter !== ALL && f.colorFamily !== colorFilter) return false;
      if (q) {
        const hay = `${f.name} ${f.itemNumber}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [fabrics, gradeFilter, colorFilter, search]);

  const fabricPrice = (f: FabricSwatchOption): number | null =>
    isGradeMode ? linePriceForGrade(f.grade) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[calc(100vw-2rem)] p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-border">
          <DialogTitle className="font-serif text-xl">{title}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-4 space-y-4 border-b border-border">
          {/* Grade filter */}
          {showGradeRow ? (
            <div className="flex items-start gap-3">
              <span className="text-xs uppercase tracking-widest text-muted-foreground pt-2 shrink-0 w-14">
                Grade
              </span>
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  active={gradeFilter === ALL}
                  onClick={() => setGradeFilter(ALL)}
                >
                  All
                </FilterPill>
                {gradeOptions.map(({ grade, price }) => (
                  <FilterPill
                    key={grade}
                    active={gradeFilter === grade}
                    onClick={() => setGradeFilter(grade)}
                  >
                    {grade}
                    {price != null ? (
                      <span className="opacity-70"> · {formatPrice(price)}</span>
                    ) : null}
                  </FilterPill>
                ))}
              </div>
            </div>
          ) : null}

          {/* Color filter */}
          {colorOptions.length > 0 ? (
            <div className="flex items-start gap-3">
              <span className="text-xs uppercase tracking-widest text-muted-foreground pt-2 shrink-0 w-14">
                Color
              </span>
              <div className="flex flex-wrap gap-2">
                <FilterPill
                  active={colorFilter === ALL}
                  onClick={() => setColorFilter(ALL)}
                >
                  All
                </FilterPill>
                {colorOptions.map((color) => (
                  <FilterPill
                    key={color}
                    active={colorFilter === color}
                    onClick={() => setColorFilter(color)}
                  >
                    <span
                      className="h-3 w-3 rounded-full border border-border shrink-0"
                      style={colorDotStyle(color)}
                      aria-hidden="true"
                    />
                    {color}
                  </FilterPill>
                ))}
              </div>
            </div>
          ) : null}

          {/* Static reference thumbnail (decorative only, e.g. assorted
              Aluminum Top Cover colors). Not selectable or interactive. */}
          {headerImageUrl ? (
            <img
              src={headerImageUrl}
              alt=""
              aria-hidden="true"
              draggable={false}
              className="h-20 w-20 shrink-0 rounded-md border border-border object-cover pointer-events-none select-none"
            />
          ) : null}

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="w-full border border-input bg-background pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        {/* Swatch grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-10 text-center">
              {fabrics.length === 0
                ? (emptyPrompt ?? `No ${nounPlural} available.`)
                : `No ${nounPlural} match your filters.`}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {filtered.map((f) => {
                const price = fabricPrice(f);
                const isSel = tempId === f.id;
                const badge = optionBadge?.(f.id) ?? null;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setTempId(f.id)}
                    className={`text-left border bg-card transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
                      isSel
                        ? "border-primary ring-2 ring-primary"
                        : "border-border hover:border-foreground/40"
                    }`}
                  >
                    <div className="relative">
                      {f.swatchImageUrl ? (
                        <img
                          src={f.swatchImageUrl}
                          alt={f.name}
                          loading="lazy"
                          decoding="async"
                          className="aspect-square w-full object-cover"
                        />
                      ) : (
                        <div
                          className="aspect-square w-full"
                          style={colorDotStyle(f.colorFamily)}
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <div className="p-2">
                      <p className="text-sm font-medium leading-tight line-clamp-2">
                        {f.name}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {[f.grade ? `Grade ${f.grade}` : null, f.colorFamily]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      {price != null ? (
                        <p className="text-xs font-medium mt-0.5">
                          {formatPrice(price)}
                        </p>
                      ) : null}
                      {badge ? (
                        <p className="text-xs font-medium mt-0.5">{badge}</p>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 px-6 py-4 border-t border-border">
          <span className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? noun : nounPlural}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="border border-input bg-background px-4 py-2.5 text-sm hover:bg-muted focus:outline-none focus:ring-2 focus:ring-primary"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={tempId == null}
              onClick={() => {
                if (tempId != null) {
                  onConfirm(tempId);
                  onOpenChange(false);
                }
              }}
              className="bg-primary text-primary-foreground px-4 py-2.5 text-sm hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
            >
              {confirmLabel ?? `Select this ${noun}`}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-input bg-background hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}
