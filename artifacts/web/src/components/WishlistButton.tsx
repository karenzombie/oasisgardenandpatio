import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Heart } from "lucide-react";
import {
  useAddWishlistItem,
  useRemoveWishlistItem,
  ApiError,
} from "@workspace/api-client-react";
import {
  useWishlistItems,
  ensureDeviceToken,
  wishlistKeyFor,
  getDeviceToken,
} from "@/lib/wishlistHold";
import { WishlistAccountPromptModal } from "@/components/WishlistAccountPromptModal";
import { useToast } from "@/hooks/use-toast";

type Variant = "icon" | "button";

/**
 * Save/remove a product to the wishlist.
 *
 * - mode="toggle" (default): a coarse per-product heart. Adds with no
 *   configuration when empty, removes the saved row when set. Used on cards.
 * - mode="add": always attempts to add the current configuration. Signed-in
 *   users accumulate multiple configurations; guests who already saved this
 *   product get the account-prompt modal. Used on the PDP option pickers.
 */
export function WishlistButton({
  productId,
  variant = "icon",
  className = "",
  disabled = false,
  disabledReason,
  mode = "toggle",
  selectedFinishId = null,
  selectedFabricId = null,
  selectedTableTopTileId = null,
}: {
  productId: number;
  variant?: Variant;
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
  mode?: "toggle" | "add";
  selectedFinishId?: number | null;
  selectedFabricId?: number | null;
  selectedTableTopTileId?: number | null;
}) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [promptOpen, setPromptOpen] = useState(false);

  const { items, isAuthenticated, userId, deviceToken } = useWishlistItems();
  const matching = useMemo(
    () => items.filter((i) => i.productId === productId),
    [items, productId],
  );
  const inWishlist = matching.length > 0;

  const addM = useAddWishlistItem({
    mutation: {
      onSuccess: (resp) => {
        qc.setQueryData(wishlistKeyFor(userId, getDeviceToken()), resp);
        setPromptOpen(false);
        toast({ title: "Saved to wishlist" });
      },
      onError: (err: unknown) => {
        // Guest tried to save a second configuration of this product.
        if (err instanceof ApiError && err.status === 409) {
          setPromptOpen(true);
          return;
        }
        toast({
          title: "Could not save to wishlist",
          description: "Please try again.",
        });
      },
    },
  });
  const removeM = useRemoveWishlistItem({
    mutation: {
      onSuccess: (resp) => {
        qc.setQueryData(wishlistKeyFor(userId, getDeviceToken()), resp);
        toast({ title: "Removed from wishlist" });
      },
    },
  });

  const pending = addM.isPending || removeM.isPending;

  function buildAddData(replaceExisting: boolean) {
    const config = {
      ...(selectedFinishId != null ? { selectedFinishId } : {}),
      ...(selectedFabricId != null ? { selectedFabricId } : {}),
      ...(selectedTableTopTileId != null ? { selectedTableTopTileId } : {}),
    };
    if (isAuthenticated) {
      return { productId, ...config };
    }
    const token = ensureDeviceToken();
    return {
      productId,
      deviceToken: token,
      ...config,
      ...(replaceExisting ? { replaceExisting: true } : {}),
    };
  }

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) {
      if (disabledReason) {
        toast({ title: "Selection required", description: disabledReason });
      }
      return;
    }

    // Toggle mode removes the existing row when the product is already saved.
    if (mode === "toggle" && inWishlist) {
      const row = matching[0];
      removeM.mutate({
        id: row.id,
        data: isAuthenticated ? {} : { deviceToken: deviceToken ?? "" },
      });
      return;
    }

    addM.mutate({ data: buildAddData(false) });
  }

  const nextUrl = encodeURIComponent(
    typeof window !== "undefined" ? window.location.pathname : "/",
  );

  const promptModal = (
    <WishlistAccountPromptModal
      open={promptOpen}
      onOpenChange={setPromptOpen}
      replacing={addM.isPending}
      onSignIn={() => {
        setPromptOpen(false);
        navigate(`/sign-in?redirect_url=${nextUrl}`);
      }}
      onCreateAccount={() => {
        setPromptOpen(false);
        navigate(`/sign-up?redirect_url=${nextUrl}`);
      }}
      onReplace={() => {
        addM.mutate({ data: buildAddData(true) });
      }}
    />
  );

  if (variant === "button") {
    const label =
      mode === "add"
        ? "Add to Wishlist"
        : inWishlist
          ? "Saved to Wishlist"
          : "Add to Wishlist";
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          disabled={pending || disabled}
          title={disabled ? disabledReason : undefined}
          className={`inline-flex items-center justify-center gap-2 px-6 py-3 text-sm uppercase tracking-widest font-medium border border-primary text-primary hover:bg-primary hover:text-primary-foreground transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
        >
          <Heart className={`w-4 h-4 ${inWishlist ? "fill-current" : ""}`} />
          {label}
        </button>
        {promptModal}
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={pending || disabled}
        aria-label={inWishlist ? "Remove from wishlist" : "Add to wishlist"}
        title={
          disabled
            ? disabledReason
            : inWishlist
              ? "Remove from wishlist"
              : "Add to wishlist"
        }
        className={`inline-flex items-center justify-center w-9 h-9 rounded-full bg-white/95 shadow-sm hover:bg-white transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${className}`}
      >
        <Heart
          className={`w-4 h-4 ${inWishlist ? "fill-primary text-primary" : "text-foreground/70"}`}
        />
      </button>
      {promptModal}
    </>
  );
}
