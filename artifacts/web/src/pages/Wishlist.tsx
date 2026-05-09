import { useMemo } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Trash2 } from "lucide-react";
import {
  useGetWishlist,
  useRemoveWishlistItem,
  useAddCartItem,
  lookupWishlistItems,
  getGetWishlistQueryKey,
  getGetCartQueryKey,
} from "@workspace/api-client-react";
import type { WishlistItem } from "@workspace/api-client-react";
import { useAuth, usePendingWishlist } from "@/lib/auth";
import { removeFromPendingWishlist } from "@/lib/wishlistHold";
import { Spinner } from "@/components/ui/spinner";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function formatMoney(v: string | null | undefined): string {
  if (v == null || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return `$${n.toFixed(2)}`;
}

/**
 * Public wishlist page. Behaves differently per auth state:
 *
 * - Signed-in users: pulls from the server wishlist via GET /wishlist and
 *   uses the existing add-to-cart and remove mutations. Same behavior as
 *   the AccountWishlist page (kept around for the /account/wishlist deep
 *   link from the account dashboard).
 *
 * - Guests: renders the device-local wishlist. Product details are
 *   hydrated via POST /wishlist/lookup (public). Removing an item updates
 *   localStorage. Move-to-cart works because /cart supports guest
 *   sessions.
 *
 * No changes to existing wishlist storage / sync / toast logic — this
 * page only consumes those primitives.
 */
export default function Wishlist() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const pendingSet = usePendingWishlist();

  // localStorage stores items in the order they were added (Set insertion
  // order is preserved). Reverse so the newest save appears first, which
  // matches the authed wishlist's createdAt-desc ordering. The reversed
  // array is used in the query key so any add/remove/reorder triggers a
  // refetch — we don't sort or normalize, so order changes are honored.
  const guestIds = useMemo(
    () => Array.from(pendingSet).reverse(),
    [pendingSet],
  );

  const serverQuery = useGetWishlist({
    query: {
      queryKey: getGetWishlistQueryKey(),
      enabled: !authLoading && isAuthenticated,
      retry: false,
    },
  });

  // The lookup endpoint is a POST (so a list of IDs can be sent without
  // URL-length limits), which Orval generates as a mutation. Wrap the
  // bare async fn in useQuery so the result is cached and tied to the
  // guest's localStorage contents.
  const guestQuery = useQuery({
    queryKey: ["lookupWishlistItems", guestIds],
    queryFn: () => lookupWishlistItems({ productIds: guestIds }),
    enabled: !authLoading && !isAuthenticated,
    retry: false,
  });

  const removeServer = useRemoveWishlistItem({
    mutation: {
      onSuccess: (resp) => qc.setQueryData(getGetWishlistQueryKey(), resp),
    },
  });
  const addToCart = useAddCartItem({
    mutation: {
      onSuccess: (resp, vars) => {
        qc.setQueryData(getGetCartQueryKey(), resp);
        toast({ title: "Added to cart" });
        // Move = add to cart then remove from wishlist (auth path only).
        if (isAuthenticated) {
          removeServer.mutate({ productId: vars.data.productId });
        } else {
          removeFromPendingWishlist(vars.data.productId);
        }
      },
    },
  });

  if (authLoading || serverQuery.isLoading || guestQuery.isLoading) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <Spinner className="size-8 text-primary mx-auto" />
      </div>
    );
  }

  const items: WishlistItem[] = isAuthenticated
    ? (serverQuery.data?.items ?? [])
    : (guestQuery.data?.items ?? []);

  function handleRemove(productId: number) {
    if (isAuthenticated) {
      removeServer.mutate({ productId });
    } else {
      removeFromPendingWishlist(productId);
      toast({ title: "Removed from your saved items" });
    }
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-5xl">
      <nav className="text-xs uppercase tracking-widest text-muted-foreground mb-6 flex items-center gap-2">
        <Link href="/" className="hover:text-foreground">Home</Link>
        <span>/</span>
        <span className="text-foreground">Wishlist</span>
      </nav>

      <div className="flex items-center gap-3 mb-2">
        <Heart className="w-6 h-6 text-primary" />
        <h1 className="font-serif text-3xl md:text-4xl">My Wishlist</h1>
      </div>
      {!isAuthenticated && (
        <p className="text-sm text-muted-foreground mb-8">
          Saved on this device.{" "}
          <Link href="/sign-in" className="text-primary hover:underline">
            Sign in
          </Link>{" "}
          to save them to your account permanently.
        </p>
      )}
      {isAuthenticated && <div className="mb-8" />}

      {items.length === 0 ? (
        <div className="border border-border bg-card p-12 text-center">
          <p className="text-muted-foreground mb-4">Your wishlist is empty.</p>
          <Button asChild className="rounded-none">
            <Link href="/shop">Browse Products</Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {items.map((item) => {
            const onSale =
              item.salePrice && item.price && Number(item.salePrice) < Number(item.price);
            return (
              <li
                key={item.productId}
                className="py-5 flex flex-col sm:flex-row gap-5 items-start sm:items-center"
              >
                <Link
                  href={`/shop/${item.slug}`}
                  className="shrink-0 w-24 h-24 bg-card overflow-hidden"
                >
                  {item.primaryImageUrl ? (
                    <img
                      src={item.primaryImageUrl}
                      alt={item.name}
                      className="w-full h-full object-cover mix-blend-multiply"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted" />
                  )}
                </Link>
                <div className="flex-1 min-w-0">
                  {item.manufacturerName ? (
                    <p className="text-xs uppercase tracking-widest text-muted-foreground mb-1">
                      {item.manufacturerName}
                    </p>
                  ) : null}
                  <Link
                    href={`/shop/${item.slug}`}
                    className="font-serif text-lg hover:text-primary transition-colors"
                  >
                    {item.name}
                  </Link>
                  <p className="text-xs text-muted-foreground mt-1">
                    SKU {item.sku}
                  </p>
                  {item.showPriceOnline && item.price ? (
                    <p className="text-sm mt-2">
                      {onSale ? (
                        <>
                          <span className="text-muted-foreground line-through mr-2">
                            {formatMoney(item.price)}
                          </span>
                          <span className="text-primary font-semibold">
                            {formatMoney(item.salePrice)}
                          </span>
                        </>
                      ) : (
                        <span>{formatMoney(item.price)}</span>
                      )}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {item.quoteOnly ? (
                    <span className="text-xs uppercase tracking-widest text-muted-foreground border border-border px-3 py-2">
                      Sales agent only
                    </span>
                  ) : (
                    <Button
                      className="rounded-none"
                      onClick={() =>
                        addToCart.mutate({
                          data: { productId: item.productId, quantity: 1 },
                        })
                      }
                      disabled={addToCart.isPending || !item.availableOnline}
                    >
                      Move to Cart
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    className="rounded-none"
                    onClick={() => handleRemove(item.productId)}
                    disabled={removeServer.isPending}
                    aria-label="Remove from wishlist"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
