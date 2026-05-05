/**
 * Client-side "soft" wishlist hold for guests.
 *
 * Until a guest signs in, hearted products are tracked in localStorage so
 * the saved state persists across page reloads on the same device. When the
 * user authenticates, `useDrainPendingWishlist` (see `auth.tsx`) POSTs the
 * full set to /wishlist/sync and clears the local copy.
 */

const STORAGE_KEY = "oasis-pending-wishlist";

type Listener = (ids: ReadonlySet<number>) => void;
const listeners = new Set<Listener>();

function safeRead(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    const ids = parsed
      .map((n) => Number(n))
      .filter((n) => Number.isInteger(n) && n > 0);
    return new Set(ids);
  } catch {
    return new Set();
  }
}

function safeWrite(set: Set<number>): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Array.from(set)),
    );
  } catch {
    // Quota / private mode — soft failure, hold simply does not persist.
  }
  for (const fn of listeners) fn(set);
}

export function readPendingWishlist(): Set<number> {
  return safeRead();
}

export function addToPendingWishlist(productId: number): void {
  if (!Number.isInteger(productId) || productId <= 0) return;
  const set = safeRead();
  set.add(productId);
  safeWrite(set);
}

export function removeFromPendingWishlist(productId: number): void {
  const set = safeRead();
  if (!set.delete(productId)) return;
  safeWrite(set);
}

export function clearPendingWishlist(): void {
  safeWrite(new Set());
}

export function subscribePendingWishlist(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
