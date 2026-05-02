import { Link, useLocation } from "wouter";
import {
  useListActiveBanners,
  useLogout,
  getGetCurrentUserQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, X, ChevronDown, User } from "lucide-react";
import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const [location, navigate] = useLocation();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { data: banners } = useListActiveBanners();
  const activeBanners = banners?.filter(b => b.type === "banner") || [];

  const { user, isAuthenticated } = useAuth();
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();

  const handleLogout = async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      await queryClient.invalidateQueries({
        queryKey: getGetCurrentUserQueryKey(),
      });
      queryClient.setQueryData(getGetCurrentUserQueryKey(), undefined);
      setIsMobileMenuOpen(false);
      navigate("/");
    }
  };

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
                className="h-12 sm:h-14 md:h-20 lg:h-24 xl:h-28 object-contain"
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
              {isAuthenticated && user ? (
                <DropdownMenu>
                  <DropdownMenuTrigger
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground/80 hover:text-primary transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm px-1"
                    aria-label="Account menu"
                  >
                    <User className="w-4 h-4" />
                    <span>{user.firstName ?? "Account"}</span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem asChild>
                      <Link href="/account" className="cursor-pointer">
                        My Account
                      </Link>
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onSelect={(e) => {
                        e.preventDefault();
                        handleLogout();
                      }}
                      disabled={logoutMutation.isPending}
                      className="cursor-pointer"
                    >
                      Log Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Link
                  href="/login"
                  className="text-sm font-medium text-foreground/70 hover:text-primary transition-colors"
                >
                  Log In
                </Link>
              )}
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
        <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur-lg pt-24 px-6 md:hidden animate-in fade-in slide-in-from-top-4 duration-200 overflow-y-auto">
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
            {isAuthenticated && user ? (
              <>
                <Link
                  href="/account"
                  className="text-lg font-serif text-foreground hover:text-primary transition-colors"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  My Account ({user.firstName ?? "You"})
                </Link>
                <button
                  type="button"
                  className="text-lg font-serif text-muted-foreground hover:text-primary transition-colors"
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                >
                  Log Out
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="text-lg font-serif text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Log In
              </Link>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
