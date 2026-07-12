import { Link } from "wouter";
import { useRef } from "react";
import {
  ArrowRight,
  Umbrella,
  CircleDot,
  Shield,
  Wrench,
  LayoutGrid,
  Package,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useListCategories,
  useListFeaturedProducts,
} from "@workspace/api-client-react";
import { BRAND_LOGOS, getBrandLogo } from "@/lib/brandLogos";
import heroImg from "@/assets/hero.png";
import { getCategoryImage } from "@/lib/categoryImages";

function formatMoney(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}

/**
 * Decorative icon for a ship-direct category row. Matched heuristically by
 * slug so the row set stays driven by the online-availability source of
 * truth (no hardcoded category list); unknown categories fall back to a
 * generic icon.
 */
function iconForCategory(slug: string): LucideIcon {
  const s = slug.toLowerCase();
  if (s.includes("umbrella-base") || s.includes("base")) return CircleDot;
  if (s.includes("umbrella")) return Umbrella;
  if (s.includes("cover")) return Shield;
  if (s.includes("rug")) return LayoutGrid;
  if (s.includes("part") || s.includes("replacement")) return Wrench;
  return Package;
}

export default function Home() {
  const { data: categories } = useListCategories();
  const { data: onlineCategories } = useListCategories({ onlineOnly: true });
  const { data: featuredProducts } = useListFeaturedProducts();
  const featured = featuredProducts ?? [];
  const carouselRef = useRef<HTMLDivElement>(null);
  const scrollFeatured = (dir: number) => {
    const el = carouselRef.current;
    if (!el) return;
    el.scrollBy({
      left: dir * Math.min(el.clientWidth * 0.8, 600),
      behavior: "smooth",
    });
  };

  const topLevelCategories = (categories?.filter(c => c.parentId === null) || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  const shipDirectCategories = onlineCategories ?? [];

  return (
    <div className="w-full">
      {/* Hero Section — split layout: ship-direct panel on the left, hero photo on the right.
          CSS Grid + clamp() keeps the sidebar width, text, icons and gaps scaling
          *smoothly* with the viewport instead of jumping at rigid breakpoints. */}
      <section className="relative w-full flex flex-col md:grid md:grid-cols-[minmax(220px,18%)_1fr] md:h-[80vh] md:min-h-[600px]">
        {/* Hero image + copy — sits on the right on desktop */}
        <div className="relative flex-1 h-[70vh] min-h-[500px] md:h-auto md:min-h-0 flex items-center justify-center overflow-hidden md:order-2">
          <div className="absolute inset-0 z-0">
            <img
              src={heroImg}
              alt="Beautiful outdoor patio furniture"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/40 mix-blend-multiply" />
          </div>

          <div className="relative z-10 container mx-auto px-4 text-center max-w-4xl text-white">
            <h1 className="font-bodoni italic text-5xl md:text-7xl font-medium tracking-tight mb-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
              Outdoor Living,<br />Refined.
            </h1>
            <p className="font-bodoni text-2xl md:text-4xl text-white mb-10 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150 [text-shadow:0_2px_4px_rgba(0,0,0,0.85),0_4px_16px_rgba(0,0,0,0.7)]">
              Discover curated outdoor furniture collections designed for the way you live outside. Craftsmanship that endures.
            </p>
            <div className="flex flex-col items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
              <Button variant="outline" className="text-white border-white hover:bg-white/10 rounded-none px-12 py-5 text-lg font-serif tracking-wide bg-transparent w-56 h-auto" asChild>
                <Link href="/contact">Visit Showroom</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* Ship-direct sidebar — fluid width, text, icons & padding via clamp() */}
        <aside className="w-full md:w-auto md:order-1 bg-primary/[0.06] text-foreground border-r border-border border-t-[3px] border-t-primary flex flex-col">
          <div className="flex flex-col items-center px-[clamp(0.5rem,1vw,1.25rem)] py-[clamp(0.5rem,0.8vw,0.75rem)] border-b border-border text-center">
            <h2
              className="font-bodoni italic leading-tight"
              style={{ fontSize: "clamp(0.875rem, 1.1vw, 1.25rem)" }}
            >
              Order online &amp; ship direct:
            </h2>
          </div>
          <nav className="flex flex-col flex-1 divide-y divide-border">
            {shipDirectCategories.map((category) => {
              const Icon = iconForCategory(category.slug);
              return (
                <Link
                  key={category.id}
                  href={`/shop/category/${category.slug}?online=true`}
                  className="group flex flex-1 flex-col justify-center items-center hover:bg-primary/10 transition-colors"
                  style={{
                    gap: "clamp(0.35rem, 0.6vw, 0.75rem)",
                    padding: "clamp(0.5rem, 1.2vw, 1rem) clamp(0.5rem, 1vw, 1.25rem)",
                  }}
                >
                  <div
                    className="flex items-center justify-center"
                    style={{ gap: "clamp(0.25rem, 0.4vw, 0.5rem)" }}
                  >
                    <span
                      className="font-serif group-hover:text-primary transition-colors"
                      style={{ fontSize: "clamp(0.75rem, 0.95vw, 1.125rem)" }}
                    >
                      {category.name}
                    </span>
                    <ArrowRight
                      className="text-muted-foreground group-hover:text-primary transition-colors shrink-0"
                      style={{
                        width: "clamp(0.75rem, 1vw, 1rem)",
                        height: "clamp(0.75rem, 1vw, 1rem)",
                      }}
                    />
                  </div>
                  <Icon
                    className="text-primary mx-auto"
                    style={{
                      width: "clamp(1.5rem, 2.5vw, 3rem)",
                      height: "clamp(1.5rem, 2.5vw, 3rem)",
                    }}
                  />
                </Link>
              );
            })}
            {shipDirectCategories.length === 0 ? (
              <Link
                href="/shop?online=true"
                className="px-5 py-2.5 text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                Browse everything available to order online →
              </Link>
            ) : null}
          </nav>
        </aside>
      </section>

      {/* Categories Section */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center text-center mb-16">
            <h2 className="font-bodoni italic text-3xl md:text-4xl mb-4">Browse Our Categories</h2>
            <div className="h-px w-24 bg-primary/40" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {(topLevelCategories.length > 0
              ? topLevelCategories
              : [
                  { id: "fallback-lounge", name: "Lounge Furniture", slug: "lounge", imageUrl: null },
                  { id: "fallback-dining", name: "Dining Sets", slug: "dining", imageUrl: null },
                  { id: "fallback-shade", name: "Shade & Accessories", slug: "shade", imageUrl: null },
                ]
            ).map((category) => {
              const img = getCategoryImage(category);
              return (
                <Link
                  key={category.id}
                  href={`/shop?category=${category.slug}`}
                  className="group group/card block cursor-pointer border-2 border-primary bg-card overflow-hidden hover:shadow-md transition-shadow duration-150"
                >
                  <div className="relative aspect-square overflow-hidden bg-muted">
                    {img ? (
                      <>
                        <img
                          src={img}
                          alt={category.name}
                          className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500" />
                      </>
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-secondary/40 text-secondary-foreground/60 font-serif text-sm tracking-widest uppercase">
                        Image Coming Soon
                      </div>
                    )}
                  </div>
                  <h3 className="font-serif text-base md:text-lg group-hover:text-primary transition-colors text-center py-3 px-2 border-t border-primary/30">
                    {category.name}
                  </h3>
                </Link>
              );
            })}
          </div>
          <div className="text-center mt-12">
            <Button variant="link" className="font-serif text-lg text-primary hover:text-primary/80" asChild>
              <Link href="/shop">View all <ArrowRight className="ml-2 w-4 h-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Featured Products Section — staff-curated carousel, ordered by when flagged */}
      {featured.length > 0 ? (
        <section className="py-24 bg-muted/30 border-y border-border">
          <div className="container mx-auto px-4 md:px-6">
            <div className="flex flex-col items-center text-center mb-12">
              <h2 className="font-bodoni italic text-3xl md:text-4xl mb-4">Featured Products</h2>
              <div className="h-px w-24 bg-primary/40 mb-4" />
              <p className="text-sm text-muted-foreground max-w-md">
                A curated selection of the pieces we're loving right now.
              </p>
            </div>

            <div className="relative">
              {featured.length > 1 ? (
                <>
                  <button
                    type="button"
                    aria-label="Scroll featured products left"
                    onClick={() => scrollFeatured(-1)}
                    className="hidden md:flex absolute -left-4 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-sm hover:bg-accent transition-colors"
                  >
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                  <button
                    type="button"
                    aria-label="Scroll featured products right"
                    onClick={() => scrollFeatured(1)}
                    className="hidden md:flex absolute -right-4 top-1/2 -translate-y-1/2 z-10 h-10 w-10 items-center justify-center rounded-full bg-card border border-border shadow-sm hover:bg-accent transition-colors"
                  >
                    <ChevronRight className="h-5 w-5" />
                  </button>
                </>
              ) : null}

              <div
                ref={carouselRef}
                className="flex gap-6 overflow-x-auto scroll-smooth snap-x snap-mandatory pb-4 -mx-4 px-4 md:mx-0 md:px-0 [justify-content:safe_center] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {featured.map((p) => {
                  const varies = p.priceVaries && p.showPriceOnline;
                  const displayPrice = varies ? p.startingPrice : p.price;
                  const displaySale = varies ? p.startingSalePrice : p.salePrice;
                  const onSale =
                    displaySale &&
                    displayPrice &&
                    Number(displaySale) < Number(displayPrice);
                  const brandLogo = getBrandLogo(p.manufacturerName);
                  return (
                    <Link
                      key={p.id}
                      href={`/shop/${p.slug}`}
                      className="group block shrink-0 w-60 md:w-64 snap-start border-2 border-primary bg-card hover:shadow-md transition-shadow duration-150"
                    >
                      <div className="relative aspect-square bg-card overflow-hidden">
                        {p.primaryImageUrl ? (
                          <img
                            src={p.primaryImageUrl}
                            alt={p.name}
                            className="absolute inset-0 w-full h-full object-contain p-6 mix-blend-multiply"
                          />
                        ) : (
                          <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground font-serif text-sm">
                            No image available
                          </div>
                        )}
                        {onSale ? (
                          <div className="absolute top-3 right-3 bg-primary text-primary-foreground px-3 py-1 text-xs uppercase tracking-widest font-semibold">
                            Sale
                          </div>
                        ) : null}
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent pt-10 pb-3 px-4">
                          <h3 className="font-serif text-base text-white drop-shadow line-clamp-2">
                            {p.name}
                          </h3>
                        </div>
                      </div>
                      <div className="border-t border-primary/30 px-4 py-4 space-y-2 text-center">
                        {brandLogo ? (
                          <div className="flex justify-center">
                            <img
                              src={brandLogo}
                              alt={p.manufacturerName ?? ""}
                              className="h-6 w-auto object-contain"
                            />
                          </div>
                        ) : p.manufacturerName ? (
                          <p className="text-xs uppercase tracking-widest text-muted-foreground">
                            {p.manufacturerName}
                          </p>
                        ) : null}
                        {p.showPriceOnline && displayPrice ? (
                          onSale ? (
                            <p className="text-sm font-bold">
                              {varies && (
                                <span className="block text-xs font-normal uppercase tracking-widest text-muted-foreground">
                                  Starting at
                                </span>
                              )}
                              <span className="text-muted-foreground line-through mr-2">
                                {varies ? formatMoney(displayPrice) : `MSRP ${formatMoney(displayPrice)}`}
                              </span>
                              <span className="text-primary">
                                {varies ? formatMoney(displaySale) : `Sale ${formatMoney(displaySale)}`}
                              </span>
                            </p>
                          ) : (
                            <p className="text-sm font-bold">
                              {varies && (
                                <span className="block text-xs font-normal uppercase tracking-widest text-muted-foreground">
                                  Starting at
                                </span>
                              )}
                              {varies ? formatMoney(displayPrice) : `MSRP ${formatMoney(displayPrice)}`}
                            </p>
                          )
                        ) : null}
                        <div className="pt-1">
                          <span className="inline-block w-full border border-primary text-primary text-xs uppercase tracking-widest px-4 py-2.5 font-semibold group-hover:bg-primary group-hover:text-primary-foreground transition-colors duration-150">
                            Select Options
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {/* Manufacturers Marquee */}
      <section className="py-16 bg-background border-t border-border overflow-hidden flex flex-col items-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground mb-10 font-medium">Proudly Featuring Top Brands</p>
        <div className="brand-marquee w-full inline-flex flex-nowrap overflow-hidden">
          <ul className="flex items-center animate-infinite-scroll shrink-0">
            {BRAND_LOGOS.map((b) => (
              <li
                key={`a-${b.name}`}
                className="shrink-0 flex items-center justify-center h-20 w-44 mx-6"
              >
                <img
                  src={b.src}
                  alt={b.name}
                  title={b.name}
                  decoding="async"
                  className="max-h-full max-w-full object-contain opacity-70 hover:opacity-100 transition-opacity"
                />
              </li>
            ))}
          </ul>
          <ul aria-hidden="true" className="flex items-center animate-infinite-scroll shrink-0">
            {BRAND_LOGOS.map((b) => (
              <li
                key={`b-${b.name}`}
                className="shrink-0 flex items-center justify-center h-20 w-44 mx-6"
              >
                <img
                  src={b.src}
                  alt=""
                  decoding="async"
                  className="max-h-full max-w-full object-contain opacity-70 hover:opacity-100 transition-opacity"
                />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
