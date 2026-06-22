import { Link } from "wouter";
import { Heart } from "lucide-react";
import { useWishlistItems } from "@/lib/wishlistHold";

/**
 * Header wishlist entry point. Mirrors the cart link styling/badge.
 *
 * Count comes from the unified wishlist (server-backed for both signed-in
 * users and guests, the latter identified by their device token). Heart fills
 * solid when there is at least one saved item, outlined when empty.
 */
export function WishlistIconLink() {
  const { items } = useWishlistItems();

  const count = items.length;
  const hasItems = count > 0;

  return (
    <Link
      href="/wishlist"
      aria-label={`Wishlist${hasItems ? ` (${count} items)` : ""}`}
      className="relative text-foreground/80 hover:text-primary transition-colors"
    >
      <Heart
        className={`w-5 h-5 ${hasItems ? "fill-primary text-primary" : ""}`}
      />
      {hasItems ? (
        <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground text-[10px] font-semibold rounded-full min-w-[18px] h-[18px] inline-flex items-center justify-center px-1">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}
