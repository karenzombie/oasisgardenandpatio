// Wishlist parent record reference number generator (Brief 7, Step 5).
// Format: WISH-XXXXXXXX-XXXX where X is uppercase alphanumeric, mirroring
// the ORD-/VO- numbering pattern used elsewhere (adminOrders.ts, vendor
// orders). One number per customer, generated on their first-ever save.
export function generateWishlistNumber(): string {
  const ts = Date.now().toString(36).toUpperCase().padStart(8, "0").slice(-8);
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "0");
  return `WISH-${ts}-${rand}`;
}
