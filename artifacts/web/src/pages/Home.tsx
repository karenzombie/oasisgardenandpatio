import { Link } from "wouter";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useListCategories,
  useListFeaturedProducts,
} from "@workspace/api-client-react";
import { BRAND_LOGOS, getBrandLogo } from "@/lib/brandLogos";

export default function Home() {
  const { data: categories } = useListCategories();
  const { data: featuredProducts } = useListFeaturedProducts();

  const topLevelCategories = categories?.filter(c => c.parentId === null) || [];

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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {topLevelCategories.length > 0 ? (
              topLevelCategories.slice(0, 3).map((category, i) => (
                <Link key={category.id} href={`/shop?category=${category.slug}`} className="group group/card block cursor-pointer">
                  <div className="relative aspect-[3/4] overflow-hidden mb-4 bg-muted">
                    <img 
                      src={i === 0 ? "/src/assets/category-lounge.png" : i === 1 ? "/src/assets/category-dining.png" : "/src/assets/category-shade.png"}
                      alt={category.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500" />
                  </div>
                  <h3 className="font-serif text-xl group-hover:text-primary transition-colors flex items-center justify-between">
                    {category.name}
                    <ArrowRight className="w-5 h-5 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                  </h3>
                </Link>
              ))
            ) : (
              // Fallback if no categories
              <>
                {[
                  { name: "Lounge Furniture", img: "/src/assets/category-lounge.png" },
                  { name: "Dining Sets", img: "/src/assets/category-dining.png" },
                  { name: "Shade & Accessories", img: "/src/assets/category-shade.png" }
                ].map((item, i) => (
                  <Link key={i} href="/shop" className="group group/card block cursor-pointer">
                    <div className="relative aspect-[3/4] overflow-hidden mb-4 bg-muted">
                      <img 
                        src={item.img}
                        alt={item.name}
                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                      />
                      <div className="absolute inset-0 bg-black/10 group-hover:bg-transparent transition-colors duration-500" />
                    </div>
                    <h3 className="font-serif text-xl group-hover:text-primary transition-colors flex items-center justify-between">
                      {item.name}
                      <ArrowRight className="w-5 h-5 opacity-0 -translate-x-4 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300" />
                    </h3>
                  </Link>
                ))}
              </>
            )}
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

          {featuredProducts && featuredProducts.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {featuredProducts.map((product) => {
                const brandLogo = getBrandLogo(product.manufacturerName);
                return (
                  <Link key={product.id} href={`/shop/${product.slug}`} className="group block">
                    <div className="aspect-square bg-card overflow-hidden mb-4 relative">
                      {product.primaryImageUrl ? (
                        <img src={product.primaryImageUrl} alt={product.name} className="w-full h-full object-cover mix-blend-multiply transition-transform duration-500 group-hover:scale-105" />
                      ) : (
                        <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground font-serif">Oasis</div>
                      )}
                      {brandLogo ? (
                        <div className="absolute top-3 left-3 bg-white/95 px-2 py-1 rounded-sm shadow-sm" aria-hidden="true">
                          <img src={brandLogo} alt="" className="h-5 w-auto object-contain" />
                        </div>
                      ) : null}
                    </div>
                    <div className="space-y-2 text-center">
                      {brandLogo ? (
                        <img
                          src={brandLogo}
                          alt={product.manufacturerName ?? ""}
                          className="h-6 w-auto object-contain mx-auto"
                        />
                      ) : (
                        <p className="text-xs uppercase tracking-widest text-muted-foreground">{product.manufacturerName}</p>
                      )}
                      <h3 className="font-serif text-lg group-hover:text-primary transition-colors line-clamp-1">{product.name}</h3>
                      {product.showPriceOnline && product.price && (
                        <p className="text-sm">${product.price}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="text-center max-w-md mx-auto py-12">
              <h3 className="font-serif text-2xl mb-4 text-foreground/80">New Collections Coming Soon</h3>
              <p className="text-muted-foreground mb-8">We are currently curating our online featured selection. Visit our Santa Clarita showroom to view our full range of luxury patio furniture.</p>
              <Button variant="outline" className="rounded-none border-primary text-primary hover:bg-primary hover:text-white" asChild>
                <Link href="/contact">Visit Showroom</Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      {/* Manufacturers Marquee */}
      <section className="py-16 bg-background border-t border-border overflow-hidden flex flex-col items-center">
        <p className="text-sm uppercase tracking-widest text-muted-foreground mb-10 font-medium">Proudly Featuring Top Brands</p>
        <div className="w-full inline-flex flex-nowrap overflow-hidden [mask-image:_linear-gradient(to_right,transparent_0,_black_128px,_black_calc(100%-128px),transparent_100%)]">
          <ul className="flex items-center [&_li]:mx-10 [&_img]:max-w-none animate-infinite-scroll shrink-0">
            {BRAND_LOGOS.map((b) => (
              <li key={`a-${b.name}`} className="shrink-0 flex items-center justify-center h-16">
                <img
                  src={b.src}
                  alt={b.name}
                  title={b.name}
                  loading="lazy"
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
                  loading="lazy"
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
