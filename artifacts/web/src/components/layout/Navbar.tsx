import { Link, useLocation } from "wouter";
import { useListActiveBanners } from "@workspace/api-client-react";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/manufacturers", label: "Manufacturers" },
  { href: "/materials", label: "Materials" },
  { href: "/shop", label: "Products" },
  { href: "/commercial", label: "Commercial" },
  { href: "/cushions", label: "Cushions" },
  { href: "/contact", label: "Contact Us" },
];

export function Navbar() {
  const [location] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { data: banners } = useListActiveBanners();
  const activeBanners = banners?.filter(b => b.type === "banner") || [];

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="w-full flex flex-col z-50 sticky top-0">
      {/* Top Banner */}
      {activeBanners.length > 0 && (
        <div className="bg-primary text-primary-foreground text-center py-2 px-4 text-sm font-medium tracking-wide">
          {activeBanners[0].title}: {activeBanners[0].messageText}
        </div>
      )}

      {/* Main Navbar */}
      <header
        className={`w-full transition-all duration-300 border-b ${
          isScrolled
            ? "bg-background/95 backdrop-blur-md border-border py-3 shadow-sm"
            : "bg-background border-transparent py-5"
        }`}
      >
        <div className="container mx-auto px-4 md:px-6">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center z-50">
              <img
                src="/src/assets/logo.png"
                alt="Oasis Garden & Patio"
                className="h-10 md:h-14 object-contain"
              />
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center space-x-8">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`text-sm font-medium transition-colors hover:text-primary ${
                    location === link.href
                      ? "text-primary border-b-2 border-primary pb-1"
                      : "text-foreground/80"
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Right Actions */}
            <div className="hidden md:flex items-center space-x-4">
              <Link href="/login" className="text-sm font-medium text-foreground/70 hover:text-primary transition-colors">
                Log In
              </Link>
            </div>

            {/* Mobile Menu Toggle */}
            <button
              className="md:hidden p-2 text-foreground z-50"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle menu"
            >
              {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur-lg pt-24 px-6 md:hidden animate-in fade-in slide-in-from-top-4 duration-200">
          <nav className="flex flex-col space-y-6 text-center">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`text-lg font-serif transition-colors ${
                  location === link.href ? "text-primary" : "text-foreground"
                }`}
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {link.label}
              </Link>
            ))}
            <div className="h-px bg-border my-4 w-12 mx-auto" />
            <Link
              href="/login"
              className="text-lg font-serif text-muted-foreground hover:text-primary transition-colors"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              Log In
            </Link>
          </nav>
        </div>
      )}
    </div>
  );
}
