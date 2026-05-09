import { Link } from "wouter";
import { Heart } from "lucide-react";
import {
  useGetWishlist,
  getGetWishlistQueryKey,
} from "@workspace/api-client-react";
import { useAuth, usePendingWishlist } from "@/lib/auth";

/**
 * Header wishlist entry point. Mirrors the cart link styling/badge.
 *
 * - Authenticated users: count comes from the server wishlist.
 * - Guests: count comes from the device-local hold in localStorage
 *   (via `usePendingWishlist`), which already powers `<WishlistButton>`.
 *
 * Heart fills solid when there is at least one saved item, outlined when
 * empty. Always links to the existing `/account/wishlist` route — for
 * guests that route already redirects to sign-in, which preserves the
 * existing wishlist behavior.
 */
export function WishlistIconLink() {
  const { isAuthenticated } = useAuth();
  const pendingSet = usePendingWishlist();

  const { data: serverWishlist } = useGetWishlist({
    query: {
      queryKey: getGetWishlistQueryKey(),
      enabled: isAuthenticated,
      retry: false,
      staleTime: 30_000,
    },
  });

  const count = isAuthenticated
    ? (serverWishlist?.items.length ?? 0)
    : pendingSet.size;
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
