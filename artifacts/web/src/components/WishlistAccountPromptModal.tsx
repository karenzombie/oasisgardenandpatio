import { useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { SignInForm } from "@/components/auth/SignInForm";
import { useAuth } from "@/lib/auth";

/**
 * Shown when a guest uses a wishlist control. Explains that wishlists require
 * an account and offers sign-in, account creation, or a non-navigating dismiss.
 */
export function WishlistAccountPromptModal({
  open,
  onOpenChange,
  onCreateAccount,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreateAccount: () => void;
}) {
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (open && !isLoading && isAuthenticated) {
      onOpenChange(false);
    }
  }, [open, isLoading, isAuthenticated, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            Sign in to save to your wishlist
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Your wishlist is saved to your account, so it's there whenever you
            come back, on any device. Sign in or create a free account to save
            this item.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-2">
          <SignInForm showGoogle={false} />
          <button
            type="button"
            onClick={onCreateAccount}
            className="w-full border border-primary text-primary px-4 py-2.5 text-sm uppercase tracking-widest font-medium hover:bg-primary hover:text-primary-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="w-full px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground underline"
          >
            Keep browsing
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
