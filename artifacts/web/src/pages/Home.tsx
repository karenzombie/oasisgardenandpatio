import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useListCategories,
  useGetPopularProduct,
} from "@workspace/api-client-react";
import { BRAND_LOGOS, getBrandLogo } from "@/lib/brandLogos";
import heroImg from "@/assets/hero.png";
import { getCategoryImage } from "@/lib/categoryImages";

export default function Home() {
  const { data: categories } = useListCategories();
  const { data: popularData } = useGetPopularProduct();
  const popularProduct = popularData?.product ?? null;

  const topLevelCategories = (categories?.filter(c => c.parentId === null) || [])
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="w-full">
      {/* Hero Section */}
      <section className="relative w-full h-[80vh] min-h-[600px] flex items-center justify-center overflow-hidden">
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
            <Button className="bg-white text-black hover:bg-white/90 rounded-none px-12 py-5 text-lg font-serif font-bold tracking-wide btn-hero-pulse w-56 h-auto" asChild>
              <Link href="/shop?online=true">Shop Online</Link>
            </Button>
            <Button variant="outline" className="text-white border-white hover:bg-white/10 rounded-none px-12 py-5 text-lg font-serif tracking-wide bg-transparent w-56 h-auto" asChild>
              <Link href="/contact">Visit Showroom</Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Categories Section */}
      <section className="py-24 bg-background">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-serif mb-4">Categories</h2>
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

      {/* Popular Products Section — single most-loved item, refreshed weekly */}
      <section className="py-24 bg-muted/30 border-y border-border">
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex flex-col items-center text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-serif mb-4">Popular Products</h2>
            <div className="h-px w-24 bg-primary/40 mb-4" />
            <p className="text-sm text-muted-foreground max-w-md">
              The piece our customers are loving most this week.
            </p>
          </div>

          {(() => {
            const item = popularProduct
              ? {
                  href: `/shop/${popularProduct.slug}`,
                  name: popularProduct.name,
                  imageUrl: popularProduct.primaryImageUrl ?? null,
                  manufacturerName: popularProduct.manufacturerName ?? null,
                  placeholder: false as const,
                }
              : {
                  href: "/shop",
                  name: "Coming Soon",
                  imageUrl: null,
                  manufacturerName: null,
                  placeholder: true as const,
                };
            const brandLogo = item.placeholder
              ? null
              : getBrandLogo(item.manufacturerName);
            return (
              <div className="flex justify-center max-w-md mx-auto">
                <Link
                  href={item.href}
                  className="group block w-64 md:w-80"
                >
                  <div className="aspect-square overflow-hidden mb-4 relative bg-card">
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="w-full h-full object-cover mix-blend-multiply transition-transform duration-500 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-secondary/40 text-secondary-foreground/60 font-serif text-xs tracking-widest uppercase transition-colors group-hover:bg-secondary/60">
                        {item.placeholder ? "Popular Pick Coming Soon" : "Image not available"}
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
                  <h3 className="font-serif text-base md:text-lg text-center group-hover:text-primary transition-colors line-clamp-1">
                    {item.name}
                  </h3>
                </Link>
              </div>
            );
          })()}
        </div>
      </section>

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
