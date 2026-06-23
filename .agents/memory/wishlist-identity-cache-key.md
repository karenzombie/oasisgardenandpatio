---
name: Wishlist identity-scoped cache key
description: Why the wishlist React Query cache key must be scoped by identity, and how the guest insert race is handled.
---

# Wishlist cache must be keyed by identity

The wishlist is server-backed for BOTH guests (localStorage `oasis_device_token`,
rows with `user_id IS NULL`) and signed-in users (multi-config). The React Query
cache key MUST include identity: `[...base, "user:<id>"]` for signed-in,
`[...base, "guest:<deviceToken>"]` for guests (`wishlistKeyFor` in
`wishlistHold.ts`).

**Why:** A single shared key let a logged-out/guest session keep rendering the
previous authenticated user's wishlist from cache (params changed but the key did
not, so React Query served the stale entry). Including the user id also prevents
account-switching on the same browser from showing the prior user's items. Every
`setQueryData`/`useGetWishlist` consumer (Wishlist, AccountWishlist, Account,
WishlistButton, bootstrap merge) must use the scoped key, and broad invalidation
uses the base key (partial match hits all variants).

**How to apply:** Never reintroduce a single global wishlist query key. When
adding a new wishlist consumer, derive the key from `wishlistKeyFor(userId,
deviceToken)`; compute it at `onSuccess` time via `getDeviceToken()` because a
guest "add" may create the token mid-flight. `useWishlistItems` returns empty
items when the query is disabled so a brand-new guest never reads another
identity's entry.

# Guest add race → 409, not 500

Guest POST `/wishlist` pre-checks for an existing row, but concurrent adds of the
same product on the same device race past it and hit the partial unique index
`(device_token, product_id) WHERE user_id IS NULL`. Catch the PG unique violation
(SQLSTATE `23505`, `isUniqueViolation`) and map it to the same 409/replace flow
instead of leaking a 500.
