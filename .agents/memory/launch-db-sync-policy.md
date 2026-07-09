---
name: Pre/post-launch DB sync policy
description: How dev(heliumdb)/prod(neondb) sync rules change at launch (.com domain connected to prod) — what becomes prod-locked and the required divergence-report workflow.
---

# Pre/post-launch DB sync policy

**Launch is defined as**: the moment the .com domain is connected to prod. This is a
hard cutover point — the sync rules before and after are fundamentally different, not
just a stricter version of the same rule.

## Pre-launch (current phase)
- All data/schema changes originate in dev; flow is dev → prod only.
- Scripts default to `DATABASE_URL` (heliumdb); `PROD_DATABASE_URL` is touched only for
  explicit, deliberate sync steps.
- Publishes push dev over prod (code + DB, including product data), but ANY diff found
  in ANY table (including transactional: orders/customers/vendor_orders/users) must be
  flagged for the user's review before publishing — never silently overwritten.

## Post-launch (takes over the instant the domain goes live)
- **Prod becomes the source of truth for all non-product data**: customers, orders,
  vendor orders, staff users, and anything else a customer/staff member can create or
  modify. Dev→prod syncs must NEVER overwrite, wipe, or alter this data in prod again,
  under any circumstance.
- **Every publish requires a full divergence analysis across ALL tables first**,
  producing a report categorizing each difference:
  1. **Product data divergence** — case-by-case; user decides per item whether to pull
     prod's version into dev or push dev's version to prod.
  2. **Customer/order/vendor-order/staff-user data** — ALWAYS preserve prod, never
     overwrite with dev, no exceptions (locked prod-only after launch).
  3. **Schema changes** — flagged separately from data; must be applied carefully so
     they don't break existing prod data.
- The agent never makes its own publish decision on any divergence. Every diff is
  described in plain English and held for explicit user approval before any action.

**Why:** once real customers/staff are using the live site, their data lives only in
prod and has no dev equivalent — a naive dev-wins sync would silently destroy real
transactions. This flips which environment is authoritative for the "who did what"
data half of the schema, while product/catalog data stays dev-authored.

**How to apply:** before touching this rule or running any post-launch sync, check
whether the .com domain has actually been connected to prod yet — if unsure, ask
before assuming which policy phase is active.
