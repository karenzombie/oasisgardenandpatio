import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * Shown when a guest tries to save a second configuration of a product their
 * device already has saved. Offers to sign in / create an account (to unlock
 * multiple configurations, carrying the current wishlist over) or to replace
 * the existing saved configuration in place.
 */
export function WishlistAccountPromptModal({
  open,
  onOpenChange,
  onSignIn,
  onCreateAccount,
  onReplace,
  replacing = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSignIn: () => void;
  onCreateAccount: () => void;
  onReplace: () => void;
  replacing?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl">
            Want to save multiple configurations?
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Sign in or create a free account to save this product in as many
            finishes and fabrics as you like. Your current wishlist will carry
            over automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex flex-col gap-2">
          <button
            type="button"
            onClick={onSignIn}
            className="w-full bg-primary text-primary-foreground px-4 py-2.5 text-sm uppercase tracking-widest font-medium hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={onCreateAccount}
            className="w-full border border-primary text-primary px-4 py-2.5 text-sm uppercase tracking-widest font-medium hover:bg-primary hover:text-primary-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Create Account
          </button>
          <button
            type="button"
            onClick={onReplace}
            disabled={replacing}
            className="w-full px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground underline disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {replacing
              ? "Replacing…"
              : "Replace my saved configuration"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
