# Oasis Garden & Patio

## Overview

Full-stack e-commerce platform for Oasis Garden & Patio — a luxury outdoor furniture retailer in Santa Clarita, CA. Two completely separate UI shells: customer-facing storefront and staff/admin portal (role-based access). The platform supports online orders, in-store agent-created orders/quotes, inventory, purchasing, and CMS-managed content.

**Store**: 21182 Centre Pointe Pkwy #100, Santa Clarita, CA 91350 · (661) 255-9909 · sales@oasisgardenandpatio.com
**Hours**: Mon–Sat 10am–6pm, Sun 11am–5pm

## Stack

- **Monorepo**: pnpm workspaces, TypeScript 5.9, Node.js 24
- **Frontend**: React + Vite (`artifacts/web`), wouter routing, TanStack Query, Tailwind + shadcn/ui
- **API**: Express 5 (`artifacts/api-server`), contract-first via OpenAPI (`lib/api-spec`), Orval codegen → React Query hooks + Zod schemas
- **DB**: PostgreSQL + Drizzle ORM (`lib/db`), schema split by domain into 12 files
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **Logging**: Pino (`req.log` in routes, `logger` elsewhere — never `console.log` in server code)

## Architecture Decisions

- **Two-shell UI**: Customer shell (site header + footer) and staff shell (sidebar + topbar) share **zero** layout components. Customer routes: `/`, `/shop`, `/account`, `/cart`, `/checkout`. Staff routes: `/staff`, `/agent`, `/admin`.
- **Identity model**: Two-table — `users` (auth credentials) and `customers` (contact/order info). One customer per user account is enforced via a partial unique index on `customers.user_id` (where not null), so in-store customers without accounts are still allowed.
- **Order numbering**: `OG-YYYY-XXXXX` format.
- **Payments**: Authorize.net via Accept.js (client-side tokenization). Agent-created orders skip the payment step entirely (in-store payment handled at register).
- **Tax**: TaxJar for online orders; flat 10.25% (Santa Clarita) for agent/in-store orders.
- **Staff portal palette**: sidebar/headers `#1A3C5E`, content background `#F5F7FA`.
- **Customer brand**: refined coastal-California aesthetic. Logo at `artifacts/web/src/assets/logo.png` appears on every customer page.

## Build Plan (7 phases)

1. **Foundation** ✅ — DB schema, OpenAPI spec, public read-only routes (legal, banners, manufacturers, categories, products/featured), customer site shell
2. **Customer auth** ✅ — email/password (bcryptjs rounds=12), session cookies (express-session + connect-pg-simple), 3 roles (customer/agent/admin), 8 endpoints (signup/login/logout/me/verify-email/resend-verification/request-password-reset/reset-password), branded transactional emails via Resend (Replit connector). Tokens stored as SHA-256 hashes, atomically consumed via `UPDATE…RETURNING`. Rate limiting: login 10/15min/IP, password-reset 5/hr/(IP+email), resend-verification 5/hr/user. Frontend: `/login`, `/signup`, `/forgot-password`, `/reset-password`, `/verify-email`, `/account`; auth-aware header dropdown; `useAuth()` hook in `artifacts/web/src/lib/auth.tsx`.
3. **Catalog browsing** — product list, filters, PDP
4. **Cart + checkout** — Authorize.net, TaxJar, shipping
5. **Customer account** — order history, addresses
6. **Staff portal** — agent-created orders, inventory, purchasing
7. **Admin portal** — manufacturers, categories, products, CMS, users, reports

## Integrations

- **Resend** ✅ — transactional email. API key in `Resend_API` secret (preferred); falls back to the Replit connector. Sender comes from `RESEND_FROM_EMAIL` (env), else `onboarding@resend.dev`. **Currently in test mode**: account has no verified sender domain, so emails only deliver to the Resend account owner's address. Before launch: verify `oasisgardenandpatio.com` (or another domain) at resend.com/domains and set `RESEND_FROM_EMAIL` to e.g. `noreply@oasisgardenandpatio.com`. All other auth flows work regardless.
- Authorize.net (payments), TaxJar (tax), Google Drive (PO attachments), Replit Object Storage (product images) — planned.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks + Zod schemas after editing `lib/api-spec/openapi.yaml`
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/scripts exec tsx src/seed.ts` — idempotent seed (categories, legal docs, banners)

## Important Files

- `lib/db/src/schema/index.ts` — barrel for 12 domain schema files
- `lib/api-spec/openapi.yaml` — single source of truth for API contract
- `artifacts/api-server/src/routes/index.ts` — route registry
- `scripts/src/seed.ts` — idempotent seed script
- `artifacts/web/src/App.tsx` — frontend routing entry
- `attached_assets/Oasis_Build_Spec_v2.5_*.docx` — primary spec
- `attached_assets/Oasis_Addendum_1_*.docx` — staff/admin portal spec

## Working style with this user

User explicitly directed: **ask rather than assume on ambiguous build decisions** — never guess direction on anything material.

## Product decisions

- **Signup email enumeration**: intentionally returning a clear 409 ("An account with that email already exists") on duplicate signup. Friendlier UX over the more private silent/no-enumeration alternative. Password-reset, by contrast, IS no-enumeration (always 204).
