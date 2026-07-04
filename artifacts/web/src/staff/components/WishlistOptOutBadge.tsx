import { Mail, MailX } from "lucide-react";

/**
 * Shared "marketing contact" badge (Brief 7, Step 5). Two states only:
 * OK to contact / Opted out. Used on the wishlist list view, wishlist
 * detail view, and the read-only row added to the existing customer modal.
 */
export function WishlistOptOutBadge({
  optedOut,
  size = "default",
}: {
  optedOut: boolean;
  size?: "default" | "sm";
}) {
  const sizeClass =
    size === "sm" ? "text-[12px] px-2 py-[3px]" : "text-xs px-2.5 py-1";
  if (optedOut) {
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClass}`}
        style={{ backgroundColor: "#FCEBEB", color: "#A32D2D" }}
      >
        <MailX className="size-3" />
        Opted out
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClass}`}
      style={{ backgroundColor: "#EAF3DE", color: "#3B6D11" }}
    >
      <Mail className="size-3" />
      OK to contact
    </span>
  );
}

export function formatOptOutDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return `Opted out ${d.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  })}`;
}
