import { Link, useLocation, useSearch } from "wouter";
import {
  useListActiveBanners,
  useLogout,
  useGetCart,
  getGetCurrentUserQueryKey,
  getGetCartQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Menu, X, ChevronDown, User, ShoppingBag, Search } from "lucide-react";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { useClerk } from "@clerk/react";
import { useAuth } from "@/lib/auth";
import { WishlistIconLink } from "@/components/layout/WishlistIconLink";
import logoImg from "@/assets/logo.png";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Matches full URLs (http/https) OR bare domains like oasispatioumbrellas.com
const URL_RE =
  /https?:\/\/[^\s,;)'"]+|(?<![.\w])(?:www\.)[^\s,;)'"]+|(?<![.\w])[a-zA-Z0-9-]+\.(?:com|net|org|io|co|us|info|biz|shop|store)[^\s,;)'".]*/g;

function renderWithLinks(text: string) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  URL_RE.lastIndex = 0;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const raw = match[0];
    const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    parts.push(
      <a
        key={match.index}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80"
      >
        {raw}
      </a>,
    );
    last = match.index + raw.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/manufacturers", label: "Manufacturers" },
  { href: "/materials", label: "Materials" },
  { href: "/shop", label: "Products" },
  { href: "/commercial", label: "Commercial" },
  { href: "/contact", label: "Contact Us" },
];

export function Navbar() {
  const [location, navigate] = useLocation();
  const rawSearch = useSearch();
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const currentQ = location === "/search"
    ? (new URLSearchParams(rawSearch).get("q") ?? "")
    : "";
  const [searchValue, setSearchValue] = useState(currentQ);
  useEffect(() => {
    if (location === "/search") {
      setSearchValue(new URLSearchParams(rawSearch).get("q") ?? "");
    } else {
      setSearchValue("");
    }
  }, [location, rawSearch]);

  function handleSearch(e: FormEvent) {
    e.preventDefault();
    const val = searchValue.trim();
    navigate(val ? `/search?q=${encodeURIComponent(val)}` : "/search");
    setIsMobileMenuOpen(false);
  }

  const { data: banners } = useListActiveBanners();
  const activeBanners = Array.isArray(banners) ? banners.filter(b => b.type === "banner") : [];

  const { user, isAuthenticated } = useAuth();
  const logoutMutation = useLogout();
  const queryClient = useQueryClient();
  const { signOut: clerkSignOut } = useClerk();

  const { data: cart } = useGetCart({
    query: {
      queryKey: getGetCartQueryKey(),
      enabled: isAuthenticated,
      retry: false,
      staleTime: 15_000,
    },
  });
  const cartCount = cart?.itemCount ?? 0;

  const handleLogout = async () => {
    try {
      await clerkSignOut().catch(() => {});
      await logoutMutation.mutateAsync().catch(() => {});
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

  const navRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = navRef.current;
    if (!el) return;
    const setHeight = () => {
      document.documentElement.style.setProperty(
        "--nav-height",
        `${el.offsetHeight}px`,
      );
    };
    setHeight();
    const observer = new ResizeObserver(setHeight);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const searchBar = (
    <form onSubmit={handleSearch} className="flex w-full">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Search products, brands, materials…"
          className="w-full border border-input bg-background pl-9 pr-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary rounded-none"
        />
      </div>
      <button
        type="submit"
        className="px-5 bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shrink-0"
      >
        Search
      </button>
    </form>
  );

  return (
    <div ref={navRef} className="w-full flex flex-col z-50 sticky top-0">
      {/* Top Banner */}
      {activeBanners.length > 0 && (
        <div className="bg-primary text-primary-foreground text-center py-2 px-4 text-sm font-medium tracking-wide">
          {renderWithLinks(
            activeBanners[0].messageText
              ? `${activeBanners[0].title}: ${activeBanners[0].messageText}`
              : activeBanners[0].title,
          )}
        </div>
      )}

      {/* Main Navbar */}
      <header
        className={`w-full transition-all duration-300 border-b ${
          isScrolled
            ? "bg-secondary border-border shadow-sm"
            : "bg-secondary border-border"
        }`}
      >
        <div className="w-full px-4 md:px-6">
          <div className="flex items-stretch gap-4 md:gap-6">

            {/* Logo — large on desktop, fills the full header height */}
            <Link
              href="/"
              aria-label="Oasis Garden & Patio — home"
              className="flex items-center shrink-0 z-50 py-3 cursor-pointer select-none"
            >
              <img
                src={logoImg}
                alt="Oasis Garden & Patio"
                draggable={false}
                className={`w-auto object-contain select-none pointer-events-none transition-all duration-300 ${
                  isScrolled
                    ? "h-12 sm:h-14 md:h-16 lg:h-20"
                    : "h-14 sm:h-16 md:h-20 lg:h-24 xl:h-28"
                }`}
              />
            </Link>

            {/* Right column: nav row + search row (desktop) / actions + hamburger (mobile) */}
            <div className="flex-1 flex flex-col justify-center md:justify-between min-w-0">

              {/* Top row: desktop nav + actions; mobile: actions + hamburger */}
              <div className="flex items-center justify-between pt-3 md:pt-4 pb-1">

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center space-x-4 lg:space-x-6 xl:space-x-8">
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
                <div className="flex items-center space-x-4 sm:space-x-5 md:ml-auto">
                  <WishlistIconLink />
                  <Link
                    href="/cart"
                    aria-label={`Shopping cart${cartCount > 0 ? ` (${cartCount} items)` : ""}`}
                    className="relative text-foreground/80 hover:text-primary transition-colors"
                  >
                    <ShoppingBag className="w-5 h-5" />
                    {cartCount > 0 ? (
                      <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1">
                        {cartCount > 99 ? "99+" : cartCount}
                      </span>
                    ) : null}
                  </Link>
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
                      href="/sign-in"
                      className="text-sm font-medium text-foreground/70 hover:text-primary transition-colors"
                    >
                      Sign In
                    </Link>
                  )}

                  {/* Mobile Menu Toggle — hidden when drawer is open; drawer provides its own close */}
                  {!isMobileMenuOpen && (
                    <button
                      className="md:hidden p-2 -mr-2 text-foreground"
                      onClick={() => setIsMobileMenuOpen(true)}
                      aria-label="Open menu"
                    >
                      <Menu className="h-6 w-6" />
                    </button>
                  )}
                </div>
              </div>

              {/* Search bar — desktop only, sits under the nav row */}
              {location !== "/search" && (
                <div className="hidden md:block pb-3 pt-1">
                  {searchBar}
                </div>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* Mobile search strip — below header, hidden on desktop */}
      {location !== "/search" && (
        <div className="md:hidden bg-muted/40 border-b border-border">
          <div className="w-full px-4 py-2">
            {searchBar}
          </div>
        </div>
      )}

      {/* Mobile Menu Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[60] bg-background/95 backdrop-blur-lg pt-20 px-6 md:hidden animate-in fade-in slide-in-from-top-4 duration-200 overflow-y-auto">
          <button
            className="absolute top-4 right-4 p-2 text-foreground hover:text-primary z-[70]"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-6 w-6" />
          </button>
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
                href="/sign-in"
                className="text-lg font-serif text-muted-foreground hover:text-primary transition-colors"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Sign In
              </Link>
            )}
          </nav>
        </div>
      )}
    </div>
  );
}
