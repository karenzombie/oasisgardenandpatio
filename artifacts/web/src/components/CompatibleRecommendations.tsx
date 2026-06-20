import { useEffect, useState } from "react";
import { Link } from "wouter";
import { useListProductRecommendations } from "@workspace/api-client-react";

const RECOMMENDED_GREEN = "#2E5E35";
const INITIAL_VISIBLE = 4;

/**
 * Generic, data-driven "Compatible Recommendations" section. Given the current
 * product's SKU, it fetches compatible items (the API already filters to items
 * that are active + available for online purchase, and sorts the recommended
 * pick first). Renders nothing when there is nothing to show — no empty state.
 * Each card links to that item's own PDP; there is no inline add-to-cart.
 */
export function CompatibleRecommendations({ sku }: { sku: string }) {
  const { data } = useListProductRecommendations(sku);
  const [expanded, setExpanded] = useState(false);

  // Collapse back to the first 4 whenever we land on a different product so the
  // "Show all" reveal never leaks across PDP navigation in the SPA.
  useEffect(() => {
    setExpanded(false);
  }, [sku]);

  const items = data ?? [];
  if (items.length === 0) return null;

  const hasMore = items.length > INITIAL_VISIBLE;
  const visible = expanded ? items : items.slice(0, INITIAL_VISIBLE);

  return (
    <section className="mt-8 pt-6 border-t border-border">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-foreground mb-4">
        Compatible Recommendations – Click to Configure and Add to Cart
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {visible.map((item) => (
          <Link
            key={item.id}
            href={`/shop/${item.slug}`}
            className="group relative flex gap-4 items-center border border-border rounded-md bg-card p-3 transition-colors hover:border-foreground"
            style={
              item.isRecommended
                ? { borderColor: RECOMMENDED_GREEN }
                : undefined
            }
          >
            {item.isRecommended ? (
              <span
                className="absolute -top-2 left-3 text-[10px] font-semibold uppercase tracking-widest text-white px-2 py-0.5 rounded-sm"
                style={{ backgroundColor: RECOMMENDED_GREEN }}
              >
                Recommended
              </span>
            ) : null}
            <div className="h-20 w-20 shrink-0 overflow-hidden rounded-sm bg-muted">
              {item.primaryImageUrl ? (
                <img
                  src={item.primaryImageUrl}
                  alt={item.name}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : null}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground leading-snug group-hover:text-primary">
                {item.name}
              </p>
            </div>
          </Link>
        ))}
      </div>
      {hasMore && !expanded ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-4 text-sm text-primary hover:underline"
        >
          {`Show all ${items.length} options`}
        </button>
      ) : null}
    </section>
  );
}
