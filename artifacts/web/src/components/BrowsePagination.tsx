import { useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";

interface BrowsePaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  className?: string;
}

const MAX_DOTS = 7;

export function BrowsePagination({
  page,
  totalPages,
  onPageChange,
  className = "",
}: BrowsePaginationProps) {
  const [goValue, setGoValue] = useState("");

  if (totalPages <= 1) return null;

  let start = 1;
  if (totalPages > MAX_DOTS) {
    const half = Math.floor(MAX_DOTS / 2);
    start = Math.max(1, Math.min(page - half, totalPages - MAX_DOTS + 1));
  }
  const end = Math.min(totalPages, start + MAX_DOTS - 1);
  const dots: number[] = [];
  for (let n = start; n <= end; n++) dots.push(n);

  function submitGo(e: FormEvent) {
    e.preventDefault();
    const n = Number(goValue);
    if (Number.isInteger(n) && n >= 1 && n <= totalPages) {
      onPageChange(n);
      setGoValue("");
    }
  }

  return (
    <nav
      className={`mt-12 flex flex-col items-center gap-4 ${className}`}
      aria-label="Pagination"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-input rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors"
        >
          <ArrowLeft className="size-4" /> Previous
        </button>
        <div className="flex items-center gap-1.5">
          {dots.map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`Go to page ${n}`}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPageChange(n)}
              className={`h-2.5 rounded-full transition-all ${
                n === page
                  ? "w-6 bg-primary"
                  : "w-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/60"
              }`}
            />
          ))}
        </div>
        <button
          type="button"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm border border-input rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-muted transition-colors"
        >
          Next <ArrowRight className="size-4" />
        </button>
      </div>
      <form
        onSubmit={submitGo}
        className="flex items-center gap-2 text-sm text-muted-foreground"
      >
        <span>Go to page</span>
        <input
          type="number"
          min={1}
          max={totalPages}
          value={goValue}
          onChange={(e) => setGoValue(e.target.value)}
          placeholder={String(page)}
          aria-label="Page number"
          className="w-16 px-2 py-1.5 text-center border border-input rounded-md text-foreground bg-background"
        />
        <button
          type="submit"
          className="px-3 py-1.5 border border-input rounded-md hover:bg-muted transition-colors text-foreground"
        >
          Go
        </button>
        <span>of {totalPages}</span>
      </form>
    </nav>
  );
}
