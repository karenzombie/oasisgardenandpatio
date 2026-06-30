---
name: Address defaults are per type
description: billing/shipping defaults are independent; default-clearing queries must scope by type
---

Customer addresses (`addressesTable.type` = 'billing' | 'shipping') maintain a
**separate default per type**. The storefront Account screen has dedicated
billing + shipping cards, each operating on the default address of its type.

**Rule:** any query that clears `isDefault` before setting a new default MUST
scope by `customerId` AND `type`. A `where customerId = ...` (no type) clears
the OTHER role's default too.

**Why:** before this was caught, the legacy `/account/addresses` POST/PATCH
cleared defaults across all of a customer's addresses, so setting a default
billing silently unset the default shipping. The role endpoint
(`PUT /account/addresses/role/:role`) was correct, but the older list endpoints
were not.

**How to apply:** when touching default-address logic in
`artifacts/api-server/src/routes/account.ts`, keep every `isDefault: false`
clear scoped to the same type. Clone-on-edit still applies: if the existing row
is referenced by an order (`isAddressReferencedByOrders`), archive it and insert
a fresh active row instead of mutating in place.
