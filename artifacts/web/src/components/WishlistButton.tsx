import { useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import {
  useGetWishlist,
  useAddWishlistItem,
  useRemoveWishlistItem,
  getGetWishlistQueryKey,
} from "@workspace/api-client-react";
import { useAuth, usePendingWishlist } from "@/lib/auth";
import {
  addToPendingWishlist,
  removeFromPendingWishlist,
} from "@/lib/wishlistHold";
import { useToast } from "@/hooks/use-toast";

type Variant = "icon" | "button";

export function WishlistButton({
  productId,
  variant = "icon",
  className = "",
  disabled = false,
  disabledReason,
}: {
  productId: number;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const pendingSet = usePendingWishlist();

  const { data } = useGetWishlist({
    query: {
      queryKey: getGetWishlistQueryKey(),
      enabled: isAuthenticated,
      retry: false,
      staleTime: 30_000,
    },
  });
  const inServerWishlist = useMemo(
    () => Boolean(data?.items.some((i) => i.productId === productId)),
    [data, productId],
  );
  const inLocalHold = pendingSet.has(productId);
  const inWishlist = isAuthenticated ? inServerWishlist : inLocalHold;

  const addM = useAddWishlistItem({
    mutation: {
      onSuccess: (resp) => {
        qc.setQueryData(getGetWishlistQueryKey(), resp);
        toast({ title: "Saved to wishlist" });
      },
    },
  });
  const removeM = useRemoveWishlistItem({
    mutation: {
      onSuccess: (resp) => {
        qc.setQueryData(getGetWishlistQueryKey(), resp);
        toast({ title: "Removed from wishlist" });
      },
    },
  });

  const pending = addM.isPending || removeM.isPending;

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) {
      if (disabledReason) {
        toast({ title: "Selection required", description: disabledReason });
      }
      return;
    }
    if (!isAuthenticated) {
      // Guest: maintain a soft, device-local hold. We never block the
      // interaction on sign-up — we just nudge the user toward an account
      // so the save actually persists.
      if (inLocalHold) {
        removeFromPendingWishlist(productId);
        toast({ title: "Removed from your saved items" });
      } else {
        addToPendingWishlist(productId);
        toast({
          title: "Held on this device",
          description:
            "Create an account or sign in to save it to your wishlist permanently.",
        });
      }
      return;
    }
    if (inServerWishlist) {
      removeM.mutate({ productId });
    } else {
      addM.mutate({ data: { productId } });
    }
  }

  if (variant === "button") {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || disabled}
        title={disabled ? disabledReason : undefined}
        className={`inline-flex items-center justify-center gap-2 px-6 py-3 text-sm uppercase tracking-widest font-medium border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      >
        <Heart
          className={`w-4 h-4 ${inWishlist ? "fill-current" : ""}`}
        />
        {inWishlist
          ? isAuthenticated
            ? "Saved to Wishlist"
            : "Held on This Device"
          : "Add to Wishlist"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending || disabled}
      aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
      title={
        disabled
          ? disabledReason
          : inWishlist
            ? isAuthenticated
              ? "Remove from wishlist"
              : "Held on this device — sign in to save permanently"
            : "Add to wishlist"
      }
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/95 shadow-sm hover:bg-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
    >
      <Heart
        className={`w-4 h-4 ${inWishlist ? "fill-primary text-primary" : "text-foreground/70"}`}
      />
    </button>
  );
}
