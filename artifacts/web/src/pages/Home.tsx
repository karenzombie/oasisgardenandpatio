import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useListCategories,
  useListFeaturedProducts,
} from "@workspace/api-client-react";
import { BRAND_LOGOS, getBrandLogo } from "@/lib/brandLogos";

const CATEGORY_IMAGES: Record<string, string> = {
  "cat-umbrellas": "/src/assets/category-shade.png",
  "cat-chaise-lounges": "/src/assets/category-lounge.png",
  "cat-dining": "/src/assets/category-dining.png",
  shade: "/src/assets/category-shade.png",
  lounge: "/src/assets/category-lounge.png",
  dining: "/src/assets/category-dining.png",
};

export default function Home() {
  const { data: categories } = useListCategories();
  const { data: featuredProducts } = useListFeaturedProducts();

  const topLevelCategories = (categories?.filter(c => c.parentId === null) || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative w-full h-[80vh] min-h-[600px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="/src/assets/hero.png"
            alt="Beautiful outdoor patio furniture"
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-black/40 mix-blend-multiply" />
        </div>
        
        <div className="relative z-10 container mx-auto px-4 text-center max-w-4xl text-white">
          <h1 className="font-serif text-5xl md:text-7xl font-medium tracking-tight mb-6 animate-in fade-in slide-in-from-bottom-8 duration-1000">
            Outdoor Living,<br />Refined.
          </h1>
          <p className="text-xl md:text-2xl font-bold text-white mb-10 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-150 [text-shadow:0_2px_4px_rgba(0,0,0,0.85),0_4px_16px_rgba(0,0,0,0.7)]">
            Discover curated outdoor furniture collections designed for the way you live outside. Craftsmanship that endures.
          </p>
          <div className="flex items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-8 duration-1000 delay-300">
            <Button size="lg" className="bg-white text-black hover:bg-white/90 rounded-none px-8 font-serif tracking-wide" asChild>
              <Link href="/shop">Shop Collection</Link>
            </Button>
            <Button size="lg" variant="outline" className="text-white border-white hover:bg-white/10 rounded-none px-8 font-serif tracking-wide bg-transparent" asChild>
              <Link href="/contact">Visit Showroom</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-serif mb-4">Shop by Category</h2>
            <div className="h-px w-24 bg-primary/40" />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {(topLevelCategories.length > 0
              ? topLevelCategories
              : [
                  { id: "fallback-lounge", name: "Lounge Furniture", slug: "lounge" },
                  { id: "fallback-dining", name: "Dining Sets", slug: "dining" },
                  { id: "fallback-shade", name: "Shade & Accessories", slug: "shade" },
                ]
            ).map((category) => {
              const img = CATEGORY_IMAGES[category.slug];
              return (
                <Link
                  key={category.id}
                  href={`/shop?category=${category.slug}`}
                  className="group group/card block cursor-pointer"
                >
                  <div className="relative aspect-square overflow-hidden mb-3 bg-muted">
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
                  <h3 className="font-serif text-base md:text-lg group-hover:text-primary transition-colors flex items-center justify-between">
                    {category.name}
                    <ArrowRight className="w-4 h-4 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                  </h3>
                </Link>
              );
            })}
          </div>
          <div className="text-center mt-12">
            <Button variant="link" className="font-serif text-lg text-primary hover:text-primary/80" asChild>
              <Link href="/shop">View all categories <ArrowRight className="ml-2 w-4 h-4" /></Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Featured Products Section */}
      <section className="py-24 bg-muted/30 border-y border-border">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-serif mb-4">Featured Collections</h2>
            <div className="h-px w-24 bg-primary/40" />
          </div>

          {(() => {
            const items =
              featuredProducts && featuredProducts.length > 0
                ? featuredProducts.slice(0, 2).map((product) => ({
                    key: product.id,
                    href: `/shop/${product.slug}`,
                    name: product.name,
                    imageUrl: product.primaryImageUrl ?? null,
                    manufacturerName: product.manufacturerName ?? null,
                    placeholder: false as const,
                  }))
                : Array.from({ length: 2 }).map((_, i) => ({
                    key: `placeholder-${i}`,
                    href: "/shop",
                    name: "Coming Soon",
                    imageUrl: null,
                    manufacturerName: null,
                    placeholder: true as const,
                  }));

            return (
              <div className="flex flex-wrap justify-center gap-8 max-w-2xl mx-auto">
                {items.map((item) => {
                  const brandLogo = item.placeholder
                    ? null
                    : getBrandLogo(item.manufacturerName);
                  return (
                    <Link
                      key={item.key}
                      href={item.href}
                      className="group block w-48 md:w-56"
                    >
                      <div className="aspect-square overflow-hidden mb-3 relative bg-card">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover mix-blend-multiply transition-transform duration-500 group-hover:scale-105"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center bg-secondary/40 text-secondary-foreground/60 font-serif text-xs tracking-widest uppercase transition-colors group-hover:bg-secondary/60">
                            {item.placeholder ? "Featured Soon" : "Oasis"}
                          </div>
                        )}
                        {brandLogo ? (
                          <div
                            className="absolute top-2 left-2 bg-white/95 px-2 py-1 rounded-sm shadow-sm"
                            aria-hidden="true"
                          >
                            <img
                              src={brandLogo}
                              alt=""
                              className="h-4 w-auto object-contain"
                            />
                          </div>
                        ) : null}
                      </div>
                      <h3 className="font-serif text-sm md:text-base text-center group-hover:text-primary transition-colors line-clamp-1">
                        {item.name}
                      </h3>
                    </Link>
                  );
                })}
              </div>
            );
          })()}
        </div>
      </section>

      {/* Manufacturers Marquee */}
      <section className="py-16 bg-background border-t border-border overflow-hidden flex flex-col items-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground mb-10 font-medium">Proudly Featuring Top Brands</p>
        <div className="brand-marquee w-full inline-flex flex-nowrap overflow-hidden">
          <ul className="flex items-center [&_li]:mx-10 [&_img]:max-w-none animate-infinite-scroll shrink-0">
            {BRAND_LOGOS.map((b) => (
              <li key={`a-${b.name}`} className="shrink-0 flex items-center justify-center h-16">
                <img
                  src={b.src}
                  alt={b.name}
                  title={b.name}
                  decoding="async"
                  className="max-h-16 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity"
                />
              </li>
            ))}
          </ul>
          <ul aria-hidden="true" className="flex items-center [&_li]:mx-10 [&_img]:max-w-none animate-infinite-scroll shrink-0">
            {BRAND_LOGOS.map((b) => (
              <li key={`b-${b.name}`} className="shrink-0 flex items-center justify-center h-16">
                <img
                  src={b.src}
                  alt=""
                  decoding="async"
                  className="max-h-16 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity"
                />
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
