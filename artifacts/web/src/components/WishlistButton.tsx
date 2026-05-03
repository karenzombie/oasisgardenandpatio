import { useMemo } from "react";
import { useLocation } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import {
  useGetWishlist,
  useAddWishlistItem,
  useRemoveWishlistItem,
  getGetWishlistQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";

type Variant = "icon" | "button";

export function WishlistButton({
  productId,
  variant = "icon",
  className = "",
}: {
  productId: number;
  variant?: Variant;
  className?: string;
}) {
  const { isAuthenticated } = useAuth();
  const [location, navigate] = useLocation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data } = useGetWishlist({
    query: {
      queryKey: getGetWishlistQueryKey(),
      enabled: isAuthenticated,
      retry: false,
      staleTime: 30_000,
    },
  });
  const inWishlist = useMemo(
    () => Boolean(data?.items.some((i) => i.productId === productId)),
    [data, productId],
  );

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
    if (!isAuthenticated) {
      const next = encodeURIComponent(location);
      toast({
        title: "Sign in required",
        description: "Create an account or sign in to save items.",
      });
      navigate(`/login?next=${next}`);
      return;
    }
    if (inWishlist) {
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
        disabled={pending}
        className={`inline-flex items-center justify-center gap-2 px-6 py-3 text-sm uppercase tracking-widest font-medium border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-60 ${className}`}
      >
        <Heart
          className={`w-4 h-4 ${inWishlist ? "fill-current" : ""}`}
        />
        {inWishlist ? "Saved to Wishlist" : "Add to Wishlist"}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={pending}
      aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
      title={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/95 shadow-sm hover:bg-white transition-colors disabled:opacity-60 ${className}`}
    >
      <Heart
        className={`w-4 h-4 ${inWishlist ? "fill-primary text-primary" : "text-foreground/70"}`}
      />
    </button>
  );
}
