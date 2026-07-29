import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, Trash2 } from "lucide-react";
import {
  useRemoveWishlistItem,
  useAddCartItem,
  getGetCartQueryKey,
} from "@workspace/api-client-react";
import type { WishlistItem } from "@workspace/api-client-react";
import {
  useWishlistItems,
  wishlistKeyFor,
  getDeviceToken,
} from "@/lib/wishlistHold";
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
 * Public wishlist page. Server-backed for both signed-in users and guests
 * (guests identified by their device token). Each row is a saved
 * configuration; signed-in users may have multiple per product.
 */
export default function Wishlist() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const {
    items,
    isAuthenticated,
    userId,
    deviceToken,
    isLoading,
  } = useWishlistItems();

  const removeM = useRemoveWishlistItem({
    mutation: {
      onSuccess: (resp) =>
        qc.setQueryData(wishlistKeyFor(userId, getDeviceToken()), resp),
    },
  });
  const addToCart = useAddCartItem({
    mutation: {
      onSuccess: (resp, vars) => {
        qc.setQueryData(getGetCartQueryKey(), resp);
        toast({ title: "Added to cart" });
        const row = items.find((i) => i.productId === vars.data.productId);
        if (row) removeRow(row);
      },
    },
  });

  function removeRow(item: WishlistItem) {
    removeM.mutate({
      id: item.id,
      data: isAuthenticated ? {} : { deviceToken: deviceToken ?? "" },
    });
  }

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-24 text-center">
        <Spinner className="size-8 text-primary mx-auto" />
      </div>
    );
  }

  function handleRemove(item: WishlistItem) {
    removeRow(item);
    if (!isAuthenticated) {
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
                key={item.id}
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
                  {item.variantLabel ? (
                    <p className="text-xs text-foreground/80 mt-0.5">
                      {item.variantLabel}
                    </p>
                  ) : null}
                  {item.finishName ? (
                    <p className="text-xs text-foreground/80 mt-0.5">
                      <span className="text-muted-foreground">Finish:</span>{" "}
                      {item.finishName}
                    </p>
                  ) : null}
                  {item.fabricName ? (
                    <p className="text-xs text-foreground/80 mt-0.5">
                      <span className="text-muted-foreground">Fabric:</span>{" "}
                      {item.fabricName}
                      {item.fabricItemNumber ? (
                        <span className="text-muted-foreground">
                          {" "}
                          ({item.fabricItemNumber})
                        </span>
                      ) : null}
                    </p>
                  ) : null}
                  {item.tileName ? (
                    <p className="text-xs text-foreground/80 mt-0.5">
                      <span className="text-muted-foreground">Tile:</span>{" "}
                      {item.tileName}
                    </p>
                  ) : null}
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
                    onClick={() => handleRemove(item)}
                    disabled={removeM.isPending}
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
